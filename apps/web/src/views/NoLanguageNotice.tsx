import { useI18n } from "../i18n";

export function NoLanguageNotice() {
  const { t } = useI18n();
  return <p className="empty-state panel-card">{t("errors.selectOrCreateLanguage")}</p>;
}
