import {
  cleanupAppTest,
  createDashboardData,
  createDeterministicLlmStatus,
  createModelDiscoveryResponse,
  createModelProfile,
  createRealLlmStatus,
  createRuntimeSettingsResponse,
  getApiMock,
  renderReady,
  setupAppTest
} from "./App.testHarness";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiError } from "./lib/apiClient";
import { en } from "./i18n/en";

const apiMock = getApiMock();

describe("App model and desktop settings", () => {
  beforeEach(setupAppTest);
  afterEach(cleanupAppTest);
  it("runs a model provider smoke test without exposing browser-side keys", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    await waitFor(() =>
      expect(apiMock.createAiSession).toHaveBeenCalledWith({
        languageId: "avenik",
        mode: "learner_practice",
        seedPrompt: en["model.smokeTest.seedPrompt"],
        contextNoteIds: ["avn-rule-verb-chain-note", "avn-rule-case-note"],
        contextPassageIds: ["avn-c001"]
      })
    );
    expect(await screen.findByText("Safe practice prompt from provider.")).toBeInTheDocument();
  });

  it("flags the smoke-test result as an offline placeholder in deterministic mode", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    expect(await screen.findByText("Safe practice prompt from provider.")).toBeInTheDocument();
    expect(await screen.findByText(/Offline placeholder/)).toBeInTheDocument();
    expect(
      screen.getByText(/no model is configured, so this is a canned response, not a real model reply/)
    ).toBeInTheDocument();
  });

  it("treats the smoke-test result as a real model reply when a provider is configured", async () => {
    apiMock.fetchLlmStatus.mockResolvedValue(createRealLlmStatus());
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
    apiMock.createAiSession.mockResolvedValue({
      messages: [{ role: "assistant", content: "Genuine model practice prompt." }],
      trace: []
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    expect(await screen.findByText("Genuine model practice prompt.")).toBeInTheDocument();
    expect(screen.queryByText(/Offline placeholder/)).not.toBeInTheDocument();
  });

  it("activates a saved model profile and updates runtime settings in the form", async () => {
    const ireneLocal = createModelProfile({
      id: "irene-local",
      name: "Irene local",
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "irene-fusion",
      timeoutMs: 180000,
      maxTokens: 8192
    });
    const studioSmall = createModelProfile({
      id: "studio-small",
      name: "Studio small",
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "irene-small",
      timeoutMs: 90000,
      maxTokens: 4096
    });
    const profiles = [ireneLocal, studioSmall];
    const initialStatus = {
      ...createRealLlmStatus(),
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "irene-fusion",
      timeoutMs: 180000
    };
    const activatedStatus = {
      ...createRealLlmStatus(),
      provider: "lm-studio",
      mode: "local-openai-compatible",
      activeProviderName: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "irene-small",
      timeoutMs: 90000
    };

    apiMock.fetchLlmStatus.mockResolvedValue(initialStatus);
    apiMock.fetchRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse(initialStatus, {
        profiles,
        activeProfileId: "irene-local"
      })
    );
    apiMock.activateModelProfile.mockResolvedValue(
      createRuntimeSettingsResponse(activatedStatus, {
        profiles,
        activeProfileId: "studio-small"
      })
    );

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const profileSelect = await screen.findByLabelText("Saved profiles");
    expect(profileSelect).toHaveValue("irene-local");
    await waitFor(() => {
      expect(screen.getByLabelText("Provider")).toHaveValue("openai-compatible");
      expect(screen.getByLabelText("Base URL")).toHaveValue("http://127.0.0.1:11434/v1");
      expect(screen.getByLabelText("Model")).toHaveValue("irene-fusion");
    });

    fireEvent.change(profileSelect, { target: { value: "studio-small" } });

    await waitFor(() => expect(apiMock.activateModelProfile).toHaveBeenCalledWith("studio-small"));
    await waitFor(() => {
      expect(screen.getByLabelText("Saved profiles")).toHaveValue("studio-small");
      expect(screen.getByLabelText("Provider")).toHaveValue("lm-studio");
      expect(screen.getByLabelText("Base URL")).toHaveValue("http://127.0.0.1:1234/v1");
      expect(screen.getByLabelText("Model")).toHaveValue("irene-small");
      expect(screen.getByLabelText("Timeout")).toHaveValue(90000);
    });
    expect(screen.getByText("Model profile applied.")).toBeInTheDocument();
  });

  it("saves runtime model settings from the Settings screen", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Provider"), {
      target: { value: "openai-compatible" }
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "http://127.0.0.1:11434/v1" }
    });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "irene-fusion" }
    });
    fireEvent.change(screen.getByLabelText("Replace API key"), {
      target: { value: "local-secret" }
    });
    fireEvent.change(screen.getByLabelText("Timeout"), {
      target: { value: "180000" }
    });
    fireEvent.change(screen.getByLabelText("Max tokens"), {
      target: { value: "8192" }
    });
    fireEvent.click(screen.getByLabelText("JSON mode"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() =>
      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "irene-fusion",
          apiKey: "local-secret",
          timeoutMs: 180000,
          maxTokens: 8192,
          jsonMode: true
        })
      )
    );
    expect(await screen.findByText("Settings saved and applied.")).toBeInTheDocument();
  });

  it("surfaces desktop shell actions in the Settings screen", async () => {
    const openDataFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened data folder." });
    const openSettingsFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened settings folder." });
    const openBackupsFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened backups folder." });
    const openAppFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened app folder." });
    const openDiagnosticsFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened diagnostics folder." });
    const openLatestBackupFolder = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Opened latest backup backup-2026-07-07T21-00-00-000Z." });
    const resetWindowLayout = vi.fn().mockResolvedValue({ ok: true, message: "Reset window layout." });
    const pruneOldDataBackups = vi.fn().mockImplementation(async () => {
      currentBackupSummary = {
        ...currentBackupSummary,
        count: 5
      };
      return { ok: true, message: "Pruned 1 old backup.", backupSummary: currentBackupSummary };
    });
    let currentShortcutSummary = {
      desktopExists: false,
      desktopPath: "C:\\Users\\Demon\\Desktop\\AssiniLang.lnk",
      startMenuExists: false,
      startMenuPath: "C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk"
    };
    const createDesktopShortcut = vi.fn().mockImplementation(async () => {
      currentShortcutSummary = {
        ...currentShortcutSummary,
        desktopExists: true
      };
      return { ok: true, message: "Created desktop shortcut.", shortcutSummary: currentShortcutSummary };
    });
    const createStartMenuShortcut = vi.fn().mockImplementation(async () => {
      currentShortcutSummary = {
        ...currentShortcutSummary,
        startMenuExists: true
      };
      return { ok: true, message: "Created Start Menu shortcut.", shortcutSummary: currentShortcutSummary };
    });
    const createAppShortcuts = vi.fn().mockImplementation(async () => {
      currentShortcutSummary = {
        ...currentShortcutSummary,
        desktopExists: true,
        startMenuExists: true
      };
      return { ok: true, message: "Created app shortcuts.", shortcutSummary: currentShortcutSummary };
    });
    let currentBackupSummary = {
      backupsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups",
      count: 1,
      latestCreatedAt: "2026-07-07T20:00:00.000Z",
      latestName: "backup-2026-07-07T20-00-00-000Z",
      latestPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups\\backup-2026-07-07T20-00-00-000Z"
    };
    const createDataBackup = vi.fn().mockImplementation(async () => {
      currentBackupSummary = {
        ...currentBackupSummary,
        count: 6,
        latestCreatedAt: "2026-07-07T21:00:00.000Z",
        latestName: "backup-2026-07-07T21-00-00-000Z",
        latestPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups\\backup-2026-07-07T21-00-00-000Z"
      };
      return { ok: true, message: "Created backup at C:\\Backups\\assini.", backupSummary: currentBackupSummary };
    });
    const restoreLatestDataBackup = vi.fn().mockResolvedValue({
      ok: true,
      message: "Restored latest backup. Reloading workspace...",
      backupSummary: currentBackupSummary
    });
    const refreshBackupSummary = vi
      .fn()
      .mockImplementation(async () => ({ ok: true, backupSummary: currentBackupSummary }));
    const refreshShortcutSummary = vi
      .fn()
      .mockImplementation(async () => ({ ok: true, shortcutSummary: currentShortcutSummary }));
    const saveDiagnosticsReport = vi.fn().mockResolvedValue({
      ok: true,
      message:
        "Saved diagnostics report at C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics\\diagnostics-2026-07-07.txt",
      diagnosticsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
      diagnosticsPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics\\diagnostics-2026-07-07.txt"
    });
    let currentDesktopPreferences = {
      hideToTray: false,
      hideToTraySupported: true,
      launchAtLogin: false,
      launchAtLoginSupported: true
    };
    const setDesktopPreferences = vi.fn().mockImplementation(async (patch) => {
      currentDesktopPreferences = {
        ...currentDesktopPreferences,
        ...patch
      };
      return {
        ok: true,
        message: "Desktop preference saved.",
        preferences: currentDesktopPreferences
      };
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    apiMock.fetchLlmStatus.mockResolvedValue(createRealLlmStatus());
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
    apiMock.fetchDiscoveredModels.mockResolvedValue(
      createModelDiscoveryResponse(
        [
          {
            id: "openai-compatible|http://127.0.0.1:11434/v1|llama3.1",
            provider: "openai-compatible",
            providerLabel: "OpenAI-compatible",
            source: "Requested endpoint",
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "llama3.1",
            requiresApiKey: false
          }
        ],
        [
          {
            source: "Requested endpoint",
            baseUrl: "http://127.0.0.1:11434/v1",
            provider: "openai-compatible",
            providerLabel: "OpenAI-compatible",
            connected: true,
            modelCount: 1,
            status: 200
          }
        ]
      )
    );
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        appFolder: "C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang",
        appPath: "C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang\\AssiniLang.exe",
        appVersion: "0.1.0",
        authToken: "desktop-token",
        get backupSummary() {
          return currentBackupSummary;
        },
        createAppShortcuts,
        createDataBackup,
        createDesktopShortcut,
        createStartMenuShortcut,
        dataDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data",
        diagnosticsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
        get desktopPreferences() {
          return currentDesktopPreferences;
        },
        isPackaged: true,
        openAppFolder,
        openBackupsFolder,
        openDataFolder,
        openDiagnosticsFolder,
        openLatestBackupFolder,
        openSettingsFolder,
        pruneOldDataBackups,
        prototypeAuth: true,
        refreshBackupSummary,
        refreshShortcutSummary,
        restoreLatestDataBackup,
        resetWindowLayout,
        saveDiagnosticsReport,
        setDesktopPreferences,
        get shortcutSummary() {
          return currentShortcutSummary;
        },
        settingsPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env"
      }
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Desktop app")).toBeInTheDocument();
    expect(screen.getByText("App version")).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText("App folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang")).toBeInTheDocument();
    expect(screen.getByText("Data folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data")).toBeInTheDocument();
    expect(screen.getByText("Settings file")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env")).toBeInTheDocument();
    expect(screen.getByText("Backups folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Backups saved")).toBeInTheDocument();
    expect(screen.getByText("1 backups")).toBeInTheDocument();
    expect(screen.getByText("Latest backup")).toBeInTheDocument();
    expect(screen.getByText("backup-2026-07-07T20-00-00-000Z")).toBeInTheDocument();
    expect(await screen.findByText("Desktop shortcut")).toBeInTheDocument();
    const desktopShortcutStatus = screen.getByText("Desktop shortcut").closest("div")!;
    const startMenuShortcutStatus = screen.getByText("Start Menu shortcut").closest("div")!;
    expect(within(desktopShortcutStatus).getByText("Not installed")).toBeInTheDocument();
    expect(within(desktopShortcutStatus).getByText("C:\\Users\\Demon\\Desktop\\AssiniLang.lnk")).toBeInTheDocument();
    expect(within(startMenuShortcutStatus).getByText("Not installed")).toBeInTheDocument();
    expect(
      within(startMenuShortcutStatus).getByText(
        "C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk"
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prune old backups" })).toBeDisabled();
    await waitFor(() => expect(refreshShortcutSummary).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Desktop app actions")).toBeInTheDocument();
    expect(screen.getByText("Recovery")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Folders")).toBeInTheDocument();
    expect(screen.getByText("Backups")).toBeInTheDocument();
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='recovery']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='diagnostics']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='folders']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='backups']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='shortcuts']")).toBeInTheDocument();

    expect(screen.getByLabelText("Launch at sign-in")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Launch at sign-in"));
    await waitFor(() => expect(setDesktopPreferences).toHaveBeenCalledWith({ launchAtLogin: true }));
    expect(await screen.findByText("Desktop preference saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Launch at sign-in")).toBeChecked();

    expect(screen.getByLabelText("Hide to tray on close")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Hide to tray on close"));
    await waitFor(() => expect(setDesktopPreferences).toHaveBeenLastCalledWith({ hideToTray: true }));
    expect(screen.getByLabelText("Hide to tray on close")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Reset window layout" }));
    await waitFor(() => expect(resetWindowLayout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Reset window layout.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Replace API key"), {
      target: { value: "local-secret" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const diagnostics = writeText.mock.calls[0][0] as string;
    expect(diagnostics).toContain("AssiniLang Desktop diagnostics");
    expect(diagnostics).toContain("App version: 0.1.0");
    expect(diagnostics).toContain(
      "App executable: C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang\\AssiniLang.exe"
    );
    expect(diagnostics).toContain("App folder: C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang");
    expect(diagnostics).toContain("Data folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data");
    expect(diagnostics).toContain("Settings file: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env");
    expect(diagnostics).toContain("Backups folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups");
    expect(diagnostics).toContain("Diagnostics folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics");
    expect(diagnostics).toContain("Backups available: 1");
    expect(diagnostics).toContain("Latest backup: backup-2026-07-07T20-00-00-000Z");
    expect(diagnostics).toContain("Desktop shortcut: not installed");
    expect(diagnostics).toContain("Desktop shortcut path: C:\\Users\\Demon\\Desktop\\AssiniLang.lnk");
    expect(diagnostics).toContain("Start Menu shortcut: not installed");
    expect(diagnostics).toContain(
      "Start Menu shortcut path: C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk"
    );
    expect(diagnostics).toContain("Launch at sign-in: yes");
    expect(diagnostics).toContain("Hide to tray on close: yes");
    expect(diagnostics).toContain("Provider: openai-compatible");
    expect(diagnostics).toContain("Model: llama3.1");
    expect(diagnostics).toContain("Models: 1");
    expect(diagnostics).toContain("connected http://127.0.0.1:11434/v1");
    expect(diagnostics).not.toContain("local-secret");
    expect(await screen.findByText("Diagnostics copied to clipboard.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save diagnostics report" }));
    await waitFor(() => expect(saveDiagnosticsReport).toHaveBeenCalledTimes(1));
    const savedDiagnostics = saveDiagnosticsReport.mock.calls[0][0] as string;
    expect(savedDiagnostics).toContain("AssiniLang Desktop diagnostics");
    expect(savedDiagnostics).toContain("App version: 0.1.0");
    expect(savedDiagnostics).toContain(
      "Diagnostics folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics"
    );
    expect(savedDiagnostics).not.toContain("local-secret");
    expect(
      await screen.findByText(
        "Saved diagnostics report at C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics\\diagnostics-2026-07-07.txt"
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open app folder" }));
    await waitFor(() => expect(openAppFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened app folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open data folder" }));
    await waitFor(() => expect(openDataFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened data folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open diagnostics folder" }));
    await waitFor(() => expect(openDiagnosticsFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened diagnostics folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create data backup" }));
    await waitFor(() => expect(createDataBackup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created backup at C:\\Backups\\assini.")).toBeInTheDocument();
    expect(await screen.findByText("6 backups")).toBeInTheDocument();
    expect(screen.getByText("backup-2026-07-07T21-00-00-000Z")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prune old backups" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Prune old backups" }));
    const pruneDialog = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.click(within(pruneDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirmation" })).not.toBeInTheDocument());
    expect(pruneOldDataBackups).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Prune old backups" }));
    const pruneDialogRetry = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.click(within(pruneDialogRetry).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(pruneOldDataBackups).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Pruned 1 old backup.")).toBeInTheDocument();
    expect(await screen.findByText("5 backups")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
    const restoreDialog = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirmation" })).not.toBeInTheDocument());
    expect(restoreLatestDataBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
    const restoreDialogRetry = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.click(within(restoreDialogRetry).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(restoreLatestDataBackup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Restored latest backup. Reloading workspace...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open backups folder" }));
    await waitFor(() => expect(openBackupsFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened backups folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open latest backup" }));
    await waitFor(() => expect(openLatestBackupFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened latest backup backup-2026-07-07T21-00-00-000Z.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set up app shortcuts" }));
    await waitFor(() => expect(createAppShortcuts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created app shortcuts.")).toBeInTheDocument();
    expect(within(screen.getByText("Desktop shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();
    expect(within(screen.getByText("Start Menu shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create desktop shortcut" }));
    await waitFor(() => expect(createDesktopShortcut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created desktop shortcut.")).toBeInTheDocument();
    expect(within(screen.getByText("Desktop shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Start Menu shortcut" }));
    await waitFor(() => expect(createStartMenuShortcut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created Start Menu shortcut.")).toBeInTheDocument();
    expect(within(screen.getByText("Start Menu shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();
    expect(openSettingsFolder).not.toHaveBeenCalled();
  });

  it("applies runtime model settings from a discovered model selection", async () => {
    const discoveredId = "openai-compatible|http://irene-box:8080/v1|irene-fusion";
    apiMock.updateRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "openai-compatible",
        baseUrl: "http://irene-box:8080/v1",
        model: "irene-fusion"
      })
    );
    apiMock.fetchDiscoveredModels.mockResolvedValue(
      createModelDiscoveryResponse(
        [
          {
            id: discoveredId,
            provider: "openai-compatible",
            providerLabel: "OpenAI-compatible",
            source: "Requested endpoint",
            baseUrl: "http://irene-box:8080/v1",
            model: "irene-fusion",
            requiresApiKey: false
          },
          {
            id: "openai-compatible|http://irene-box:8080/v1|irene-small",
            provider: "openai-compatible",
            providerLabel: "OpenAI-compatible",
            source: "Requested endpoint",
            baseUrl: "http://irene-box:8080/v1",
            model: "irene-small",
            requiresApiKey: false
          }
        ],
        [
          {
            source: "Requested endpoint",
            baseUrl: "http://irene-box:8080/v1",
            provider: "openai-compatible",
            providerLabel: "OpenAI-compatible",
            connected: true,
            modelCount: 2,
            status: 200
          }
        ]
      )
    );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("option", { name: /irene-fusion/ });
    expect(screen.getByText(/Last automatic model scan:/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Discovered models"), {
      target: { value: discoveredId }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Provider")).toHaveValue("openai-compatible");
      expect(screen.getByLabelText("Base URL")).toHaveValue("http://irene-box:8080/v1");
      expect(screen.getByLabelText("Model")).toHaveValue("irene-fusion");
    });
    expect(
      screen.getByText("Model catalog available at http://irene-box:8080/v1: 2 models (irene-fusion, irene-small).")
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai-compatible",
          baseUrl: "http://irene-box:8080/v1",
          model: "irene-fusion",
          timeoutMs: 180000,
          maxTokens: 4096
        })
      )
    );
    expect(await screen.findByText("Settings saved and applied.")).toBeInTheDocument();
  });

  it("automatically applies one discovered no-key model when settings are empty", async () => {
    const discoveredId = "lm-studio|http://127.0.0.1:1234/v1|irene-fusion";
    apiMock.updateRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "irene-fusion"
      })
    );
    apiMock.fetchDiscoveredModels.mockResolvedValue(
      createModelDiscoveryResponse(
        [
          {
            id: discoveredId,
            provider: "lm-studio",
            providerLabel: "LM Studio",
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            model: "irene-fusion",
            requiresApiKey: false
          }
        ],
        [
          {
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            provider: "lm-studio",
            providerLabel: "LM Studio",
            connected: true,
            modelCount: 1,
            status: 200
          }
        ]
      )
    );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() =>
      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "lm-studio",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "irene-fusion",
          timeoutMs: 180000,
          maxTokens: 4096,
          jsonMode: false
        })
      )
    );
    expect(await screen.findByText("Settings saved and applied.")).toBeInTheDocument();
    expect(screen.getByLabelText("Discovered models")).toHaveValue(discoveredId);
  });

  it("does not automatically apply discovered models when more than one model is available", async () => {
    apiMock.fetchDiscoveredModels.mockResolvedValue(
      createModelDiscoveryResponse(
        [
          {
            id: "lm-studio|http://127.0.0.1:1234/v1|irene-fusion",
            provider: "lm-studio",
            providerLabel: "LM Studio",
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            model: "irene-fusion",
            requiresApiKey: false
          },
          {
            id: "lm-studio|http://127.0.0.1:1234/v1|irene-small",
            provider: "lm-studio",
            providerLabel: "LM Studio",
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            model: "irene-small",
            requiresApiKey: false
          }
        ],
        [
          {
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            provider: "lm-studio",
            providerLabel: "LM Studio",
            connected: true,
            modelCount: 2,
            status: 200
          }
        ]
      )
    );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /irene-fusion/ })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /irene-small/ })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Discovered models")).toHaveValue(""));
    expect(apiMock.updateRuntimeSettings).not.toHaveBeenCalled();
  });

  it("shows readable labels for path-like discovered model names without changing the saved value", async () => {
    const fullModelPath = "C:\\models\\Irene\\irene-fusion-Q4_K_M.gguf";
    const discoveredId = `lm-studio|http://127.0.0.1:1234/v1|${fullModelPath}`;
    apiMock.fetchRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: fullModelPath
      })
    );
    apiMock.fetchDiscoveredModels.mockResolvedValue(
      createModelDiscoveryResponse(
        [
          {
            id: discoveredId,
            provider: "lm-studio",
            providerLabel: "LM Studio",
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            model: fullModelPath,
            requiresApiKey: false
          }
        ],
        [
          {
            source: "LM Studio local",
            baseUrl: "http://127.0.0.1:1234/v1",
            provider: "lm-studio",
            providerLabel: "LM Studio",
            connected: true,
            modelCount: 1,
            status: 200
          }
        ]
      )
    );

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const discoveredOption = await screen.findByRole("option", {
      name: "irene-fusion-Q4_K_M.gguf | LM Studio"
    });
    expect(discoveredOption).toBeInTheDocument();
    expect(discoveredOption).toHaveAttribute("title", `${fullModelPath} (LM Studio, http://127.0.0.1:1234/v1)`);
    expect(
      screen.getByText("Model catalog available: irene-fusion-Q4_K_M.gguf at http://127.0.0.1:1234/v1.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("irene-fusion-Q4_K_M.gguf").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue(fullModelPath));
    expect(screen.getByLabelText("Discovered models")).toHaveValue(discoveredId);
  });

  it("replaces stale discovered models when the list is refreshed", async () => {
    const oldModelId = "lm-studio|http://127.0.0.1:1234/v1|old-loaded-model";
    const newModelId = "lm-studio|http://127.0.0.1:1234/v1|new-loaded-model";
    apiMock.updateRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "new-loaded-model"
      })
    );
    apiMock.fetchRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "old-loaded-model"
      })
    );
    apiMock.fetchDiscoveredModels
      .mockResolvedValueOnce(
        createModelDiscoveryResponse(
          [
            {
              id: oldModelId,
              provider: "lm-studio",
              providerLabel: "LM Studio",
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              model: "old-loaded-model",
              requiresApiKey: false
            }
          ],
          [
            {
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              provider: "lm-studio",
              providerLabel: "LM Studio",
              connected: true,
              modelCount: 1,
              status: 200
            }
          ]
        )
      )
      .mockResolvedValueOnce(
        createModelDiscoveryResponse(
          [
            {
              id: newModelId,
              provider: "lm-studio",
              providerLabel: "LM Studio",
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              model: "new-loaded-model",
              requiresApiKey: false
            }
          ],
          [
            {
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              provider: "lm-studio",
              providerLabel: "LM Studio",
              connected: true,
              modelCount: 1,
              status: 200
            }
          ]
        )
      );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /old-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Discovered models")).toHaveValue(oldModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("old-loaded-model");
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));

    expect(await screen.findByRole("option", { name: /new-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /old-loaded-model/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Discovered models")).toHaveValue(newModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("new-loaded-model");
    });
    expect(
      screen.getByText(
        "Saved model old-loaded-model is no longer loaded at http://127.0.0.1:1234/v1. The form now shows new-loaded-model; apply it to switch immediately."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply loaded model" }));

    await waitFor(() =>
      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "lm-studio",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "new-loaded-model"
        })
      )
    );
  });

  it("automatically refreshes discovered models when the Settings screen regains focus", async () => {
    const oldModelId = "lm-studio|http://127.0.0.1:1234/v1|old-loaded-model";
    const newModelId = "lm-studio|http://127.0.0.1:1234/v1|new-loaded-model";
    apiMock.fetchRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "old-loaded-model"
      })
    );
    apiMock.fetchDiscoveredModels
      .mockResolvedValueOnce(
        createModelDiscoveryResponse(
          [
            {
              id: oldModelId,
              provider: "lm-studio",
              providerLabel: "LM Studio",
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              model: "old-loaded-model",
              requiresApiKey: false
            }
          ],
          [
            {
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              provider: "lm-studio",
              providerLabel: "LM Studio",
              connected: true,
              modelCount: 1,
              status: 200
            }
          ]
        )
      )
      .mockResolvedValueOnce(
        createModelDiscoveryResponse(
          [
            {
              id: newModelId,
              provider: "lm-studio",
              providerLabel: "LM Studio",
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              model: "new-loaded-model",
              requiresApiKey: false
            }
          ],
          [
            {
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              provider: "lm-studio",
              providerLabel: "LM Studio",
              connected: true,
              modelCount: 1,
              status: 200
            }
          ]
        )
      );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /old-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Discovered models")).toHaveValue(oldModelId));

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await screen.findByRole("option", { name: /new-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /old-loaded-model/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Discovered models")).toHaveValue(newModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("new-loaded-model");
    });
  });

  it("uses a restrained discovery polling interval and refreshes when Settings becomes visible", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    try {
      await renderReady();

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(await screen.findByLabelText("Discovered models")).toBeInTheDocument();
      expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
      const discoveryCalls = apiMock.fetchDiscoveredModels.mock.calls.length;

      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(apiMock.fetchDiscoveredModels).toHaveBeenCalledTimes(discoveryCalls + 1));
    } finally {
      if (visibilityDescriptor) {
        Object.defineProperty(document, "visibilityState", visibilityDescriptor);
      } else {
        Reflect.deleteProperty(document, "visibilityState");
      }
    }
  });

  it("surfaces unloaded-model stale state when discovery no longer lists the saved model", async () => {
    const oldModelId = "lm-studio|http://127.0.0.1:1234/v1|old-loaded-model";
    apiMock.updateRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createDeterministicLlmStatus(),
        provider: "deterministic",
        mode: "deterministic",
        configured: true,
        activeProviderName: "deterministic",
        baseUrl: undefined,
        model: undefined,
        warnings: ["Using deterministic fallback; no external LLM calls will be made."]
      })
    );
    apiMock.fetchRuntimeSettings.mockResolvedValue(
      createRuntimeSettingsResponse({
        ...createRealLlmStatus(),
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "old-loaded-model"
      })
    );
    apiMock.fetchDiscoveredModels
      .mockResolvedValueOnce(
        createModelDiscoveryResponse(
          [
            {
              id: oldModelId,
              provider: "lm-studio",
              providerLabel: "LM Studio",
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              model: "old-loaded-model",
              requiresApiKey: false
            }
          ],
          [
            {
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              provider: "lm-studio",
              providerLabel: "LM Studio",
              connected: true,
              modelCount: 1,
              status: 200
            }
          ]
        )
      )
      .mockResolvedValueOnce(
        createModelDiscoveryResponse(
          [],
          [
            {
              source: "LM Studio local",
              baseUrl: "http://127.0.0.1:1234/v1",
              provider: "lm-studio",
              providerLabel: "LM Studio",
              connected: true,
              modelCount: 0,
              status: 200
            }
          ]
        )
      );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /old-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Discovered models")).toHaveValue(oldModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("old-loaded-model");
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /old-loaded-model/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Discovered models")).toHaveValue("");
      expect(screen.getByLabelText("Model")).toHaveValue("");
    });
    expect(
      screen.getByText("The endpoint at http://127.0.0.1:1234/v1 responded, but its catalog listed no models.")
    ).toBeInTheDocument();
    const staleNotice = screen.getByText(
      "Saved model old-loaded-model is no longer loaded at http://127.0.0.1:1234/v1. Choose another discovered model or switch back to offline mode."
    );
    expect(staleNotice).toBeInTheDocument();
    expect(staleNotice.closest(".stale-model-notice")).toHaveAttribute("role", "status");

    fireEvent.click(screen.getByRole("button", { name: "Use offline mode" }));

    await waitFor(() =>
      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "deterministic",
          baseUrl: "",
          model: "",
          clearApiKey: true
        })
      )
    );
  });

  it("reports a clear connection failure for an unreachable requested endpoint", async () => {
    apiMock.fetchDiscoveredModels.mockResolvedValue(
      createModelDiscoveryResponse(
        [],
        [
          {
            source: "Requested endpoint",
            baseUrl: "http://offline-box:8080/v1",
            provider: "openai-compatible",
            providerLabel: "OpenAI-compatible",
            connected: false,
            modelCount: 0,
            detail: "Could not connect to the endpoint. Check that the model server is running."
          }
        ]
      )
    );
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(
      await screen.findByText(
        "Could not connect to http://offline-box:8080/v1: Could not connect to the endpoint. Check that the model server is running."
      )
    ).toBeInTheDocument();
  });

  it("checks LLM reachability and reports a not-configured provider", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(apiMock.checkLlmReachability).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No external provider configured/)).toBeInTheDocument();
  });

  it("checks LLM reachability and reports a reachable provider with mode and latency", async () => {
    apiMock.checkLlmReachability.mockResolvedValue({
      reachable: true,
      checked: true,
      mode: "local-openai-compatible",
      status: 200,
      latencyMs: 142
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(apiMock.checkLlmReachability).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Reachable (local openai compatible, 142 ms)")).toBeInTheDocument();
  });

  it("checks LLM reachability and reports an unreachable provider with the sanitized detail", async () => {
    apiMock.checkLlmReachability.mockResolvedValue({
      reachable: false,
      checked: true,
      mode: "local-openai-compatible",
      detail: "Connection refused"
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Unreachable: Connection refused")).toBeInTheDocument();
  });

  it("refreshes model observability after a failed provider smoke test", async () => {
    apiMock.createAiSession.mockRejectedValueOnce(
      new Error("AI session creation failed (502): LLM generation failed: LLM provider request timed out after 25ms")
    );
    apiMock.fetchObservability
      .mockResolvedValueOnce({
        totals: {
          sessions: 0,
          activeSessions: 0,
          messages: 0,
          elderCorrections: 0
        },
        sessions: []
      })
      .mockResolvedValueOnce({
        totals: {
          sessions: 1,
          activeSessions: 0,
          messages: 1,
          elderCorrections: 0
        },
        sessions: [
          {
            id: "ai-session-avenik-failed",
            languageId: "avenik",
            mode: "learner_practice",
            status: "failed",
            createdBy: "learner-1",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:01.000Z",
            messageCount: 1,
            contextNoteIds: ["avn-rule-verb-chain-note", "avn-rule-case-note"],
            contextPassageIds: ["avn-c001"],
            thinkingSummary: "Safe reasoning summary for observable failure.",
            privacy: {
              redactions: ["hidden-chain-of-thought", "answer-keys", "learner-identifiers"],
              exposesHiddenChainOfThought: false
            }
          }
        ]
      });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("region", { name: "Model session observability" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    expect(
      await screen.findByText(
        "AI session creation failed (502): LLM generation failed: LLM provider request timed out after 25ms"
      )
    ).toBeInTheDocument();
    expect(await screen.findByText("1 failed")).toBeInTheDocument();
    expect(screen.getByText("learner practice")).toBeInTheDocument();
    expect(screen.getByText("1 message")).toBeInTheDocument();
  });
});
