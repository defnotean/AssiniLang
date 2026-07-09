import type { Language, ViewMode } from "../lib/types";
import { formatTypology } from "../lib/format";
import { VIEW_ORDER } from "../lib/viewConfig";
import { useI18n } from "../i18n";
import { TypologyMark, ViewGlyph } from "./marks";

interface SidebarLanguageNavProps {
  languages: Language[];
  selectedLanguageId: string | null;
  view: ViewMode;
  isWorkflowBusy: boolean;
  sectionCounts: Partial<Record<ViewMode, number>>;
  onLanguageSelect: (languageId: string) => void;
  onViewSelect: (mode: ViewMode) => void;
}

export function SidebarLanguageNav({
  languages,
  selectedLanguageId,
  view,
  isWorkflowBusy,
  sectionCounts,
  onLanguageSelect,
  onViewSelect
}: SidebarLanguageNavProps) {
  const { t } = useI18n();

  return (
    <nav className="language-nav" aria-label={t("sidebar.languagesNav")}>
      {languages.length === 0 && (
        <p className="empty-state">{t("sidebar.noLanguages")}</p>
      )}
      {languages.map((language) => {
        const isActive = language.id === selectedLanguageId;
        return (
          <div className="language-nav-group" key={language.id}>
            <button
              type="button"
              className={`language-button${isActive ? " active" : ""}`}
              aria-pressed={isActive}
              disabled={isWorkflowBusy}
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
              <nav className="section-nav" aria-label={t("sidebar.sectionsAria", { name: language.name })}>
                {VIEW_ORDER.map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={view === mode ? "active" : ""}
                    aria-current={view === mode ? "page" : undefined}
                    disabled={isWorkflowBusy}
                    onClick={() => onViewSelect(mode)}
                  >
                    <ViewGlyph view={mode} />
                    <span>{t(`viewConfig.${mode}.label`)}</span>
                    {sectionCounts[mode] != null && <span className="section-count" aria-hidden="true">{sectionCounts[mode]}</span>}
                  </button>
                ))}
              </nav>
            )}
          </div>
        );
      })}
    </nav>
  );
}
