import { useEffect, useState, type FormEvent } from "react";
import type { ElderCorrection } from "@assini/db";
import type { DashboardData } from "../api";
import type { ElderWorkspaceState } from "../hooks/useElderWorkspace";
import { useI18n, type MessageKey } from "../i18n";

const STATUS_LABEL: Record<ElderCorrection["status"], MessageKey> = {
  pending_review: "elderPage.statusPending",
  accepted: "elderPage.statusAccepted",
  rejected: "elderPage.statusRejected",
  applied: "elderPage.statusApplied"
};

/**
 * Standalone, plain-language Elder page. A community elder is walked through
 * three calm steps to suggest a fix, then sees their suggestions as friendly
 * cards they can approve, set aside, or save into a lesson. It reuses the elder
 * correction API/state via useElderWorkspace; only the wording and layout are
 * simplified for non-technical readers.
 */
export function ElderPage({
  elder,
  data,
  isWorkflowBusy
}: {
  elder: ElderWorkspaceState;
  data: DashboardData;
  isWorkflowBusy: boolean;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [sent, setSent] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);

  // Show the thank-you screen only when our own "send" succeeds (not when a
  // review/approve action in the list below sets a success message).
  useEffect(() => {
    if (!pendingSend) return;
    if (elder.correctionError) {
      setPendingSend(false);
    } else if (elder.correctionSuccess === t("elderWs.msgSubmitSuccess")) {
      setPendingSend(false);
      setSent(true);
    }
  }, [pendingSend, elder.correctionError, elder.correctionSuccess, t]);

  if (elder.isLoadingElder) {
    return (
      <div className="elder-page">
        <div className="elder-card" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          {t("elderPage.loading")}
        </div>
      </div>
    );
  }

  const hasTarget = Boolean(elder.formNoteId || elder.formPassageId || elder.formContextText.trim());
  const hasFix = Boolean(elder.formCorrection.trim() && elder.formRationale.trim());

  function pickNote(value: string) {
    elder.setFormNoteId(value);
    if (value) elder.setFormPassageId("");
  }
  function pickPassage(value: string) {
    elder.setFormPassageId(value);
    if (value) elder.setFormNoteId("");
  }

  function targetSummary(): string {
    if (elder.formNoteId) {
      return data.notes.find((note) => note.id === elder.formNoteId)?.topic ?? elder.formNoteId;
    }
    if (elder.formPassageId) {
      return data.corpus.find((passage) => passage.id === elder.formPassageId)?.textTarget ?? elder.formPassageId;
    }
    return elder.formContextText.trim();
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    setPendingSend(true);
    elder.handleSubmitCorrection(event);
  }

  function suggestAnother() {
    setSent(false);
    setStep(1);
  }

  const corrections = elder.elderContext ? elder.elderContext.corrections.slice().reverse() : [];

  return (
    <div className="elder-page">
      <p className="elder-intro">{t("elderPage.intro")}</p>
      {!elder.elderContext && elder.correctionError && (
        <div className="result-notice error" role="alert">
          <p>{elder.correctionError}</p>
          <button type="button" className="secondary" onClick={elder.reloadElderContext}>
            {t("app.retryLoad")}
          </button>
        </div>
      )}

      <section className="elder-card elder-suggest" aria-label={t("elderPage.suggestHeading")}>
        <div className="elder-card-head">
          <h2>{t("elderPage.suggestHeading")}</h2>
          {!sent && (
            <span className="elder-step-count">{t("elderPage.step", { current: step, total: 3 })}</span>
          )}
        </div>

        {sent ? (
          <div className="elder-thanks" role="status" aria-live="polite">
            <span className="elder-thanks-mark" aria-hidden="true">✓</span>
            <h3>{t("elderPage.thanksTitle")}</h3>
            <p>{t("elderPage.thanksBody")}</p>
            <button type="button" className="elder-primary" onClick={suggestAnother}>
              {t("elderPage.suggestAnother")}
            </button>
          </div>
        ) : (
          <>
            {elder.elderContext && elder.correctionError && (
              <p className="result-notice error" role="alert">
                {elder.correctionError}
              </p>
            )}

            {step === 1 && (
              <div className="elder-step">
                <h3 className="elder-q">{t("elderPage.step1Title")}</h3>
                <p className="elder-help">{t("elderPage.step1Help")}</p>

                <label className="elder-field">
                  <span>{t("elderPage.pasteLabel")}</span>
                  <textarea
                    value={elder.formContextText}
                    onChange={(event) => elder.setFormContextText(event.target.value)}
                    placeholder={t("elderPage.pastePlaceholder")}
                    rows={3}
                  />
                </label>

                <label className="elder-field">
                  <span>{t("elderPage.pickLessonLabel")}</span>
                  <select value={elder.formNoteId} onChange={(event) => pickNote(event.target.value)}>
                    <option value="">{t("elderPage.pickLessonNone")}</option>
                    {data.notes.map((note) => (
                      <option key={note.id} value={note.id}>
                        {note.topic}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="elder-field">
                  <span>{t("elderPage.pickSentenceLabel")}</span>
                  <select value={elder.formPassageId} onChange={(event) => pickPassage(event.target.value)}>
                    <option value="">{t("elderPage.pickSentenceNone")}</option>
                    {data.corpus.map((passage) => (
                      <option key={passage.id} value={passage.id}>
                        {passage.textTarget}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="elder-nav">
                  <span className="elder-nav-spacer" />
                  <button type="button" className="elder-primary" disabled={!hasTarget} onClick={() => setStep(2)}>
                    {t("elderPage.next")}
                  </button>
                </div>
                {!hasTarget && <p className="elder-hint">{t("elderPage.step1Hint")}</p>}
              </div>
            )}

            {step === 2 && (
              <div className="elder-step">
                <h3 className="elder-q">{t("elderPage.step2Title")}</h3>
                <p className="elder-help">{t("elderPage.step2Help")}</p>

                <label className="elder-field">
                  <span>{t("elderPage.fixLabel")}</span>
                  <textarea
                    value={elder.formCorrection}
                    onChange={(event) => elder.setFormCorrection(event.target.value)}
                    placeholder={t("elderPage.fixPlaceholder")}
                    rows={2}
                  />
                </label>

                <label className="elder-field">
                  <span>{t("elderPage.reasonLabel")}</span>
                  <textarea
                    value={elder.formRationale}
                    onChange={(event) => elder.setFormRationale(event.target.value)}
                    placeholder={t("elderPage.reasonPlaceholder")}
                    rows={2}
                  />
                </label>

                <div className="elder-field">
                  <span>{t("elderPage.importanceLabel")}</span>
                  <div className="elder-choice">
                    <button
                      type="button"
                      className={`elder-pill-btn${elder.formSeverity === "minor" ? " active" : ""}`}
                      aria-pressed={elder.formSeverity === "minor"}
                      onClick={() => elder.setFormSeverity("minor")}
                    >
                      {t("elderPage.importanceSmall")}
                    </button>
                    <button
                      type="button"
                      className={`elder-pill-btn${elder.formSeverity !== "minor" ? " active" : ""}`}
                      aria-pressed={elder.formSeverity !== "minor"}
                      onClick={() => elder.setFormSeverity("major")}
                    >
                      {t("elderPage.importanceBig")}
                    </button>
                  </div>
                </div>

                <div className="elder-nav">
                  <button type="button" className="elder-secondary" onClick={() => setStep(1)}>
                    {t("elderPage.back")}
                  </button>
                  <button type="button" className="elder-primary" disabled={!hasFix} onClick={() => setStep(3)}>
                    {t("elderPage.next")}
                  </button>
                </div>
                {!hasFix && <p className="elder-hint">{t("elderPage.step2Hint")}</p>}
              </div>
            )}

            {step === 3 && (
              <form className="elder-step" onSubmit={handleSend}>
                <h3 className="elder-q">{t("elderPage.step3Title")}</h3>
                <p className="elder-help">{t("elderPage.step3Help")}</p>

                <div className="elder-readback">
                  <p>
                    <strong>{t("elderPage.readbackAbout")}</strong> {targetSummary()}
                  </p>
                  <p>
                    <strong>{t("elderPage.readbackFix")}</strong> {elder.formCorrection}
                  </p>
                  <p>
                    <strong>{t("elderPage.readbackReason")}</strong> {elder.formRationale}
                  </p>
                </div>

                <div className="elder-nav">
                  <button type="button" className="elder-secondary" onClick={() => setStep(2)}>
                    {t("elderPage.back")}
                  </button>
                  <button
                    type="submit"
                    className="elder-primary"
                    disabled={isWorkflowBusy || elder.isSubmittingCorrection || !hasTarget || !hasFix}
                    aria-busy={elder.isSubmittingCorrection || isWorkflowBusy}
                  >
                    {elder.isSubmittingCorrection ? t("elderPage.sending") : t("elderPage.send")}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      <section className="elder-card" aria-label={t("elderPage.suggestionsHeading")}>
        <h2>{t("elderPage.suggestionsHeading")}</h2>
        {corrections.length === 0 ? (
          <div className="elder-empty empty-state" role="status" aria-live="polite">
            <p>{t("elderPage.noSuggestions")}</p>
            <p className="muted">{t("elderPage.noSuggestionsHint")}</p>
          </div>
        ) : (
          <ul className="elder-suggestions">
            {corrections.map((correction) => {
              const aboutText = correction.noteId
                ? data.notes.find((note) => note.id === correction.noteId)?.topic ?? correction.noteId
                : correction.passageId
                  ? data.corpus.find((passage) => passage.id === correction.passageId)?.textTarget ?? correction.passageId
                  : correction.contextText ?? t("elderPage.aboutContext");
              const linkedNote = correction.noteId
                ? elder.elderContext?.notes.find((note) => note.id === correction.noteId)
                : undefined;
              // Prefer an in-progress draft, then the elder's suggested fix, then the
              // existing lesson wording so reviewers can edit before apply.
              const applyDraft =
                elder.correctionApplyDrafts[correction.id] ??
                correction.correction ??
                linkedNote?.explanation ??
                "";
              const isReviewing = elder.reviewingCorrectionId === correction.id;
              const isApplying = elder.applyingCorrectionId === correction.id;

              return (
                <li key={correction.id} className="elder-suggestion">
                  <p className="elder-suggestion-about">
                    <strong>{t("elderPage.aboutLabel")}</strong> {aboutText}
                  </p>
                  <p>
                    <strong>{t("elderPage.suggestedFixLabel")}</strong> {correction.correction}
                  </p>
                  <p className="elder-muted">
                    <strong>{t("elderPage.reasonShortLabel")}</strong> {correction.rationale}
                  </p>
                  <p className={`elder-status ${correction.status}`}>
                    <span className="elder-dot" aria-hidden="true" />
                    <span className="elder-status-text">{t(STATUS_LABEL[correction.status])}</span>
                    {correction.reviewedBy && (
                      <span className="elder-reviewed-by">
                        {t("elderPage.reviewedBy", { who: correction.reviewedBy })}
                      </span>
                    )}
                  </p>

                  {correction.status === "pending_review" && (
                    <div className="elder-actions">
                      <button
                        type="button"
                        className="elder-primary"
                        disabled={isWorkflowBusy || isReviewing}
                        aria-busy={isReviewing || isWorkflowBusy}
                        onClick={() => elder.handleReviewCorrection(correction.id, "accepted")}
                      >
                        {isReviewing ? t("elderPage.working") : t("elderPage.approve")}
                      </button>
                      <button
                        type="button"
                        className="elder-secondary danger"
                        disabled={isWorkflowBusy || isReviewing}
                        aria-busy={isReviewing || isWorkflowBusy}
                        onClick={() => elder.handleReviewCorrection(correction.id, "rejected")}
                      >
                        {isReviewing ? t("elderPage.working") : t("elderPage.cannotUse")}
                      </button>
                    </div>
                  )}

                  {correction.status === "accepted" && correction.noteId && (
                    <div className="elder-apply">
                      <h4>{t("elderPage.saveHeading")}</h4>
                      <p className="elder-help">{t("elderPage.saveHelp")}</p>
                      <label className="elder-field">
                        <span>{t("elderPage.revisedWording")}</span>
                        <textarea
                          value={applyDraft}
                          onChange={(event) =>
                            elder.setCorrectionApplyDrafts((current) => ({
                              ...current,
                              [correction.id]: event.target.value
                            }))
                          }
                          rows={3}
                        />
                      </label>
                      <button
                        type="button"
                        className="elder-primary"
                        disabled={isWorkflowBusy || isApplying || !applyDraft.trim()}
                        aria-busy={isApplying || isWorkflowBusy}
                        onClick={() => elder.handleApplyCorrection(correction.id, applyDraft)}
                      >
                        {isApplying ? t("elderPage.saving") : t("elderPage.saveIntoLesson")}
                      </button>
                    </div>
                  )}

                  {correction.status === "accepted" && !correction.noteId && (
                    <div className="elder-empty empty-state" role="status" aria-live="polite">
                      <p>{t("elderPage.acceptedNoLesson")}</p>
                      <p className="muted">{t("elderPage.acceptedNoLessonHint")}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {elder.correctionSuccess && (
          <p className="result-notice" role="status" aria-live="polite">
            {elder.correctionSuccess}
          </p>
        )}
        {elder.elderContext && elder.correctionError && (
          <p className="result-notice error" role="alert">
            {elder.correctionError}
          </p>
        )}
      </section>
    </div>
  );
}
