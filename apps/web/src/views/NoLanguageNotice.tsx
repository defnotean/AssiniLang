import { useI18n } from "../i18n";

export function NoLanguageNotice() {
  const { t } = useI18n();
  return (
    <div className="empty-state panel-card" role="status">
      <p>{t("errors.selectOrCreateLanguage")}</p>
      <p className="muted">{t("errors.selectOrCreateLanguageHint")}</p>
    </div>
  );
}
