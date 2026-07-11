import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  DESKTOP_IPC_ERRORS,
  KNOWN_DESKTOP_ACTIONS,
  desktopIpcFailure,
  desktopIpcFailureFromError,
  normalizeDesktopAction,
  normalizeDesktopIpcResult,
  normalizeDesktopPreferencesPatch,
  normalizeDiagnosticsReportText
} = require("./desktopIpc.cjs") as {
  DESKTOP_IPC_ERRORS: Record<string, { code: string; i18nKey: string; message: string }>;
  KNOWN_DESKTOP_ACTIONS: readonly string[];
  desktopIpcFailure: (
    errorSpec: { code: string; i18nKey: string; message: string },
    extras?: Record<string, unknown>
  ) => { ok: false; code: string; i18nKey: string; message: string };
  desktopIpcFailureFromError: (
    error: unknown,
    extras?: Record<string, unknown>
  ) => { ok: false; code: string; i18nKey: string; message: string };
  normalizeDesktopAction: (
    action: unknown
  ) => { ok: true; action: string } | { ok: false; code: string; i18nKey: string; message: string };
  normalizeDesktopIpcResult: (result: unknown, error?: unknown) => Record<string, unknown>;
  normalizeDesktopPreferencesPatch: (
    patch: unknown
  ) =>
    | { ok: true; patch: { hideToTray?: boolean; launchAtLogin?: boolean } }
    | { ok: false; code: string; i18nKey: string; message: string };
  normalizeDiagnosticsReportText: (
    text: unknown,
    maxChars?: number
  ) =>
    | { ok: true; text: string; usedFallback: boolean; truncated?: boolean }
    | { ok: false; code: string; i18nKey: string; message: string };
};

describe("desktop IPC action validation", () => {
  it("accepts known actions and rejects unknown or non-string values", () => {
    expect(normalizeDesktopAction("openDataFolder")).toEqual({
      ok: true,
      action: "openDataFolder"
    });
    expect(normalizeDesktopAction("  resetWindowLayout  ")).toEqual({
      ok: true,
      action: "resetWindowLayout"
    });

    expect(normalizeDesktopAction("notARealAction")).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.UNKNOWN_ACTION.code,
      i18nKey: "model.desktopUnknownAction",
      message: "Unknown desktop action: notARealAction."
    });
    expect(normalizeDesktopAction("")).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_ACTION.code,
      i18nKey: "model.desktopInvalidAction"
    });
    expect(normalizeDesktopAction(null)).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_ACTION.code
    });
    expect(normalizeDesktopAction(42)).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_ACTION.code
    });
  });

  it("lists every action the desktop bridge exposes", () => {
    expect(KNOWN_DESKTOP_ACTIONS).toEqual(
      expect.arrayContaining([
        "openDataFolder",
        "createDataBackup",
        "restoreLatestDataBackup",
        "createAppShortcuts",
        "resetWindowLayout"
      ])
    );
    expect(new Set(KNOWN_DESKTOP_ACTIONS).size).toBe(KNOWN_DESKTOP_ACTIONS.length);
  });
});

describe("desktop IPC preferences patch validation", () => {
  it("accepts boolean preference patches and rejects invalid shapes", () => {
    expect(normalizeDesktopPreferencesPatch({ hideToTray: true })).toEqual({
      ok: true,
      patch: { hideToTray: true }
    });
    expect(normalizeDesktopPreferencesPatch({ launchAtLogin: false, hideToTray: true })).toEqual({
      ok: true,
      patch: { hideToTray: true, launchAtLogin: false }
    });
    // Unknown keys ignored when a recognized boolean is present.
    expect(normalizeDesktopPreferencesPatch({ hideToTray: false, extra: "x" })).toEqual({
      ok: true,
      patch: { hideToTray: false }
    });

    expect(normalizeDesktopPreferencesPatch(null)).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH.code,
      i18nKey: "model.desktopInvalidPreferencesPatch"
    });
    expect(normalizeDesktopPreferencesPatch([])).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH.code
    });
    expect(normalizeDesktopPreferencesPatch({})).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH.code
    });
    expect(normalizeDesktopPreferencesPatch({ hideToTray: "yes" })).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH.code
    });
    expect(normalizeDesktopPreferencesPatch({ onlyUnknown: true })).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH.code
    });
  });
});

describe("desktop IPC diagnostics text validation", () => {
  it("rejects non-string payloads and truncates oversized reports", () => {
    expect(normalizeDiagnosticsReportText(undefined)).toEqual({
      ok: true,
      text: "",
      usedFallback: true
    });
    expect(normalizeDiagnosticsReportText("   ")).toEqual({
      ok: true,
      text: "",
      usedFallback: true
    });
    expect(normalizeDiagnosticsReportText("hello report")).toEqual({
      ok: true,
      text: "hello report",
      usedFallback: false,
      truncated: false
    });
    expect(normalizeDiagnosticsReportText("abcdef", 3)).toEqual({
      ok: true,
      text: "abc",
      usedFallback: false,
      truncated: true
    });
    expect(normalizeDiagnosticsReportText({ not: "string" })).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_DIAGNOSTICS_TEXT.code,
      i18nKey: "model.desktopInvalidDiagnosticsText"
    });
    expect(normalizeDiagnosticsReportText(12)).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.INVALID_DIAGNOSTICS_TEXT.code
    });
  });
});

describe("desktop IPC failure helpers", () => {
  it("builds stable failure objects and normalizes invoke results", () => {
    expect(desktopIpcFailure(DESKTOP_IPC_ERRORS.NO_WINDOW)).toEqual({
      ok: false,
      code: DESKTOP_IPC_ERRORS.NO_WINDOW.code,
      i18nKey: "model.desktopNoWindow",
      message: "No desktop window is open."
    });
    expect(
      desktopIpcFailure(DESKTOP_IPC_ERRORS.SHORTCUT_PACKAGED_ONLY, {
        message: "Desktop shortcut creation is available in the packaged app."
      })
    ).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.SHORTCUT_PACKAGED_ONLY.code,
      i18nKey: "model.desktopShortcutPackagedOnly",
      message: "Desktop shortcut creation is available in the packaged app."
    });
    expect(desktopIpcFailureFromError(new Error("disk full"))).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED.code,
      i18nKey: "model.desktopIpcInvokeFailed",
      message: "disk full"
    });

    expect(normalizeDesktopIpcResult({ ok: true, message: "done" })).toEqual({
      ok: true,
      message: "done"
    });
    expect(normalizeDesktopIpcResult(null)).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED.code,
      message: "Desktop IPC returned an invalid result."
    });
    expect(normalizeDesktopIpcResult(undefined, new Error("channel closed"))).toMatchObject({
      ok: false,
      code: DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED.code,
      message: "channel closed"
    });
  });
});
