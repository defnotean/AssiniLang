import { describe, expect, it } from "vitest";

function createReport(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    apiBaseUrl: "http://127.0.0.1:12345",
    bridge: [true, true, true, { ok: true, status: 200 }],
    isPackaged: true,
    dataDir: "C:\\Temp\\assini-smoke\\data",
    ui: {
      createdLanguage: true,
      screens: {
        start: { heading: "Start", textLength: 100 },
        build: { heading: "Build", textLength: 100 },
        practice: { heading: "Practice", textLength: 100 },
        settings: { heading: "Settings", textLength: 100 }
      },
      layoutFit: {
        start: {
          pageOverflowX: 0,
          sidebarBrandOverflow: [],
          noteTopicOverflow: [],
          viewport: { width: 1024, height: 681 }
        },
        build: {
          pageOverflowX: 0,
          sidebarBrandOverflow: [],
          noteTopicOverflow: [],
          viewport: { width: 1024, height: 681 }
        },
        practice: {
          pageOverflowX: 0,
          sidebarBrandOverflow: [],
          noteTopicOverflow: [],
          viewport: { width: 1024, height: 681 }
        },
        settings: {
          pageOverflowX: 0,
          sidebarBrandOverflow: [],
          noteTopicOverflow: [],
          modelGridColumns: 1,
          controls: [
            { label: "Discovered models", width: 520 },
            { label: "Base URL", width: 340 },
            { label: "Model", width: 340 },
            { label: "Timeout", width: 160 },
            { label: "Max tokens", width: 160 }
          ],
          desktopActionGroups: [
            { group: "recovery", buttonCount: 1, clippedButtons: [], width: 520 },
            { group: "diagnostics", buttonCount: 2, clippedButtons: [], width: 520 },
            { group: "folders", buttonCount: 4, clippedButtons: [], width: 520 },
            { group: "backups", buttonCount: 5, clippedButtons: [], width: 520 },
            { group: "shortcuts", buttonCount: 3, clippedButtons: [], width: 520 }
          ],
          viewport: { width: 1024, height: 681 }
        }
      },
      controls: {
        desktopBackup: {
          created: true,
          summaryUpdated: true
        },
        desktopDiagnostics: {
          copied: true,
          saved: true
        },
        desktopBridge: {
          apiBaseUrl: "http://127.0.0.1:12345",
          appFolder: true,
          appPath: true,
          appVersion: true,
          backupSummary: true,
          backupsDir: true,
          dataDir: true,
          diagnosticsDir: true,
          settingsPath: true,
          isPackaged: true,
          shortcutSummary: true,
          openAppFolder: true,
          openDataFolder: true,
          openSettingsFolder: true,
          openDiagnosticsFolder: true,
          openBackupsFolder: true,
          openLatestBackupFolder: true,
          pruneOldDataBackups: true,
          createAppShortcuts: true,
          createDataBackup: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          restoreLatestDataBackup: true,
          resetWindowLayout: true,
          desktopPreferences: true,
          refreshShortcutSummary: true,
          saveDiagnosticsReport: true,
          setDesktopPreferences: true
        },
        desktopShortcuts: {
          desktopVisible: true,
          startMenuVisible: true
        },
        providerForm: {
          providerValue: "deterministic",
          baseUrlPlaceholder: "http://127.0.0.1:11434/v1",
          modelPlaceholder: "irene-fusion",
          timeoutValue: "180000",
          maxTokensValue: "4096"
        }
      }
    },
    visual: {
      width: 1264,
      height: 821,
      nonWhiteRatio: 0.5
    },
    ...overrides
  };
}

describe("desktop package smoke report validation", () => {
  it("accepts a rendered packaged desktop smoke report", async () => {
    const { validateSmokeReport } = await import("./smokeDesktopPackage.mjs");

    expect(validateSmokeReport(createReport())).toMatchObject({
      createdLanguage: true,
      isPackaged: true,
      screens: ["start", "build", "practice", "settings"],
      screenshotPixels: "1264x821"
    });
  });

  it("rejects blank or near-white screenshots", async () => {
    const { validateSmokeReport } = await import("./smokeDesktopPackage.mjs");

    expect(() =>
      validateSmokeReport(
        createReport({
          visual: { width: 1264, height: 821, nonWhiteRatio: 0 }
        })
      )
    ).toThrow(/blank or near-white/);
  });

  it("requires the provider settings controls to be visible", async () => {
    const { validateSmokeReport } = await import("./smokeDesktopPackage.mjs");
    const report = createReport();
    (report.ui.controls.providerForm as Record<string, unknown>).modelPlaceholder = "";

    expect(() => validateSmokeReport(report)).toThrow(/Provider model placeholder/);
  });

  it("rejects clipped desktop action buttons", async () => {
    const { validateSmokeReport } = await import("./smokeDesktopPackage.mjs");
    const report = createReport();
    const settingsLayout = report.ui.layoutFit.settings as Record<string, unknown>;
    const actionGroups = settingsLayout.desktopActionGroups as Array<Record<string, unknown>>;
    actionGroups[0].clippedButtons = [{ label: "Reset window layout", scrollWidth: 180, clientWidth: 120 }];

    expect(() => validateSmokeReport(report)).toThrow(/clipped buttons/);
  });
});
