import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CorpusPassage, Note } from "@assini/api-contract";
import { ConfidenceBadge, StatusBadge } from "../components/badges";
import { DetailBlock } from "../components/DetailBlock";
import { formatEvidenceLabel, formatNoteEditAction, localizeApiError } from "../lib/format";
import { useI18n } from "../i18n";
import type { NoteReviewEdits } from "../hooks/useReviewWorkspace";
import type { ReviewFilter, ReviewStatus } from "../lib/types";

const REVIEW_FILTERS: ReviewFilter[] = ["all", "pending", "contested", "rejected", "deferred", "escalated", "approved"];
const REVIEW_SORTS = ["newest", "oldest", "evidence"] as const;
type ReviewSort = (typeof REVIEW_SORTS)[number];

type NoteExample = Note["examples"][number];

function matchesReviewFilter(note: Note, filter: ReviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return note.status === "draft" || note.status === "under_review";
  return note.status === filter;
}

function noteSortTimestamp(note: Note): number {
  const reviewedAt = note.reviewer?.lastReviewedAt;
  if (reviewedAt) {
    const reviewedTime = Date.parse(reviewedAt);
    if (!Number.isNaN(reviewedTime)) return reviewedTime;
  }
  const history = note.editHistory;
  if (history.length > 0) {
    const last = history[history.length - 1]?.at;
    if (last) {
      const historyTime = Date.parse(last);
      if (!Number.isNaN(historyTime)) return historyTime;
    }
  }
  return 0;
}

function compareReviewNotes(left: Note, right: Note, sort: ReviewSort): number {
  if (sort === "evidence") {
    const byEvidence = right.evidenceCount - left.evidenceCount;
    if (byEvidence !== 0) return byEvidence;
  }
  const leftTime = noteSortTimestamp(left);
  const rightTime = noteSortTimestamp(right);
  const byTime = sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  if (byTime !== 0) return byTime;
  return left.id.localeCompare(right.id);
}

function cloneExamples(examples: NoteExample[]): NoteExample[] {
  return examples.map((example) => ({ ...example }));
}

