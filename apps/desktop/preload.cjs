const { ipcRenderer } = require("electron");
const { normalizeDesktopIpcResult } = require("./desktopIpc.cjs");

function readDesktopInfo() {
  try {
    return ipcRenderer.sendSync("assini:desktop-info") || {};
  } catch {
    return {};
  }
}

const desktopInfo = readDesktopInfo();
const apiBaseUrl = desktopInfo.apiBaseUrl || process.env.ASSINI_DESKTOP_API_URL;
const authToken = desktopInfo.authToken || process.env.ASSINI_DESKTOP_AUTH_TOKEN;
const appFolder = desktopInfo.appFolder || process.env.ASSINI_DESKTOP_APP_FOLDER;
const appPath = desktopInfo.appPath || process.env.ASSINI_DESKTOP_APP_PATH;
const appVersion = desktopInfo.appVersion || process.env.ASSINI_DESKTOP_APP_VERSION;
let backupSummary = desktopInfo.backupSummary;
const backupsDir = desktopInfo.backupsDir || process.env.ASSINI_DESKTOP_BACKUPS_DIR;
const dataDir = desktopInfo.dataDir || process.env.ASSINI_DESKTOP_DATA_DIR;
const diagnosticsDir = desktopInfo.diagnosticsDir || process.env.ASSINI_DESKTOP_DIAGNOSTICS_DIR;
let desktopPreferences = desktopInfo.desktopPreferences;
const isPackaged = typeof desktopInfo.isPackaged === "boolean"
  ? desktopInfo.isPackaged
  : process.env.ASSINI_DESKTOP_IS_PACKAGED === "1";
const settingsPath = desktopInfo.settingsPath || process.env.ASSINI_DESKTOP_SETTINGS_PATH;
let shortcutSummary = desktopInfo.shortcutSummary;

function rewriteApiUrl(input) {
  if (typeof input !== "string" || !input.startsWith("/api")) {
    return input;
  }

  if (!apiBaseUrl) {
    return input;
  }

  const apiPath = input.replace(/^\/api/, "") || "/";
  return `${apiBaseUrl}${apiPath}`;
}

async function invokeDesktopChannel(channel, ...args) {
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    return normalizeDesktopIpcResult(result);
  } catch (error) {
    return normalizeDesktopIpcResult(undefined, error);
  }
}

async function invokeDesktopAction(action) {
  const result = await invokeDesktopChannel("assini:desktop-action", action);
  if (result?.backupSummary) {
    backupSummary = result.backupSummary;
  }
  if (result?.shortcutSummary) {
    shortcutSummary = result.shortcutSummary;
  }
  return result;
}

window.assiniDesktop = Object.freeze({
  apiBaseUrl,
  appFolder,
  appPath,
  appVersion,
  authToken,
  get backupSummary() {
    return backupSummary;
  },
  backupsDir,
  createAppShortcuts: () => invokeDesktopAction("createAppShortcuts"),
  createDataBackup: () => invokeDesktopAction("createDataBackup"),
  createDesktopShortcut: () => invokeDesktopAction("createDesktopShortcut"),
  createStartMenuShortcut: () => invokeDesktopAction("createStartMenuShortcut"),
  dataDir,
  diagnosticsDir,
  get desktopPreferences() {
    return desktopPreferences;
  },
  isPackaged,
  openBackupsFolder: () => invokeDesktopAction("openBackupsFolder"),
  openAppFolder: () => invokeDesktopAction("openAppFolder"),
  openDataFolder: () => invokeDesktopAction("openDataFolder"),
  openDiagnosticsFolder: () => invokeDesktopAction("openDiagnosticsFolder"),
  openLatestBackupFolder: () => invokeDesktopAction("openLatestBackupFolder"),
  openSettingsFolder: () => invokeDesktopAction("openSettingsFolder"),
  pruneOldDataBackups: () => invokeDesktopAction("pruneOldDataBackups"),
  prototypeAuth: true,
  refreshShortcutSummary: async () => {
    const result = await invokeDesktopChannel("assini:desktop-shortcut-summary");
    if (result?.shortcutSummary) {
      shortcutSummary = result.shortcutSummary;
    }
    return result;
  },
  refreshBackupSummary: async () => {
    const result = await invokeDesktopChannel("assini:desktop-backup-summary");
    if (result?.backupSummary) {
      backupSummary = result.backupSummary;
    }
    return result;
  },
  restoreLatestDataBackup: () => invokeDesktopAction("restoreLatestDataBackup"),
  resetWindowLayout: () => invokeDesktopAction("resetWindowLayout"),
  saveDiagnosticsReport: (text) => invokeDesktopChannel("assini:desktop-diagnostics", text),
  setDesktopPreferences: async (patch) => {
    const result = await invokeDesktopChannel("assini:desktop-preferences", patch);
    if (result?.preferences) {
      desktopPreferences = result.preferences;
    }
    return result;
  },
  get shortcutSummary() {
    return shortcutSummary;
  },
  settingsPath
});

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => nativeFetch(rewriteApiUrl(input), init);
