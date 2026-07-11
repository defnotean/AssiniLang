import type { Language, ViewMode } from "../lib/types";
import { formatTypology } from "../lib/format";
import { VIEW_ORDER } from "../lib/viewConfig";
import { useI18n } from "../i18n";
import { TypologyMark, ViewGlyph } from "./marks";

const EMPTY_SECTION_COUNTS: Partial<Record<ViewMode, number>> = {};

interface SidebarLanguageNavProps {
  languages: Language[];
  selectedLanguageId: string | null;
  view: ViewMode;
  sectionCounts: Partial<Record<ViewMode, number>>;
  onLanguageSelect: (languageId: string) => void;
  onViewSelect: (mode: ViewMode) => void;
}

function SectionNavigation({
  ariaLabel,
  className = "",
  view,
  sectionCounts,
  onViewSelect
}: {
  ariaLabel: string;
  className?: string;
  view: ViewMode;
  sectionCounts: Partial<Record<ViewMode, number>>;
  onViewSelect: (mode: ViewMode) => void;
}) {
  const { t } = useI18n();

  return (
    <div className={`section-nav${className ? ` ${className}` : ""}`} role="group" aria-label={ariaLabel}>
      {VIEW_ORDER.map((mode) => (
        <button
          type="button"
          key={mode}
          className={view === mode ? "active" : ""}
          aria-current={view === mode ? "page" : undefined}
          onClick={() => onViewSelect(mode)}
        >
          <ViewGlyph view={mode} />
          <span>{t(`viewConfig.${mode}.label`)}</span>
          {sectionCounts[mode] != null && (
            <span className="section-count" aria-hidden="true">
              {sectionCounts[mode]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SidebarLanguageNav({
  languages,
  selectedLanguageId,
  view,
  sectionCounts,
  onLanguageSelect,
  onViewSelect
}: SidebarLanguageNavProps) {
  const { t } = useI18n();
  const hasSelectedLanguage = languages.some((language) => language.id === selectedLanguageId);

  return (
    <nav className="language-nav" aria-label={t("sidebar.languagesNav")}>
      {languages.length === 0 && (
        <div className="empty-state" role="status" aria-live="polite">
          <p>{t("sidebar.noLanguages")}</p>
          <p className="muted">{t("sidebar.noLanguagesHint")}</p>
        </div>
      )}
      {languages.map((language) => {
        const isActive = language.id === selectedLanguageId;
        return (
          <div className="language-nav-group" key={language.id}>
            <button
              type="button"
              className={`language-button${isActive ? " active" : ""}`}
              aria-pressed={isActive}
              onClick={() => onLanguageSelect(language.id)}
            >
              <span className="typology-frame">
                <TypologyMark typology={language.typology} />
              </span>
              <span className="language-copy">
                <strong>{language.name}</strong>
                <span>{formatTypology(language.typology, t)}</span>
              </span>
            </button>

            {isActive && (
              <SectionNavigation
                ariaLabel={t("sidebar.sectionsAria", { name: language.name })}
                view={view}
                sectionCounts={sectionCounts}
                onViewSelect={onViewSelect}
              />
            )}
          </div>
        );
      })}
      {!hasSelectedLanguage && (
        <SectionNavigation
          ariaLabel={t("header.overviewAria")}
          className="workspace-section-nav"
          view={view}
          sectionCounts={EMPTY_SECTION_COUNTS}
          onViewSelect={onViewSelect}
        />
      )}
    </nav>
  );
}
