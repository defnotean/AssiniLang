import type { Language, ViewMode } from "../lib/types";
import { formatOrthographyMeta, formatStatus, formatTypology } from "../lib/format";
import { useI18n } from "../i18n";

interface WorkspaceHeaderProps {
  view: ViewMode;
  currentTitle: string;
  currentEyebrow: string;
  currentBreadcrumb: string;
  selectedLanguage: Language | null;
  isWorkflowBusy: boolean;
  isDrafting: boolean;
  isModelDrafting: boolean;
  isEvaluating: boolean;
  modelDraftMessage: string | null;
  modelDraftError: string | null;
  actionError: string | null;
  onGenerateDrafts: () => void;
  onGenerateModelDrafts: () => void;
  onRunEval: () => void;
}

export function WorkspaceHeader({
  view,
  currentTitle,
  currentEyebrow,
  currentBreadcrumb,
  selectedLanguage,
  isWorkflowBusy,
  isDrafting,
  isModelDrafting,
  isEvaluating,
  modelDraftMessage,
  modelDraftError,
  actionError,
  onGenerateDrafts,
  onGenerateModelDrafts,
  onRunEval
}: WorkspaceHeaderProps) {
  const { t } = useI18n();

  return (
    <section className="workspace-header" aria-label={t("header.overviewAria")}>
      <div className="star-field" aria-hidden="true" />
      <div className="title-block">
        <p className="breadcrumb">{currentBreadcrumb}</p>
        <p className="eyebrow">{currentEyebrow}</p>
        <h1>{currentTitle}</h1>
        {view !== "elder" && (
          <div className="language-metadata" aria-label={t("header.metadataAria")}>
            <span>{formatTypology(selectedLanguage?.typology, t)}</span>
            <span>{formatOrthographyMeta(selectedLanguage?.orthography, t)}</span>
            <span>
              {t("header.statusWorkspace", {
                status: formatStatus(selectedLanguage?.status ?? "draft", t)
              })}
            </span>
          </div>
        )}
      </div>

      <div className="header-actions">
        {view === "ingest" && (
          <>
            <button type="button" onClick={onGenerateDrafts} disabled={isWorkflowBusy} aria-busy={isDrafting}>
              {isDrafting ? t("review.drafting") : t("review.generateAiDrafts")}
            </button>
            <button
              type="button"
              onClick={onGenerateModelDrafts}
              disabled={isWorkflowBusy}
              aria-busy={isModelDrafting}
            >
              {isModelDrafting ? t("review.draftingWithModel") : t("review.draftNotesWithModel")}
            </button>
            {modelDraftMessage && (
              <p className="result-notice header-notice" role="status" aria-live="polite">
                {modelDraftMessage}
              </p>
            )}
            {modelDraftError && (
              <p className="result-notice error header-notice" role="alert">
                {modelDraftError}
              </p>
            )}
            {actionError && (
              <p className="result-notice error header-notice" role="alert">
                {actionError}
              </p>
            )}
          </>
        )}
        {view === "model" && (
          <>
            <button type="button" onClick={onRunEval} disabled={isWorkflowBusy} aria-busy={isEvaluating}>
              {isEvaluating ? t("eval.evaluating") : t("eval.runSystemEval")}
            </button>
            {actionError && (
              <p className="result-notice error header-notice" role="alert">
                {actionError}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