function examplesEqual(left: NoteExample[], right: NoteExample[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exampleFromPassage(passage: CorpusPassage): NoteExample {
  return {
    passageId: passage.id,
    target: passage.textTarget,
    translation: passage.textTranslation
  };
}

export function ReviewView({
  notes,
  corpus = [],
  selectedNote,
  isWorkflowBusy,
  reviewingNoteId,
  actionError = null,
  onSelectNote,
  onReview,
  onSaveExplanation
}: {
  notes: Note[];
  corpus?: CorpusPassage[];
  selectedNote: Note | null;
  isWorkflowBusy: boolean;
  reviewingNoteId: string | null;
  actionError?: string | null;
  onSelectNote: (noteId: string) => void;
  onReview: (status: ReviewStatus) => void;
  onSaveExplanation: (edits: NoteReviewEdits) => Promise<void>;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [noteExplanationDraft, setNoteExplanationDraft] = useState(selectedNote?.explanation ?? "");
  const [examplesDraft, setExamplesDraft] = useState<NoteExample[]>(() => cloneExamples(selectedNote?.examples ?? []));
  const [passageToAdd, setPassageToAdd] = useState("");
  const [noteEditMessage, setNoteEditMessage] = useState<string | null>(null);
  const [noteEditError, setNoteEditError] = useState<string | null>(null);
  const counts = useMemo(
    () =>
      notes.reduce<Record<ReviewFilter, number>>(
        (nextCounts, note) => {
          nextCounts.all += 1;
          if (note.status === "draft" || note.status === "under_review") {
            nextCounts.pending += 1;
          } else if (note.status in nextCounts) {
            nextCounts[note.status as ReviewFilter] += 1;
          }
          return nextCounts;
        },
        { all: 0, pending: 0, contested: 0, rejected: 0, deferred: 0, escalated: 0, approved: 0 }
      ),
    [notes]
  );
  const filteredNotes = useMemo(() => {
    const matched = filter === "all" ? notes : notes.filter((note) => matchesReviewFilter(note, filter));
    return matched.slice().sort((left, right) => compareReviewNotes(left, right, sort));
  }, [filter, notes, sort]);
  // Hide detail when the selection is outside the active filter so Approve/etc.
  // never apply to a note the queue is not listing.
  const detailNote = useMemo(() => {
    if (!selectedNote) return null;
    return filteredNotes.some((note) => note.id === selectedNote.id) ? selectedNote : null;
  }, [filteredNotes, selectedNote]);
  const languagePassages = useMemo(() => {
    if (!detailNote) return [];
    return corpus.filter((passage) => passage.languageId === detailNote.languageId);
  }, [corpus, detailNote]);
  const availablePassages = useMemo(() => {
    const used = new Set(examplesDraft.map((example) => example.passageId));
    return languagePassages.filter((passage) => !used.has(passage.id));
  }, [examplesDraft, languagePassages]);
  const detailExamples = detailNote?.examples;
  useEffect(() => {
    setNoteExplanationDraft(detailNote?.explanation ?? "");
    setExamplesDraft(cloneExamples(detailExamples ?? []));
    setPassageToAdd("");
    setNoteEditMessage(null);
    setNoteEditError(null);
  }, [detailNote?.id, detailNote?.explanation, detailExamples]);
  useEffect(() => {
    if (passageToAdd && !availablePassages.some((passage) => passage.id === passageToAdd)) {
      setPassageToAdd(availablePassages[0]?.id ?? "");
    } else if (!passageToAdd && availablePassages[0]) {
      setPassageToAdd(availablePassages[0].id);
    }
  }, [availablePassages, passageToAdd]);
  const trimmedDraft = noteExplanationDraft.trim();
  const reviewActionsDisabled = reviewingNoteId !== null || isWorkflowBusy;
  const explanationChanged = detailNote !== null && trimmedDraft.length > 0 && trimmedDraft !== detailNote.explanation;
  const examplesChanged = detailNote !== null && !examplesEqual(examplesDraft, detailNote.examples);
  const canSaveNoteEdits =
    detailNote !== null && (explanationChanged || examplesChanged) && trimmedDraft.length > 0 && !reviewActionsDisabled;

  function clearEditFeedback() {
    setNoteEditMessage(null);
    setNoteEditError(null);
  }

  function handleAddExample() {
    const passage = availablePassages.find((item) => item.id === passageToAdd);
    if (!passage) return;
    setExamplesDraft((current) => [...current, exampleFromPassage(passage)]);
    clearEditFeedback();
  }

  function handleRemoveExample(index: number) {
    setExamplesDraft((current) => current.filter((_, itemIndex) => itemIndex !== index));
    clearEditFeedback();
  }

  function handleReplaceExample(index: number, passageId: string) {
    const passage = languagePassages.find((item) => item.id === passageId);
    if (!passage) return;
    setExamplesDraft((current) =>
      current.map((example, itemIndex) => (itemIndex === index ? exampleFromPassage(passage) : example))
    );
    clearEditFeedback();
  }

  async function handleSaveExplanation(event: FormEvent) {
    event.preventDefault();
    if (!canSaveNoteEdits || !detailNote) return;
    setNoteEditError(null);
    try {
      await onSaveExplanation({
        explanation: trimmedDraft,
        examples: cloneExamples(examplesDraft)
      });
      setNoteEditMessage(
        explanationChanged && examplesChanged
          ? t("reviewView.noteExplanationAndExamplesUpdated")
          : examplesChanged
            ? t("reviewView.noteExamplesUpdated")
            : t("reviewView.noteExplanationUpdated")
      );
    } catch (error) {
      setNoteEditMessage(null);
      setNoteEditError(localizeApiError(error, t, "errors.noteExplanationUpdateFailed"));
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

        <div className="pill-row review-sort-bar" aria-label={t("reviewView.sortAria")}>
          <span className="muted">{t("reviewView.sortLabel")}</span>
          {REVIEW_SORTS.map((item) => (
            <button
              type="button"
              key={item}
              className={sort === item ? "active" : "secondary"}
              aria-pressed={sort === item}
              onClick={() => setSort(item)}
            >
              {t(`reviewView.sort.${item}`)}
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
            <div className="empty-state" role="status" aria-live="polite">
              <p>
                {filter === "all"
                  ? t("reviewView.noNotesForLanguage")
                  : t("reviewView.noNotesInFilterNamed", { filter: t(`reviewView.filter.${filter}`) })}
              </p>
              <p className="muted">
                {filter === "all" ? t("reviewView.noNotesForLanguageHint") : t("reviewView.noNotesInFilterHint")}
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
                    clearEditFeedback();
                  }}
                />
              </div>

              <div className="form-group note-examples-editor" aria-label={t("reviewView.examplesEditor")}>
                <span className="detail-label">{t("reviewView.examples")}</span>
                {examplesDraft.length === 0 ? (
                  <p className="inline-empty" role="status" aria-live="polite">
                    {t("reviewView.noExamplesSupplied")}
                  </p>
                ) : (
                  <div className="detail-list">
                    {examplesDraft.map((example, index) => {
                      const replaceOptions = languagePassages.filter(
                        (passage) =>
                          passage.id === example.passageId ||
                          !examplesDraft.some(
                            (other, otherIndex) => otherIndex !== index && other.passageId === passage.id
                          )
                      );
                      return (
                        <div key={`${index}:${example.passageId}`} className="detail-row example-row example-edit-row">
                          <label className="visually-hidden" htmlFor={`note-example-passage-${index}`}>
                            {t("reviewView.examplePassage")}
                          </label>
                          <select
                            id={`note-example-passage-${index}`}
                            value={example.passageId}
                            disabled={reviewActionsDisabled || languagePassages.length === 0}
                            onChange={(event) => handleReplaceExample(index, event.target.value)}
                          >
                            {replaceOptions.map((passage) => (
                              <option key={passage.id} value={passage.id}>
                                {passage.textTarget}
                              </option>
                            ))}
                          </select>
                          <code>{example.target}</code>
                          <span>{example.translation}</span>
                          <button
                            type="button"
                            className="secondary"
                            disabled={reviewActionsDisabled}
                            onClick={() => handleRemoveExample(index)}
                          >
                            {t("reviewView.removeExample")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="example-add-row">
                  <label htmlFor="note-example-add-passage">{t("reviewView.addExampleFromPassage")}</label>
                  <div>
                    <select
                      id="note-example-add-passage"
                      value={passageToAdd}
                      disabled={reviewActionsDisabled || availablePassages.length === 0}
                      onChange={(event) => {
                        setPassageToAdd(event.target.value);
                        clearEditFeedback();
                      }}
                    >
                      {availablePassages.length === 0 ? (
                        <option value="">{t("reviewView.noPassagesAvailable")}</option>
                      ) : (
                        availablePassages.map((passage) => (
                          <option key={passage.id} value={passage.id}>
                            {passage.textTarget}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      className="secondary"
                      disabled={reviewActionsDisabled || availablePassages.length === 0 || !passageToAdd}
                      onClick={handleAddExample}
                    >
                      {t("reviewView.addExample")}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="secondary"
                disabled={!canSaveNoteEdits}
                aria-busy={reviewingNoteId === detailNote.id}
              >
                {reviewingNoteId === detailNote.id ? t("reviewView.saving") : t("reviewView.saveNoteEdits")}
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

            <DetailBlock title={t("reviewView.reviewerComments")}>
              {detailNote.reviewer.comments.length === 0 ? (
                <p className="inline-empty" role="status" aria-live="polite">
                  {t("reviewView.noReviewerComments")}
                </p>
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
                <p className="inline-empty" role="status" aria-live="polite">
                  {t("reviewView.noEditHistory")}
                </p>
              ) : (
                <div className="detail-list">
                  {detailNote.editHistory.map((entry, index) => (
                    <div key={`${index}:${entry.at}:${entry.action}:${entry.summary}`} className="detail-row">
                      <strong>{formatNoteEditAction(entry.action, t)}</strong>
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
          <div className="empty-state" role="status" aria-live="polite">
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
