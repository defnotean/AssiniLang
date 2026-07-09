/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  refreshDesktopBackupSummary,
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
      i18nKey: "model.desktopOnlyActions"
    });
    await expect(setDesktopPreferences({ launchAtLogin: true })).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyPreferences"
    });
    await expect(refreshDesktopBackupSummary()).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyBackupSummary"
    });
    await expect(saveDesktopDiagnosticsReport("report")).resolves.toMatchObject({
      ok: false,
      i18nKey: "model.desktopOnlyDiagnostics"
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
});