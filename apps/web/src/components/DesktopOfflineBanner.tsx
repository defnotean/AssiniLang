import { useI18n } from "../i18n";
import { getDesktopBridgeInfo } from "../lib/desktopBridge";
import { useBrowserOnline } from "../hooks/useBrowserOnline";

export function DesktopOfflineBanner() {
  const { t } = useI18n();
  const isOnline = useBrowserOnline();
  const isDesktop = getDesktopBridgeInfo() !== null;

  if (!isDesktop || isOnline) {
    return null;
  }

  return (
    <div className="connectivity-banner warning" role="status" aria-live="polite">
      <strong>{t("app.desktopOfflineTitle")}</strong>
      <span>{t("app.desktopOfflineHint")}</span>
    </div>
  );
}
