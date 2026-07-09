import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Note } from "@assini/db";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { DetailBlock } from "../components/DetailBlock";
import { formatEvidenceLabel } from "../lib/format";
import { useI18n } from "../i18n";
import type { ReviewFilter, ReviewStatus } from "../lib/types";

const REVIEW_FILTERS: ReviewFilter[] = ["all", "pending", "contested", "rejected", "deferred", "escalated", "approved"];

function matchesReviewFilter(note: Note, filter: ReviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return note.status === "draft" || note.status === "under_review";
  return note.status === filter;
}

export function ReviewView({
  notes,
  selectedNote,
  isWorkflowBusy,
  reviewingNoteId,
  actionError = null,
  onSelectNote,
  onReview,
  onSaveExplanation
}: {
  notes: Note[];
  selectedNote: Note | null;
  isWorkflowBusy: boolean;
  reviewingNoteId: string | null;
  actionError?: string | null;
  onSelectNote: (noteId: string) => void;
  onReview: (status: ReviewStatus) => void;
  onSaveExplanation: (explanation: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [noteExplanationDraft, setNoteExplanationDraft] = useState(selectedNote?.explanation ?? "");
  const [noteEditMessage, setNoteEditMessage] = useState<string | null>(null);
  const [noteEditError, setNoteEditError] = useState<string | null>(null);
  const counts = useMemo(() => (
    notes.reduce<Record<ReviewFilter, number>>((nextCounts, note) => {
      nextCounts.all += 1;
      if (note.status === "draft" || note.status === "under_review") {
        nextCounts.pending += 1;
      } else if (note.status in nextCounts) {
        nextCounts[note.status as ReviewFilter] += 1;
      }
      return nextCounts;
    }, { all: 0, pending: 0, contested: 0, rejected: 0, deferred: 0, escalated: 0, approved: 0 })
  ), [notes]);
  const filteredNotes = useMemo(() => {
    if (filter === "all") return notes;
    return notes.filter((note) => matchesReviewFilter(note, filter));
  }, [filter, notes]);
  // Hide detail when the selection is outside the active filter so Approve/etc.
  // never apply to a note the queue is not listing.
  const detailNote = useMemo(() => {
    if (!selectedNote) return null;
    return filteredNotes.some((note) => note.id === selectedNote.id) ? selectedNote : null;
  }, [filteredNotes, selectedNote]);
  useEffect(() => {
    setNoteExplanationDraft(detailNote?.explanation ?? "");
    setNoteEditMessage(null);
    setNoteEditError(null);
  }, [detailNote?.id, detailNote?.explanation]);
  const trimmedDraft = noteExplanationDraft.trim();
  const reviewActionsDisabled = reviewingNoteId !== null || isWorkflowBusy;
  const canSaveExplanation = detailNote !== null
    && trimmedDraft.length > 0
    && trimmedDraft !== detailNote.explanation
    && !reviewActionsDisabled;

  async function handleSaveExplanation(event: FormEvent) {
    event.preventDefault();
    if (!canSaveExplanation) return;
    setNoteEditError(null);
    try {
      await onSaveExplanation(trimmedDraft);
      setNoteEditMessage(t("reviewView.noteExplanationUpdated"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.noteExplanationUpdateFailed");
      setNoteEditMessage(null);
      setNoteEditError(message);
    }
  }

  return (
    <div className="review-workbench">
      <section className="triage-panel" aria-label={t("reviewView.reviewQueue")}>
        <div className="filter-strip" aria-label={t("reviewView.reviewFilters")}>
          {REVIEW_FILTERS.map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "active" : ""}
              aria-pressed={filter === item}
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
            <div className="empty-state" role="status">
              <p>
                {filter === "all"
                  ? t("reviewView.noNotesForLanguage")
                  : t("reviewView.noNotesInFilterNamed", { filter: t(`reviewView.filter.${filter}`) })}
              </p>
              <p className="muted">
                {filter === "all"
                  ? t("reviewView.noNotesForLanguageHint")
                  : t("reviewView.noNotesInFilterHint")}
              </p>
            </div>
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
                <span className="note-evidence">{formatEvidenceLabel(note.evidenceCount, t)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="detail-panel note-detail-panel" aria-label={t("reviewView.noteDetailPanel")}>
        {detailNote ? (
          <article className="record-card" aria-label={t("reviewView.selectedNoteDetail")}>
            <div className="record-topline">
              <div>
                <span className="detail-label">{t("reviewView.selectedNote")}</span>
                <h2>{detailNote.topic}</h2>
              </div>
              <div className="pill-row">
                <StatusBadge status={detailNote.status} />
                <ConfidenceBadge confidence={detailNote.confidence} />
              </div>
            </div>

            <p className="explanation">{detailNote.explanation}</p>
            <form className="note-edit-form" onSubmit={handleSaveExplanation}>
              <div className="form-group">
                <label htmlFor="note-explanation-draft">{t("reviewView.revisedNoteExplanation")}</label>
                <textarea
                  id="note-explanation-draft"
                  value={noteExplanationDraft}
                  disabled={reviewActionsDisabled}
                  onChange={(event) => {
                    setNoteExplanationDraft(event.target.value);
                    setNoteEditMessage(null);
                    setNoteEditError(null);
                  }}
                />
              </div>
              <button
                type="submit"
                className="secondary"
                disabled={!canSaveExplanation}
                aria-busy={reviewingNoteId === detailNote.id}
              >
                {reviewingNoteId === detailNote.id ? t("reviewView.saving") : t("reviewView.saveNoteExplanation")}
              </button>
              {noteEditMessage && (
                <p className="result-notice" role="status" aria-live="polite">
                  {noteEditMessage}
                </p>
              )}
              {noteEditError && (
                <p className="result-notice error" role="alert">
                  {noteEditError}
                </p>
              )}
            </form>
            {actionError && (
              <p className="result-notice error" role="alert">
                {actionError}
              </p>
            )}
            <dl className="detail-grid">
              <div>
                <dt>{t("reviewView.evidence")}</dt>
                <dd>{formatEvidenceLabel(detailNote.evidenceCount, t)}</dd>
              </div>
              <div>
                <dt>{t("reviewView.dialectScope")}</dt>
                <dd>{detailNote.dialectScope}</dd>
              </div>
              <div>
                <dt>{t("reviewView.lastReviewedBy")}</dt>
                <dd>{detailNote.reviewer.lastReviewedBy ?? t("reviewView.unreviewed")}</dd>
              </div>
              <div>
                <dt>{t("reviewView.lastReviewedAt")}</dt>
                <dd>{detailNote.reviewer.lastReviewedAt ?? t("reviewView.unreviewed")}</dd>
              </div>
            </dl>

            <DetailBlock title={t("reviewView.evidenceCitations")}>
              <div className="pill-row">
                {detailNote.evidencePassageIds.map((passageId, index) => (
                  <span key={`${index}:${passageId}`} className="pill">
                    {passageId}
                  </span>
                ))}
              </div>
            </DetailBlock>

            <DetailBlock title={t("reviewView.examples")}>
              {detailNote.examples.length === 0 ? (
                <p className="inline-empty">{t("reviewView.noExamplesSupplied")}</p>
              ) : (
                <div className="detail-list">
                  {detailNote.examples.map((example, index) => (
                    <div key={`${index}:${example.passageId}`} className="detail-row example-row">
                      <code>{example.target}</code>
                      <span>{example.translation}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            <DetailBlock title={t("reviewView.reviewerComments")}>
              {detailNote.reviewer.comments.length === 0 ? (
                <p className="inline-empty">{t("reviewView.noReviewerComments")}</p>
              ) : (
                <div className="detail-list">
                  {detailNote.reviewer.comments.map((comment, index) => (
                    <p key={`${index}:${comment}`} className="detail-row">
                      {comment}
                    </p>
                  ))}
                </div>
              )}
            </DetailBlock>

            <DetailBlock title={t("reviewView.editHistory")}>
              {detailNote.editHistory.length === 0 ? (
                <p className="inline-empty">{t("reviewView.noEditHistory")}</p>
              ) : (
                <div className="detail-list">
                  {detailNote.editHistory.map((entry, index) => (
                    <div key={`${index}:${entry.at}:${entry.action}:${entry.summary}`} className="detail-row">
                      <strong>{entry.action}</strong>
                      <span>{entry.summary}</span>
                      <span className="muted">{entry.by}</span>
                      <span className="muted">{entry.at}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            <div className="review-bar" aria-busy={reviewingNoteId === detailNote.id}>
              <button
                type="button"
                className="approve"
                aria-label={t("reviewView.approveNote", { topic: detailNote.topic })}
                disabled={reviewActionsDisabled}
                onClick={() => onReview("approved")}
              >
                {t("reviewView.approve")}
              </button>
              <button
                type="button"
                className="contest"
                aria-label={t("reviewView.contestNote", { topic: detailNote.topic })}
                disabled={reviewActionsDisabled}
                onClick={() => onReview("contested")}
              >
                {t("reviewView.contest")}
              </button>
              <button
                type="button"
                className="reject"
                aria-label={t("reviewView.rejectNote", { topic: detailNote.topic })}
                disabled={reviewActionsDisabled}
                onClick={() => onReview("rejected")}
              >
                {t("reviewView.reject")}
              </button>
              <button
                type="button"
                className="defer"
                aria-label={t("reviewView.deferNote", { topic: detailNote.topic })}
                disabled={reviewActionsDisabled}
                onClick={() => onReview("deferred")}
              >
                {t("reviewView.defer")}
              </button>
              <button
                type="button"
                className="escalate"
                aria-label={t("reviewView.escalateNote", { topic: detailNote.topic })}
                disabled={reviewActionsDisabled}
                onClick={() => onReview("escalated")}
              >
                {t("reviewView.escalate")}
              </button>
            </div>
          </article>
        ) : (
          <div className="empty-state" role="status">
            {notes.length === 0 ? (
              <>
                <p>{t("reviewView.noNotesForLanguage")}</p>
                <p className="muted">{t("reviewView.noNotesForLanguageHint")}</p>
              </>
            ) : filteredNotes.length === 0 ? (
              <>
                <p>
                  {filter === "all"
                    ? t("reviewView.noNotesForLanguage")
                    : t("reviewView.noNotesInFilterNamed", { filter: t(`reviewView.filter.${filter}`) })}
                </p>
                <p className="muted">{t("reviewView.noNotesInFilterHint")}</p>
              </>
            ) : (
              <>
                <p>{t("reviewView.selectNoteHint")}</p>
                <p className="muted">{t("reviewView.selectNoteHintDetail")}</p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
