import type { FormEvent } from "react";
import type { ElderCorrection } from "@assini/db";
import type { DashboardData, ElderContext, ElderCorrectionReviewStatus } from "../api";

export function ElderWorkspace({
  data,
  elderContext,
  isLoadingElder,
  formNoteId,
  formPassageId,
  formSeverity,
  formCorrection,
  formRationale,
  formContextText,
  correctionSuccess,
  correctionError,
  isWorkflowBusy,
  isSubmittingCorrection,
  reviewingCorrectionId,
  applyingCorrectionId,
  correctionApplyDrafts,
  onSubmit,
  onNoteChange,
  onPassageChange,
  onSeverityChange,
  onCorrectionChange,
  onRationaleChange,
  onContextChange,
  onReviewCorrection,
  onApplyDraftChange,
  onApplyCorrection
}: {
  data: DashboardData;
  elderContext: ElderContext | null;
  isLoadingElder: boolean;
  formNoteId: string;
  formPassageId: string;
  formSeverity: ElderCorrection["severity"];
  formCorrection: string;
  formRationale: string;
  formContextText: string;
  correctionSuccess: string | null;
  correctionError: string | null;
  isWorkflowBusy: boolean;
  isSubmittingCorrection: boolean;
  reviewingCorrectionId: string | null;
  applyingCorrectionId: string | null;
  correctionApplyDrafts: Record<string, string>;
  onSubmit: (event: FormEvent) => void;
  onNoteChange: (value: string) => void;
  onPassageChange: (value: string) => void;
  onSeverityChange: (value: ElderCorrection["severity"]) => void;
  onCorrectionChange: (value: string) => void;
  onRationaleChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onReviewCorrection: (correctionId: string, status: ElderCorrectionReviewStatus) => void;
  onApplyDraftChange: (correctionId: string, explanation: string) => void;
  onApplyCorrection: (correctionId: string, explanation: string) => void;
}) {
  if (isLoadingElder) {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Loading elder workspace...
      </div>
    );
  }

  return (
    <div className="elder-layout">
      <section className="detail-panel" aria-label="Submit Correction">
        <form onSubmit={onSubmit} className="form-panel">
          <span className="detail-label">Community review</span>
          <h2>Propose correction</h2>

          {correctionSuccess && <p className="result-notice">{correctionSuccess}</p>}
          {correctionError && <p className="result-notice error">{correctionError}</p>}

          <div className="form-group">
            <label htmlFor="form-severity">Severity Rating</label>
            <select id="form-severity" value={formSeverity} onChange={(event) => onSeverityChange(event.target.value as ElderCorrection["severity"])}>
              <option value="minor">Minor - wording or typo</option>
              <option value="major">Major - grammar or paradigm drift</option>
              <option value="safety">Safety - policy or community drift</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-note">Link to Note (Optional)</label>
            <select id="form-note" value={formNoteId} onChange={(event) => onNoteChange(event.target.value)}>
              <option value="">No note linked</option>
              {data.notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.topic} ({note.status})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-passage">Link to Passage (Optional)</label>
            <select id="form-passage" value={formPassageId} onChange={(event) => onPassageChange(event.target.value)}>
              <option value="">No passage linked</option>
              {data.corpus.map((passage) => (
                <option key={passage.id} value={passage.id}>
                  {passage.id} - {passage.textTarget}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-context">Context Snippet (Optional)</label>
            <input
              id="form-context"
              type="text"
              value={formContextText}
              onChange={(event) => onContextChange(event.target.value)}
              placeholder="Paste the relevant source text"
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-correction">Correction Instruction</label>
            <textarea
              id="form-correction"
              value={formCorrection}
              onChange={(event) => onCorrectionChange(event.target.value)}
              placeholder="Describe the correction to apply"
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-rationale">Linguistic Rationale</label>
            <textarea
              id="form-rationale"
              value={formRationale}
              onChange={(event) => onRationaleChange(event.target.value)}
              placeholder="Explain the linguistic rationale"
            />
          </div>

          <button type="submit" className="full-width" disabled={isWorkflowBusy || !formCorrection.trim() || !formRationale.trim()}>
            {isSubmittingCorrection ? "Submitting..." : "Submit correction"}
          </button>
        </form>
      </section>

      <section className="detail-panel" aria-label="Elder corrections list">
        <span className="detail-label">Submitted corrections</span>
        <h2>Correction ledger</h2>
        {!elderContext || elderContext.corrections.length === 0 ? (
          <p className="empty-state">No corrections submitted for this language.</p>
        ) : (
          <div className="corrections-list">
            {elderContext.corrections.slice().reverse().map((correction) => {
              const linkedNote = correction.noteId
                ? elderContext.notes.find((note) => note.id === correction.noteId)
                : undefined;
              const applyDraft = correctionApplyDrafts[correction.id] ?? linkedNote?.explanation ?? "";
              const applyInputId = `apply-${correction.id}`;

              return (
                <article key={correction.id} className="correction-card">
                  <div className="correction-header">
                    <h3>{correction.id}</h3>
                    <span className={`severity-tag ${correction.severity}`}>{correction.severity}</span>
                  </div>
                  <p>
                    <strong>Correction:</strong> {correction.correction}
                  </p>
                  <p>
                    <strong>Rationale:</strong> {correction.rationale}
                  </p>
                  <div className="pill-row">
                    <span className="pill">Status: {correction.status}</span>
                    {correction.noteId && <span className="pill">Note: {correction.noteId}</span>}
                    {correction.passageId && <span className="pill">Passage: {correction.passageId}</span>}
                    {correction.reviewedBy && <span className="pill">Reviewed by {correction.reviewedBy}</span>}
                  </div>
                  {correction.status === "pending_review" && (
                    <div className="correction-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={isWorkflowBusy || reviewingCorrectionId === correction.id}
                        onClick={() => onReviewCorrection(correction.id, "accepted")}
                      >
                        {reviewingCorrectionId === correction.id ? "Reviewing..." : `Accept correction ${correction.id}`}
                      </button>
                      <button
                        type="button"
                        className="contest"
                        disabled={isWorkflowBusy || reviewingCorrectionId === correction.id}
                        onClick={() => onReviewCorrection(correction.id, "rejected")}
                      >
                        Reject correction {correction.id}
                      </button>
                    </div>
                  )}
                  {correction.status === "accepted" && correction.noteId && (
                    <div className="correction-apply">
                      <label htmlFor={applyInputId}>Revised explanation for {correction.id}</label>
                      <textarea
                        id={applyInputId}
                        value={applyDraft}
                        onChange={(event) => onApplyDraftChange(correction.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary"
                        disabled={isWorkflowBusy || applyingCorrectionId === correction.id || !applyDraft.trim()}
                        onClick={() => onApplyCorrection(correction.id, applyDraft)}
                      >
                        {applyingCorrectionId === correction.id ? "Applying..." : `Apply correction ${correction.id}`}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
