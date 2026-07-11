/**
 * Testable desktop IPC validation and error-result helpers.
 * Covers action/preferences/diagnostics edges (not backup restore).
 */

const KNOWN_DESKTOP_ACTIONS = Object.freeze([
  "openDataFolder",
  "openAppFolder",
  "openSettingsFolder",
  "openBackupsFolder",
  "openDiagnosticsFolder",
  "openLatestBackupFolder",
  "pruneOldDataBackups",
  "createDesktopShortcut",
  "createStartMenuShortcut",
  "createAppShortcuts",
  "createDataBackup",
  "restoreLatestDataBackup",
  "resetWindowLayout"
]);

const DESKTOP_PREFERENCE_KEYS = Object.freeze(["hideToTray", "launchAtLogin"]);

const DESKTOP_IPC_ERRORS = Object.freeze({
  UNKNOWN_ACTION: Object.freeze({
    code: "DESKTOP_UNKNOWN_ACTION",
    i18nKey: "model.desktopUnknownAction",
    message: "Unknown desktop action."
  }),
  INVALID_ACTION: Object.freeze({
    code: "DESKTOP_INVALID_ACTION",
    i18nKey: "model.desktopInvalidAction",
    message: "Desktop action must be a non-empty string."
  }),
  INVALID_PREFERENCES_PATCH: Object.freeze({
    code: "DESKTOP_INVALID_PREFERENCES_PATCH",
    i18nKey: "model.desktopInvalidPreferencesPatch",
    message: "Desktop preferences patch must be an object with boolean hideToTray and/or launchAtLogin."
  }),
  LAUNCH_AT_LOGIN_PACKAGED_ONLY: Object.freeze({
    code: "DESKTOP_LAUNCH_AT_LOGIN_PACKAGED_ONLY",
    i18nKey: "model.desktopLaunchAtLoginPackagedOnly",
    message: "Launch at sign-in is available in the packaged desktop app."
  }),
  SHORTCUT_PACKAGED_ONLY: Object.freeze({
    code: "DESKTOP_SHORTCUT_PACKAGED_ONLY",
    i18nKey: "model.desktopShortcutPackagedOnly",
    message: "Shortcut setup is available in the packaged app."
  }),
  NO_WINDOW: Object.freeze({
    code: "DESKTOP_NO_WINDOW",
    i18nKey: "model.desktopNoWindow",
    message: "No desktop window is open."
  }),
  INVALID_DIAGNOSTICS_TEXT: Object.freeze({
    code: "DESKTOP_INVALID_DIAGNOSTICS_TEXT",
    i18nKey: "model.desktopInvalidDiagnosticsText",
    message: "Diagnostics report text must be a string."
  }),
  IPC_INVOKE_FAILED: Object.freeze({
    code: "DESKTOP_IPC_INVOKE_FAILED",
    i18nKey: "model.desktopIpcInvokeFailed",
    message: "Desktop IPC invoke failed."
  })
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDesktopAction(action) {
  if (typeof action !== "string") {
    return { ok: false, ...DESKTOP_IPC_ERRORS.INVALID_ACTION };
  }
  const trimmed = action.trim();
  if (!trimmed) {
    return { ok: false, ...DESKTOP_IPC_ERRORS.INVALID_ACTION };
  }
  if (!KNOWN_DESKTOP_ACTIONS.includes(trimmed)) {
    return {
      ok: false,
      ...DESKTOP_IPC_ERRORS.UNKNOWN_ACTION,
      message: `Unknown desktop action: ${trimmed}.`
    };
  }
  return { ok: true, action: trimmed };
}

/**
 * Validate a preferences patch from the renderer.
 * Rejects non-objects, arrays, and patches with no recognized boolean keys.
 * Unknown keys are ignored; recognized keys must be boolean when present.
 */
function normalizeDesktopPreferencesPatch(patch) {
  if (!isPlainObject(patch)) {
    return { ok: false, ...DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH };
  }

  const next = {};
  let recognized = 0;
  for (const key of DESKTOP_PREFERENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (typeof patch[key] !== "boolean") {
      return { ok: false, ...DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH };
    }
    next[key] = patch[key];
    recognized += 1;
  }

  if (recognized === 0) {
    return { ok: false, ...DESKTOP_IPC_ERRORS.INVALID_PREFERENCES_PATCH };
  }

  return { ok: true, patch: next };
}

/**
 * Normalize diagnostics report text for disk write.
 * `null`/`undefined`/blank string → use generated fallback later (ok with empty text).
 * Non-string values are rejected.
 */
function normalizeDiagnosticsReportText(text, maxChars) {
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 200_000;
  if (text == null) {
    return { ok: true, text: "", usedFallback: true };
  }
  if (typeof text !== "string") {
    return { ok: false, ...DESKTOP_IPC_ERRORS.INVALID_DIAGNOSTICS_TEXT };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: "", usedFallback: true };
  }
  return {
    ok: true,
    text: text.slice(0, limit),
    usedFallback: false,
    truncated: text.length > limit
  };
}

function desktopIpcFailure(errorSpec, extras = {}) {
  const spec = errorSpec && typeof errorSpec === "object" ? errorSpec : DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED;
  return {
    ok: false,
    code: spec.code,
    i18nKey: spec.i18nKey,
    message: typeof extras.message === "string" && extras.message.trim() ? extras.message : spec.message,
    ...Object.fromEntries(Object.entries(extras).filter(([key]) => key !== "message"))
  };
}

function desktopIpcFailureFromError(error, extras = {}) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    code: DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED.code,
    i18nKey: DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED.i18nKey,
    message: message || DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED.message,
    ...extras
  };
}

/**
 * Ensure an IPC invoke result is a plain object with `ok`.
 * Catches thrown invoke errors and malformed channel returns.
 */
function normalizeDesktopIpcResult(result, error) {
  if (error != null) {
    return desktopIpcFailureFromError(error);
  }
  if (!isPlainObject(result) || typeof result.ok !== "boolean") {
    return desktopIpcFailure(DESKTOP_IPC_ERRORS.IPC_INVOKE_FAILED, {
      message: "Desktop IPC returned an invalid result."
    });
  }
  return result;
}

module.exports = {
  DESKTOP_IPC_ERRORS,
  DESKTOP_PREFERENCE_KEYS,
  KNOWN_DESKTOP_ACTIONS,
  desktopIpcFailure,
  desktopIpcFailureFromError,
  isPlainObject,
  normalizeDesktopAction,
  normalizeDesktopIpcResult,
  normalizeDesktopPreferencesPatch,
  normalizeDiagnosticsReportText
};
