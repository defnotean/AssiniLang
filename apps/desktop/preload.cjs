const { contextBridge, ipcRenderer } = require("electron");

const IPC_FAILURE = Object.freeze({
  code: "DESKTOP_IPC_INVOKE_FAILED",
  i18nKey: "model.desktopIpcInvokeFailed",
  message: "Desktop IPC invoke failed."
});
const INVALID_PREFERENCES_PATCH = Object.freeze({
  code: "DESKTOP_INVALID_PREFERENCES_PATCH",
  i18nKey: "model.desktopInvalidPreferencesPatch",
  message: "Desktop preferences patch must be an object with boolean hideToTray and/or launchAtLogin."
});
const INVALID_DIAGNOSTICS_TEXT = Object.freeze({
  code: "DESKTOP_INVALID_DIAGNOSTICS_TEXT",
  i18nKey: "model.desktopInvalidDiagnosticsText",
  message: "Diagnostics report text must be a string."
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ipcFailure(errorSpec = IPC_FAILURE, message = errorSpec.message) {
  return {
    ok: false,
    code: errorSpec.code,
    i18nKey: errorSpec.i18nKey,
    message
  };
}

function normalizeDesktopIpcResult(result, error) {
  if (error != null) {
    const message = error instanceof Error ? error.message : String(error);
    return ipcFailure(IPC_FAILURE, message || IPC_FAILURE.message);
  }
  if (!isRecord(result) || typeof result.ok !== "boolean") {
    return ipcFailure(IPC_FAILURE, "Desktop IPC returned an invalid result.");
  }
  return result;
}

function optionalString(value) {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sanitizeBackupSummary(value) {
  if (!isRecord(value) || !Number.isSafeInteger(value.count) || value.count < 0) return undefined;
  return withoutUndefined({
    backupsDir: optionalString(value.backupsDir),
    count: value.count,
    latestCreatedAt: optionalString(value.latestCreatedAt),
    latestName: optionalString(value.latestName),
    latestPath: optionalString(value.latestPath)
  });
}

function sanitizeDesktopPreferences(value) {
  if (!isRecord(value) || typeof value.hideToTray !== "boolean" || typeof value.launchAtLogin !== "boolean") {
    return undefined;
  }
  return withoutUndefined({
    hideToTray: value.hideToTray,
    hideToTraySupported: optionalBoolean(value.hideToTraySupported),
    launchAtLogin: value.launchAtLogin,
    launchAtLoginSupported: optionalBoolean(value.launchAtLoginSupported)
  });
}

function sanitizeShortcutSummary(value) {
  if (!isRecord(value) || typeof value.desktopExists !== "boolean" || typeof value.startMenuExists !== "boolean") {
    return undefined;
  }
  return withoutUndefined({
    desktopExists: value.desktopExists,
    desktopPath: optionalString(value.desktopPath),
    startMenuExists: value.startMenuExists,
    startMenuPath: optionalString(value.startMenuPath)
  });
}

function normalizePreferencesPatch(patch) {
  if (!isRecord(patch)) return undefined;

  const normalized = {};
  for (const key of ["hideToTray", "launchAtLogin"]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (typeof patch[key] !== "boolean") return undefined;
    normalized[key] = patch[key];
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readDesktopInfo() {
  try {
    return ipcRenderer.sendSync("assini:desktop-info") || {};
  } catch {
    return {};
  }
}

const desktopInfo = readDesktopInfo();
const apiBaseUrl = optionalString(desktopInfo.apiBaseUrl);
const authToken = optionalString(desktopInfo.authToken);
const appFolder = optionalString(desktopInfo.appFolder);
const appPath = optionalString(desktopInfo.appPath);
const appVersion = optionalString(desktopInfo.appVersion);
const backupSummary = sanitizeBackupSummary(desktopInfo.backupSummary);
const backupsDir = optionalString(desktopInfo.backupsDir);
const dataDir = optionalString(desktopInfo.dataDir);
const diagnosticsDir = optionalString(desktopInfo.diagnosticsDir);
const desktopPreferences = sanitizeDesktopPreferences(desktopInfo.desktopPreferences);
const isPackaged = desktopInfo.isPackaged === true;
const settingsPath = optionalString(desktopInfo.settingsPath);
const shortcutSummary = sanitizeShortcutSummary(desktopInfo.shortcutSummary);

async function invokeDesktopChannel(channel, ...args) {
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    return normalizeDesktopIpcResult(result);
  } catch (error) {
    return normalizeDesktopIpcResult(undefined, error);
  }
}

async function invokeDesktopAction(action) {
  return invokeDesktopChannel("assini:desktop-action", action);
}

const assiniDesktop = Object.freeze(withoutUndefined({
  apiBaseUrl,
  appFolder,
  appPath,
  appVersion,
  authToken,
  backupSummary,
  backupsDir,
  createAppShortcuts: () => invokeDesktopAction("createAppShortcuts"),
  createDataBackup: () => invokeDesktopAction("createDataBackup"),
  createDesktopShortcut: () => invokeDesktopAction("createDesktopShortcut"),
  createStartMenuShortcut: () => invokeDesktopAction("createStartMenuShortcut"),
  dataDir,
  diagnosticsDir,
  desktopPreferences,
  isPackaged,
  openBackupsFolder: () => invokeDesktopAction("openBackupsFolder"),
  openAppFolder: () => invokeDesktopAction("openAppFolder"),
  openDataFolder: () => invokeDesktopAction("openDataFolder"),
  openDiagnosticsFolder: () => invokeDesktopAction("openDiagnosticsFolder"),
  openLatestBackupFolder: () => invokeDesktopAction("openLatestBackupFolder"),
  openSettingsFolder: () => invokeDesktopAction("openSettingsFolder"),
  pruneOldDataBackups: () => invokeDesktopAction("pruneOldDataBackups"),
  prototypeAuth: true,
  refreshShortcutSummary: () => invokeDesktopChannel("assini:desktop-shortcut-summary"),
  refreshBackupSummary: () => invokeDesktopChannel("assini:desktop-backup-summary"),
  restoreLatestDataBackup: () => invokeDesktopAction("restoreLatestDataBackup"),
  resetWindowLayout: () => invokeDesktopAction("resetWindowLayout"),
  saveDiagnosticsReport: (text) => {
    if (text != null && typeof text !== "string") {
      return Promise.resolve(ipcFailure(INVALID_DIAGNOSTICS_TEXT));
    }
    return invokeDesktopChannel("assini:desktop-diagnostics", text);
  },
  setDesktopPreferences: (patch) => {
    const normalized = normalizePreferencesPatch(patch);
    if (!normalized) {
      return Promise.resolve(ipcFailure(INVALID_PREFERENCES_PATCH));
    }
    return invokeDesktopChannel("assini:desktop-preferences", normalized);
  },
  shortcutSummary,
  settingsPath
}));

contextBridge.exposeInMainWorld("assiniDesktop", assiniDesktop);
