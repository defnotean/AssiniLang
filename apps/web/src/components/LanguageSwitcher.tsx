import { LOCALE_META, useI18n, type Locale } from "../i18n";

/**
 * Interface-language selector. Lives in the sidebar brand card beside the theme
 * toggle and switches the whole console between the available locales (English
 * and Arabic), including text direction.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="locale-switcher">
      <span className="visually-hidden">{t("locale.switcherLabel")}</span>
      <select
        className="locale-select"
        aria-label={t("locale.switcherLabel")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALE_META.map((meta) => (
          <option key={meta.code} value={meta.code}>
            {meta.label}
          </option>
        ))}
      </select>
    </label>
  );
}
