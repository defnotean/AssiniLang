import type { DesktopBackupSummary, DesktopPreferences, DesktopShortcutSummary } from "../api";
import type { MessageKey } from "../i18n";

export type DesktopAction =
  | "openAppFolder"
  | "openDataFolder"
  | "openSettingsFolder"
  | "openBackupsFolder"
  | "openDiagnosticsFolder"
  | "openLatestBackupFolder"
  | "createAppShortcuts"
  | "createDesktopShortcut"
  | "createStartMenuShortcut"
  | "createDataBackup"
  | "pruneOldDataBackups"
  | "restoreLatestDataBackup"
  | "resetWindowLayout";

export type DesktopActionResult = {
  backupSummary?: DesktopBackupSummary;
  diagnosticsDir?: string;
  diagnosticsPath?: string;
  ok: boolean;
  /** Stable i18n key for bridge-unavailable / action-missing failures. */
  i18nKey?: MessageKey;
  message?: string;
  shortcutSummary?: DesktopShortcutSummary;
};

export type DesktopBridgeInfo = {
  appFolder?: string;
  appPath?: string;
  appVersion?: string;
  backupSummary?: DesktopBackupSummary;
  backupsDir?: string;
  dataDir?: string;
  diagnosticsDir?: string;
  preferences?: DesktopPreferences;
  isPackaged?: boolean;
  shortcutSummary?: DesktopShortcutSummary;
  settingsPath?: string;
};

export type DesktopPreferencesResult = DesktopActionResult & {
  preferences?: DesktopPreferences;
};

function joinDesktopPath(parent: string, child: string): string {
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${child}`;
}

function parentDesktopPath(value: string): string {
  return value.replace(/[\\/][^\\/]*$/, "");
}

function inferBackupsDir({ dataDir, settingsPath }: { dataDir?: string; settingsPath?: string }): string | undefined {
  if (settingsPath) {
    return joinDesktopPath(parentDesktopPath(settingsPath), "backups");
  }
  if (dataDir) {
    return joinDesktopPath(parentDesktopPath(dataDir), "backups");
  }
  return undefined;
}

export function getDesktopBridgeInfo(): DesktopBridgeInfo | null {
  if (typeof window === "undefined" || !window.assiniDesktop) {
    return null;
  }
  const dataDir = window.assiniDesktop.dataDir;
  const settingsPath = window.assiniDesktop.settingsPath;

  return {
    appFolder: window.assiniDesktop.appFolder,
    appPath: window.assiniDesktop.appPath,
    appVersion: window.assiniDesktop.appVersion,
    backupSummary: window.assiniDesktop.backupSummary,
    backupsDir: window.assiniDesktop.backupsDir ?? inferBackupsDir({ dataDir, settingsPath }),
    dataDir,
    diagnosticsDir: window.assiniDesktop.diagnosticsDir,
    preferences: window.assiniDesktop.desktopPreferences,
    isPackaged: window.assiniDesktop.isPackaged,
    shortcutSummary: window.assiniDesktop.shortcutSummary,
    settingsPath
  };
}

export async function runDesktopAction(action: DesktopAction): Promise<DesktopActionResult> {
  if (typeof window === "undefined" || !window.assiniDesktop) {
    return {
      ok: false,
      i18nKey: "model.desktopOnlyActions",
      message: "Desktop actions are available only in AssiniLang Desktop."
    };
  }

  const runner = window.assiniDesktop[action];
  if (typeof runner !== "function") {
    return {
      ok: false,
      i18nKey: "model.desktopActionUnavailable",
      message: "This desktop action is not available in this build."
    };
  }

  return runner();
}

export async function setDesktopPreferences(
  patch: Partial<Pick<DesktopPreferences, "hideToTray" | "launchAtLogin">>
): Promise<DesktopPreferencesResult> {
  if (typeof window === "undefined" || !window.assiniDesktop?.setDesktopPreferences) {
    return {
      ok: false,
      i18nKey: "model.desktopOnlyPreferences",
      message: "Desktop preferences are available only in AssiniLang Desktop."
    };
  }

  return window.assiniDesktop.setDesktopPreferences(patch);
}

export async function refreshDesktopBackupSummary(): Promise<DesktopActionResult> {
  if (typeof window === "undefined" || !window.assiniDesktop?.refreshBackupSummary) {
    return {
      ok: false,
      i18nKey: "model.desktopOnlyBackupSummary",
      message: "Desktop backup summary is available only in AssiniLang Desktop."
    };
  }

  return window.assiniDesktop.refreshBackupSummary();
}

export async function refreshDesktopShortcutSummary(): Promise<DesktopActionResult> {
  if (typeof window === "undefined" || !window.assiniDesktop?.refreshShortcutSummary) {
    return {
      ok: false,
      i18nKey: "model.desktopOnlyShortcutSummary",
      message: "Desktop shortcut summary is available only in AssiniLang Desktop."
    };
  }

  return window.assiniDesktop.refreshShortcutSummary();
}

export async function saveDesktopDiagnosticsReport(text: string): Promise<DesktopActionResult> {
  if (typeof window === "undefined" || !window.assiniDesktop?.saveDiagnosticsReport) {
    return {
      ok: false,
      i18nKey: "model.desktopOnlyDiagnostics",
      message: "Desktop diagnostics reports are available only in AssiniLang Desktop."
    };
  }

  return window.assiniDesktop.saveDiagnosticsReport(text);
}

export type { DesktopBackupSummary, DesktopPreferences, DesktopShortcutSummary };
