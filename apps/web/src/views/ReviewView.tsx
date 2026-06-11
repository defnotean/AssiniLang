import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Note } from "@assini/db";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { DetailBlock } from "../components/DetailBlock";
import { formatEvidenceLabel } from "../lib/format";
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
    setNoteEditMessage("Note explanation updated.");
  }

  return (
    <div className="review-workbench">
      <section className="triage-panel" aria-label="Review queue">
        <div className="filter-strip" aria-label="Review filters">
          {(["all", "pending", "contested", "rejected", "deferred", "escalated", "approved"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              <span>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</span>
              <strong aria-hidden="true">{counts[item]}</strong>
            </button>
          ))}
        </div>

        <div className="note-table-head" aria-hidden="true">
          <span>Topic</span>
          <span>Status</span>
          <span>Evidence</span>
        </div>

        <div className="note-table-body">
          {filteredNotes.length === 0 ? (
            <p className="empty-state">No notes in this filter.</p>
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
                  <small>{note.confidence} confidence</small>
                </span>
                <StatusBadge status={note.status} />
                <span className="note-evidence">{formatEvidenceLabel(note.evidenceCount)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="detail-panel note-detail-panel" aria-label="Note detail panel">
        {selectedNote ? (
          <article className="record-card" aria-label="Selected note detail">
            <div className="record-topline">
              <div>
                <span className="detail-label">Selected note</span>
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
                <label htmlFor="note-explanation-draft">Revised note explanation</label>
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
                {reviewingNoteId === selectedNote.id ? "Saving..." : "Save note explanation"}
              </button>
              {noteEditMessage && (
                <p className="result-notice" role="status" aria-live="polite">
                  {noteEditMessage}
                </p>
              )}
            </form>
            <dl className="detail-grid">
              <div>
                <dt>Evidence</dt>
                <dd>{formatEvidenceLabel(selectedNote.evidenceCount)}</dd>
              </div>
              <div>
                <dt>Dialect scope</dt>
                <dd>{selectedNote.dialectScope}</dd>
              </div>
              <div>
                <dt>Last reviewed by</dt>
                <dd>{selectedNote.reviewer.lastReviewedBy ?? "Unreviewed"}</dd>
              </div>
              <div>
                <dt>Last reviewed at</dt>
                <dd>{selectedNote.reviewer.lastReviewedAt ?? "Unreviewed"}</dd>
              </div>
            </dl>

            <DetailBlock title="Evidence Citations">
              <div className="pill-row">
                {selectedNote.evidencePassageIds.map((passageId) => (
                  <span key={passageId} className="pill">
                    {passageId}
                  </span>
                ))}
              </div>
            </DetailBlock>

            <DetailBlock title="Examples">
              {selectedNote.examples.length === 0 ? (
                <p className="inline-empty">No examples supplied.</p>
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

            <DetailBlock title="Reviewer comments">
              {selectedNote.reviewer.comments.length === 0 ? (
                <p className="inline-empty">No reviewer comments.</p>
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

            <DetailBlock title="Edit history">
              {selectedNote.editHistory.length === 0 ? (
                <p className="inline-empty">No edit history.</p>
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
                aria-label={`Approve ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("approved")}
              >
                Approve
              </button>
              <button
                type="button"
                className="contest"
                aria-label={`Contest ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("contested")}
              >
                Contest
              </button>
              <button
                type="button"
                className="reject"
                aria-label={`Reject ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("rejected")}
              >
                Reject
              </button>
              <button
                type="button"
                className="defer"
                aria-label={`Defer ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("deferred")}
              >
                Defer
              </button>
              <button
                type="button"
                className="escalate"
                aria-label={`Escalate ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("escalated")}
              >
                Escalate
              </button>
            </div>
          </article>
        ) : (
          <p className="empty-state">No notes for this language.</p>
        )}
      </section>
    </div>
  );
}
