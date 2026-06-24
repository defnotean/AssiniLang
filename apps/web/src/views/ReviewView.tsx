import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Note } from "@assini/db";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { DetailBlock } from "../components/DetailBlock";
import { formatEvidenceLabel } from "../lib/format";
import { useI18n } from "../i18n";
import type { ReviewFilter, ReviewStatus } from "../lib/types";

export function ReviewView({
  notes,
  selectedNote,
  isWorkflowBusy,
  reviewingNoteId,
  onSelectNote,
  onReview,
  onSaveExplanation
}: {
  notes: Note[];
  selectedNote: Note | null;
  isWorkflowBusy: boolean;
  reviewingNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onReview: (status: ReviewStatus) => void;
  onSaveExplanation: (explanation: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [noteExplanationDraft, setNoteExplanationDraft] = useState(selectedNote?.explanation ?? "");
  const [noteEditMessage, setNoteEditMessage] = useState<string | null>(null);
  const counts = useMemo(() => ({
    all: notes.length,
    pending: notes.filter((note) => note.status === "draft" || note.status === "under_review").length,
    contested: notes.filter((note) => note.status === "contested").length,
    rejected: notes.filter((note) => note.status === "rejected").length,
    deferred: notes.filter((note) => note.status === "deferred").length,
    escalated: notes.filter((note) => note.status === "escalated").length,
    approved: notes.filter((note) => note.status === "approved").length
  }), [notes]);
  const filteredNotes = useMemo(() => {
    if (filter === "all") return notes;
    if (filter === "pending") return notes.filter((note) => note.status === "draft" || note.status === "under_review");
    return notes.filter((note) => note.status === filter);
  }, [filter, notes]);
  useEffect(() => {
    setNoteExplanationDraft(selectedNote?.explanation ?? "");
    setNoteEditMessage(null);
  }, [selectedNote?.id, selectedNote?.explanation]);
  const trimmedDraft = noteExplanationDraft.trim();
  const canSaveExplanation = selectedNote !== null
    && trimmedDraft.length > 0
    && trimmedDraft !== selectedNote.explanation
    && reviewingNoteId === null
    && !isWorkflowBusy;

  async function handleSaveExplanation(event: FormEvent) {
    event.preventDefault();
    if (!canSaveExplanation) return;
    await onSaveExplanation(trimmedDraft);
    setNoteEditMessage(t("reviewView.noteExplanationUpdated"));
  }

  return (
    <div className="review-workbench">
      <section className="triage-panel" aria-label={t("reviewView.reviewQueue")}>
        <div className="filter-strip" aria-label={t("reviewView.reviewFilters")}>
          {(["all", "pending", "contested", "rejected", "deferred", "escalated", "approved"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              <span>{t(`reviewView.filter.${item}`)}</span>
              <strong aria-hidden="true">{counts[item]}</strong>
            </button>
          ))}
        </div>

        <div className="note-table-head" aria-hidden="true">
          <span>{t("reviewView.topic")}</span>
          <span>{t("reviewView.status")}</span>
          <span>{t("reviewView.evidence")}</span>
        </div>

        <div className="note-table-body">
          {filteredNotes.length === 0 ? (
            <p className="empty-state">{t("reviewView.noNotesInFilter")}</p>
          ) : (
            filteredNotes.map((note) => (
              <button
                type="button"
                key={note.id}
                className={`note-row${selectedNote?.id === note.id ? " active" : ""}`}
                aria-pressed={selectedNote?.id === note.id}
                disabled={isWorkflowBusy}
                onClick={() => onSelectNote(note.id)}
              >
                <span className="note-topic">
                  <strong>{note.topic}</strong>
                  <small>{t(`confidence.${note.confidence}`)}</small>
                </span>
                <StatusBadge status={note.status} />
                <span className="note-evidence">{formatEvidenceLabel(note.evidenceCount)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="detail-panel note-detail-panel" aria-label={t("reviewView.noteDetailPanel")}>
        {selectedNote ? (
          <article className="record-card" aria-label={t("reviewView.selectedNoteDetail")}>
            <div className="record-topline">
              <div>
                <span className="detail-label">{t("reviewView.selectedNote")}</span>
                <h2>{selectedNote.topic}</h2>
              </div>
              <div className="pill-row">
                <StatusBadge status={selectedNote.status} />
                <ConfidenceBadge confidence={selectedNote.confidence} />
              </div>
            </div>

            <p className="explanation">{selectedNote.explanation}</p>
            <form className="note-edit-form" onSubmit={handleSaveExplanation}>
              <div className="form-group">
                <label htmlFor="note-explanation-draft">{t("reviewView.revisedNoteExplanation")}</label>
                <textarea
                  id="note-explanation-draft"
                  value={noteExplanationDraft}
                  onChange={(event) => {
                    setNoteExplanationDraft(event.target.value);
                    setNoteEditMessage(null);
                  }}
                />
              </div>
              <button type="submit" className="secondary" disabled={!canSaveExplanation}>
                {reviewingNoteId === selectedNote.id ? t("reviewView.saving") : t("reviewView.saveNoteExplanation")}
              </button>
              {noteEditMessage && (
                <p className="result-notice" role="status" aria-live="polite">
                  {noteEditMessage}
                </p>
              )}
            </form>
            <dl className="detail-grid">
              <div>
                <dt>{t("reviewView.evidence")}</dt>
                <dd>{formatEvidenceLabel(selectedNote.evidenceCount)}</dd>
              </div>
              <div>
                <dt>{t("reviewView.dialectScope")}</dt>
                <dd>{selectedNote.dialectScope}</dd>
              </div>
              <div>
                <dt>{t("reviewView.lastReviewedBy")}</dt>
                <dd>{selectedNote.reviewer.lastReviewedBy ?? t("reviewView.unreviewed")}</dd>
              </div>
              <div>
                <dt>{t("reviewView.lastReviewedAt")}</dt>
                <dd>{selectedNote.reviewer.lastReviewedAt ?? t("reviewView.unreviewed")}</dd>
              </div>
            </dl>

            <DetailBlock title={t("reviewView.evidenceCitations")}>
              <div className="pill-row">
                {selectedNote.evidencePassageIds.map((passageId) => (
                  <span key={passageId} className="pill">
                    {passageId}
                  </span>
                ))}
              </div>
            </DetailBlock>

            <DetailBlock title={t("reviewView.examples")}>
              {selectedNote.examples.length === 0 ? (
                <p className="inline-empty">{t("reviewView.noExamplesSupplied")}</p>
              ) : (
                <div className="detail-list">
                  {selectedNote.examples.map((example) => (
                    <div key={example.passageId} className="detail-row example-row">
                      <code>{example.target}</code>
                      <span>{example.translation}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            <DetailBlock title={t("reviewView.reviewerComments")}>
              {selectedNote.reviewer.comments.length === 0 ? (
                <p className="inline-empty">{t("reviewView.noReviewerComments")}</p>
              ) : (
                <div className="detail-list">
                  {selectedNote.reviewer.comments.map((comment) => (
                    <p key={comment} className="detail-row">
                      {comment}
                    </p>
                  ))}
                </div>
              )}
            </DetailBlock>

            <DetailBlock title={t("reviewView.editHistory")}>
              {selectedNote.editHistory.length === 0 ? (
                <p className="inline-empty">{t("reviewView.noEditHistory")}</p>
              ) : (
                <div className="detail-list">
                  {selectedNote.editHistory.map((entry) => (
                    <div key={`${entry.at}-${entry.action}-${entry.summary}`} className="detail-row">
                      <strong>{entry.action}</strong>
                      <span>{entry.summary}</span>
                      <span className="muted">{entry.by}</span>
                      <span className="muted">{entry.at}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            <div className="review-bar">
              <button
                type="button"
                className="approve"
                aria-label={t("reviewView.approveNote", { topic: selectedNote.topic })}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("approved")}
              >
                {t("reviewView.approve")}
              </button>
              <button
                type="button"
                className="contest"
                aria-label={t("reviewView.contestNote", { topic: selectedNote.topic })}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("contested")}
              >
                {t("reviewView.contest")}
              </button>
              <button
                type="button"
                className="reject"
                aria-label={t("reviewView.rejectNote", { topic: selectedNote.topic })}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("rejected")}
              >
                {t("reviewView.reject")}
              </button>
              <button
                type="button"
                className="defer"
                aria-label={t("reviewView.deferNote", { topic: selectedNote.topic })}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("deferred")}
              >
                {t("reviewView.defer")}
              </button>
              <button
                type="button"
                className="escalate"
                aria-label={t("reviewView.escalateNote", { topic: selectedNote.topic })}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("escalated")}
              >
                {t("reviewView.escalate")}
              </button>
            </div>
          </article>
        ) : (
          <p className="empty-state">{t("reviewView.noNotesForLanguage")}</p>
        )}
      </section>
    </div>
  );
}
