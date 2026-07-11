import { useI18n } from "../i18n";
import type { DesktopBackupSummary, DesktopBridgeInfo, DesktopShortcutSummary } from "../lib/desktopBridge";
import { formatDesktopBackupTime } from "../lib/desktopDiagnostics";

type DesktopAppDetailsProps = {
  desktopBackupSummary: DesktopBackupSummary | null;
  desktopBridge: DesktopBridgeInfo;
  desktopShortcutSummary: DesktopShortcutSummary | null;
};

export function DesktopAppDetails({
  desktopBackupSummary,
  desktopBridge,
  desktopShortcutSummary
}: DesktopAppDetailsProps) {
  const { t } = useI18n();

  return (
    <div>
      <span className="detail-label">{t("model.desktopApp")}</span>
      <dl className="detail-grid">
        {desktopBridge.appVersion && (
          <div data-desktop-info="version">
            <dt>{t("model.desktopAppVersion")}</dt>
            <dd>{desktopBridge.appVersion}</dd>
          </div>
        )}
        {desktopBridge.appFolder && (
          <div data-desktop-path="app">
            <dt>{t("model.desktopAppFolder")}</dt>
            <dd>
              <code>{desktopBridge.appFolder}</code>
            </dd>
          </div>
        )}
        {desktopBridge.dataDir && (
          <div data-desktop-path="data">
            <dt>{t("model.desktopDataPath")}</dt>
            <dd>
              <code>{desktopBridge.dataDir}</code>
            </dd>
          </div>
        )}
        {desktopBridge.settingsPath && (
          <div data-desktop-path="settings">
            <dt>{t("model.desktopSettingsPath")}</dt>
            <dd>
              <code>{desktopBridge.settingsPath}</code>
            </dd>
          </div>
        )}
        {desktopBridge.backupsDir && (
          <div data-desktop-path="backups">
            <dt>{t("model.desktopBackupsPath")}</dt>
            <dd>
              <code>{desktopBridge.backupsDir}</code>
            </dd>
          </div>
        )}
        {desktopBridge.diagnosticsDir && (
          <div data-desktop-path="diagnostics">
            <dt>{t("model.desktopDiagnosticsPath")}</dt>
            <dd>
              <code>{desktopBridge.diagnosticsDir}</code>
            </dd>
          </div>
        )}
        {desktopBackupSummary && (
          <div data-desktop-backup-summary="count">
            <dt>{t("model.desktopBackupCount")}</dt>
            <dd>
              {desktopBackupSummary.count > 0
                ? t("model.desktopBackupCountValue", { count: desktopBackupSummary.count })
                : t("model.desktopNoBackupsYet")}
            </dd>
          </div>
        )}
        {desktopBackupSummary && desktopBackupSummary.count === 0 && (
          <div data-desktop-backup-summary="empty">
            <dt>{t("model.desktopLatestBackup")}</dt>
            <dd className="inline-empty empty-state" role="status" aria-live="polite">
              {t("model.desktopNoBackupsHint")}
            </dd>
          </div>
        )}
        {desktopBackupSummary?.latestName && (
          <div data-desktop-backup-summary="latest">
            <dt>{t("model.desktopLatestBackup")}</dt>
            <dd>
              <code>{desktopBackupSummary.latestName}</code>
              {desktopBackupSummary.latestCreatedAt && (
                <span>
                  {t("model.desktopLatestBackupCreated", {
                    time: formatDesktopBackupTime(desktopBackupSummary.latestCreatedAt)
                  })}
                </span>
              )}
            </dd>
          </div>
        )}
        {desktopShortcutSummary && (
          <>
            <div data-desktop-shortcut-summary="desktop">
              <dt>{t("model.desktopShortcutDesktop")}</dt>
              <dd className="desktop-shortcut-status">
                <span>
                  {desktopShortcutSummary.desktopExists ? t("model.shortcutInstalled") : t("model.shortcutMissing")}
                </span>
                {desktopShortcutSummary.desktopPath && <code>{desktopShortcutSummary.desktopPath}</code>}
              </dd>
            </div>
            <div data-desktop-shortcut-summary="start-menu">
              <dt>{t("model.desktopShortcutStartMenu")}</dt>
              <dd className="desktop-shortcut-status">
                <span>
                  {desktopShortcutSummary.startMenuExists ? t("model.shortcutInstalled") : t("model.shortcutMissing")}
                </span>
                {desktopShortcutSummary.startMenuPath && <code>{desktopShortcutSummary.startMenuPath}</code>}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}
