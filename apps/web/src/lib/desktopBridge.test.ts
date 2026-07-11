/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  refreshDesktopBackupSummary,
  refreshDesktopShortcutSummary,
  runDesktopAction,
  saveDesktopDiagnosticsReport,
  setDesktopPreferences
} from "./desktopBridge";

describe("desktopBridge unavailable paths", () => {
  afterEach(() => {
    delete (window as Window & { assiniDesktop?: unknown }).assiniDesktop;
  });

  it("returns stable i18n keys when the desktop bridge is missing", async () => {
    await expect(runDesktopAction("openDataFolder")).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyActions",
      message: "Desktop actions are available only in AssiniLang Desktop."
    });
    await expect(setDesktopPreferences({ launchAtLogin: true })).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyPreferences",
      message: "Desktop preferences are available only in AssiniLang Desktop."
    });
    await expect(refreshDesktopBackupSummary()).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyBackupSummary",
      message: "Desktop backup summary is available only in AssiniLang Desktop."
    });
    await expect(refreshDesktopShortcutSummary()).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyShortcutSummary",
      message: "Desktop shortcut summary is available only in AssiniLang Desktop."
    });
    await expect(saveDesktopDiagnosticsReport("report")).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyDiagnostics",
      message: "Desktop diagnostics reports are available only in AssiniLang Desktop."
    });
  });

  it("returns a stable i18n key when a desktop action is missing from the build", async () => {
    window.assiniDesktop = {
      apiBaseUrl: "http://127.0.0.1:8787",
      authToken: "test-token",
      prototypeAuth: true,
      dataDir: "C:\\AssiniLang\\data"
    };

    await expect(runDesktopAction("openDataFolder")).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopActionUnavailable"
    });
  });

  it("surfaces stable IPC failure codes and i18n keys from the desktop bridge", async () => {
    window.assiniDesktop = {
      apiBaseUrl: "http://127.0.0.1:8787",
      authToken: "test-token",
      prototypeAuth: true,
      dataDir: "C:\\AssiniLang\\data",
      createDesktopShortcut: async () => ({
        ok: false,
        code: "DESKTOP_SHORTCUT_PACKAGED_ONLY",
        i18nKey: "model.desktopShortcutPackagedOnly",
        message: "Shortcut setup is available in the packaged app."
      }),
      setDesktopPreferences: async () => ({
        ok: false,
        code: "DESKTOP_INVALID_PREFERENCES_PATCH",
        i18nKey: "model.desktopInvalidPreferencesPatch",
        message: "Desktop preferences patch must be an object with boolean hideToTray and/or launchAtLogin."
      }),
      saveDiagnosticsReport: async () => ({
        ok: false,
        code: "DESKTOP_INVALID_DIAGNOSTICS_TEXT",
        i18nKey: "model.desktopInvalidDiagnosticsText",
        message: "Diagnostics report text must be a string."
      })
    };

    await expect(runDesktopAction("createDesktopShortcut")).resolves.toMatchObject({
      ok: false,
      code: "DESKTOP_SHORTCUT_PACKAGED_ONLY",
      i18nKey: "model.desktopShortcutPackagedOnly"
    });
    await expect(setDesktopPreferences({ hideToTray: true })).resolves.toMatchObject({
      ok: false,
      code: "DESKTOP_INVALID_PREFERENCES_PATCH",
      i18nKey: "model.desktopInvalidPreferencesPatch"
    });
    await expect(saveDesktopDiagnosticsReport("report")).resolves.toMatchObject({
      ok: false,
      code: "DESKTOP_INVALID_DIAGNOSTICS_TEXT",
      i18nKey: "model.desktopInvalidDiagnosticsText"
    });
  });
});
