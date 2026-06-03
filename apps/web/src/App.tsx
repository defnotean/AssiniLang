import { useEffect, useMemo, useState } from "react";
import type { Note } from "@assini/db";
import type { DashboardData, PublicExerciseSubmission } from "./api";
import {
  fetchDashboardData,
  fetchExerciseSubmissions,
  reviewNote,
  runEvaluation,
  submitExerciseAnswer
} from "./api";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatEvidenceLabel(count: number): string {
  return `${count} evidence ${count === 1 ? "link" : "links"}`;
}

function formatSubmissionStatus(submission: PublicExerciseSubmission): string {
  return submission.accepted ? "Accepted" : "Needs review";
}

export function App() {
  const [selectedLanguageId, setSelectedLanguageId] = useState("avenik");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [answer, setAnswer] = useState("");
  const [exerciseResult, setExerciseResult] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<PublicExerciseSubmission[]>([]);

  useEffect(() => {
    let isCurrent = true;

    setLoadState({ status: "loading" });
    setExerciseResult(null);
    setAnswer("");
    setSelectedExerciseId(null);
    setSubmissionHistory([]);

    fetchDashboardData(selectedLanguageId)
      .then((data) => {
        if (isCurrent) {
          setLoadState({ status: "ready", data });
        }
      })
      .catch((error: Error) => {
        if (isCurrent) {
          setLoadState({ status: "error", message: error.message });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId]);

  const data = loadState.status === "ready" ? loadState.data : null;
  const selectedLanguage = data?.languages.find((language) => language.id === selectedLanguageId);
  const latestEvaluations = useMemo(() => data?.evaluations.slice(-4).reverse() ?? [], [data]);
  const selectedNote = useMemo(() => {
    if (!data || data.notes.length === 0) {
      return null;
    }

    return data.notes.find((note) => note.id === selectedNoteId) ?? data.notes[0];
  }, [data, selectedNoteId]);
  const selectedExercise = useMemo(() => {
    if (!data || data.exercises.length === 0) {
      return null;
    }

    return data.exercises.find((exercise) => exercise.id === selectedExerciseId) ?? data.exercises[0];
  }, [data, selectedExerciseId]);
  const isWorkflowBusy = isEvaluating || reviewingNoteId !== null || isGrading;

  useEffect(() => {
    let isCurrent = true;

    if (!selectedExercise) {
      setSubmissionHistory([]);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoadingSubmissions(true);
    fetchExerciseSubmissions(selectedExercise.id)
      .then((history) => {
        if (isCurrent) {
          setSubmissionHistory(history);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSubmissionHistory([]);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingSubmissions(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedExercise]);

  async function handleRunEvaluation() {
    setIsEvaluating(true);

    try {
      await runEvaluation();
      const refreshed = await fetchDashboardData(selectedLanguageId);
      setLoadState({ status: "ready", data: refreshed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation run failed";
      setLoadState({ status: "error", message });
    } finally {
      setIsEvaluating(false);
    }
  }

  async function handleReviewNote(note: Note, status: Extract<Note["status"], "approved" | "contested">) {
    setReviewingNoteId(note.id);

    try {
      await reviewNote(note.id, {
        status,
        reviewerComment:
          status === "approved" ? "Approved in local prototype." : "Contested in local prototype."
      });
      const refreshed = await fetchDashboardData(selectedLanguageId);
      setLoadState({ status: "ready", data: refreshed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Note review failed";
      setLoadState({ status: "error", message });
    } finally {
      setReviewingNoteId(null);
    }
  }

  async function handleGradeExercise() {
    const submittedAnswer = answer.trim();
    if (!selectedExercise || submittedAnswer.length === 0) {
      return;
    }

    setIsGrading(true);
    setExerciseResult(null);

    try {
      const submission = await submitExerciseAnswer(selectedExercise.id, submittedAnswer);
      setExerciseResult(submission.explanation);
      setSubmissionHistory(await fetchExerciseSubmissions(selectedExercise.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exercise submission failed";
      setExerciseResult(message);
    } finally {
      setIsGrading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Synthetic fixtures only</p>
          <h1>Synthetic Language Evaluation</h1>
        </div>
        <button type="button" onClick={handleRunEvaluation} disabled={isWorkflowBusy || loadState.status === "loading"}>
          {isEvaluating ? "Running..." : "Run Evaluation"}
        </button>
      </header>

      {loadState.status === "loading" && (
        <p className="status" role="status" aria-live="polite">
          Loading synthetic data...
        </p>
      )}
      {loadState.status === "error" && (
        <p className="status error" role="alert">
          {loadState.message}
        </p>
      )}

      {data && (
        <>
          <section className="language-strip" aria-label="Language selector">
            {data.languages.map((language) => (
              <button
                type="button"
                key={language.id}
                className={language.id === selectedLanguageId ? "selected" : ""}
                aria-pressed={language.id === selectedLanguageId}
                disabled={isWorkflowBusy}
                onClick={() => setSelectedLanguageId(language.id)}
              >
                <span>{language.name}</span>
                <small>{language.typology}</small>
              </button>
            ))}
          </section>

          <section className="summary-band">
            <div>
              <h2>{selectedLanguage?.name ?? "Language"}</h2>
              <p>{selectedLanguage?.description ?? "Select a synthetic language to inspect its test fixtures."}</p>
            </div>
            <strong>Fake test data. Do not treat as a real language.</strong>
          </section>

          <div className="surface-grid">
            <section>
              <div className="section-heading">
                <h2>Corpus Browser</h2>
                <span>{data.corpus.length} passages</span>
              </div>
              <div className="item-list">
                {data.corpus.length === 0 && <p className="empty-state">No corpus passages loaded.</p>}
                {data.corpus.slice(0, 5).map((passage) => (
                  <article key={passage.id} className="record">
                    <div className="record-topline">
                      <h3>{passage.textTarget}</h3>
                      <span className="pill">{passage.source}</span>
                    </div>
                    <p>{passage.textTranslation}</p>
                    <code>
                      {passage.morphologicalSegmentation
                        .map((part) => `${part.surface}:${part.gloss}`)
                        .join(" ")}
                    </code>
                  </article>
                ))}
              </div>
            </section>

            <section className="review-workspace-section">
              <div className="section-heading">
                <h2>Note Review Queue</h2>
                <span>{data.notes.length} notes</span>
              </div>
              {data.notes.length === 0 && <p className="empty-state">No notes awaiting review.</p>}
              {selectedNote && (
                <div className="review-workspace">
                  <div className="note-queue-list" aria-label="Review queue">
                    {data.notes.map((note) => (
                      <button
                        type="button"
                        key={note.id}
                        className={`note-queue-item${note.id === selectedNote.id ? " selected" : ""}`}
                        aria-label={`Select note ${note.topic}`}
                        aria-pressed={note.id === selectedNote.id}
                        disabled={isWorkflowBusy}
                        onClick={() => setSelectedNoteId(note.id)}
                      >
                        <span className="note-queue-topic">{note.topic}</span>
                        <span className="note-queue-summary">{note.explanation}</span>
                        <span className="pill-row">
                          <span className="pill">{note.status}</span>
                          <span className="pill">{note.confidence} confidence</span>
                          <span className="pill">{formatEvidenceLabel(note.evidenceCount)}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <article className="record note-detail" aria-label="Selected note detail">
                    <div className="record-topline">
                      <div>
                        <span className="detail-label">Selected note</span>
                        <h3>{selectedNote.topic}</h3>
                      </div>
                      <div className="pill-row">
                        <span className="pill">{selectedNote.status}</span>
                        <span className="pill">{selectedNote.confidence} confidence</span>
                      </div>
                    </div>
                    <p>{selectedNote.explanation}</p>

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

                    <div className="detail-block">
                      <h4>Evidence IDs</h4>
                      <div className="pill-row">
                        {selectedNote.evidencePassageIds.map((passageId) => (
                          <span key={passageId} className="pill">
                            {passageId}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="detail-block">
                      <h4>Examples</h4>
                      <div className="detail-list">
                        {selectedNote.examples.map((example) => (
                          <div key={example.passageId} className="detail-row">
                            <code>{example.target}</code>
                            <span>{example.translation}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="detail-block">
                      <h4>Reviewer comments</h4>
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
                    </div>

                    <div className="detail-block">
                      <h4>Edit history</h4>
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
                    </div>

                    <div className="review-actions">
                      <button
                        type="button"
                        aria-label={`Approve ${selectedNote.topic}`}
                        disabled={reviewingNoteId !== null}
                        onClick={() => handleReviewNote(selectedNote, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Contest ${selectedNote.topic}`}
                        disabled={reviewingNoteId !== null}
                        onClick={() => handleReviewNote(selectedNote, "contested")}
                      >
                        Contest
                      </button>
                    </div>
                  </article>
                </div>
              )}
            </section>

            <section>
              <div className="section-heading">
                <h2>Evaluation Dashboard</h2>
                <span>{latestEvaluations.length} recent</span>
              </div>
              <div className="item-list">
                {latestEvaluations.length === 0 && <p className="empty-state">No evaluation runs yet.</p>}
                {latestEvaluations.map((run) => (
                  <article key={run.id} className="record">
                    <div className="record-topline">
                      <h3>{run.languageId}</h3>
                      <span className="pill">{run.createdAt}</span>
                    </div>
                    <p>{run.summary}</p>
                    <code>
                      {Object.entries(run.scores)
                        .map(([key, value]) => `${key}: ${formatScore(value)}`)
                        .join(" | ")}
                    </code>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div className="section-heading">
                <h2>Learner Exercise Preview</h2>
                <span>{data.exercises.length} exercises</span>
              </div>
              {selectedExercise ? (
                <div className="exercise-workspace">
                  <div className="exercise-selector" aria-label="Exercise selector">
                    {data.exercises.map((exercise) => (
                      <button
                        type="button"
                        key={exercise.id}
                        className={`exercise-selector-item${exercise.id === selectedExercise.id ? " selected" : ""}`}
                        aria-pressed={exercise.id === selectedExercise.id}
                        disabled={isWorkflowBusy}
                        onClick={() => {
                          setSelectedExerciseId(exercise.id);
                          setAnswer("");
                          setExerciseResult(null);
                        }}
                      >
                        <span>{exercise.prompt}</span>
                        <small>{exercise.type}</small>
                      </button>
                    ))}
                  </div>

                  <article className="record exercise-card">
                    <span className="pill">{selectedExercise.type}</span>
                    <h3>{selectedExercise.prompt}</h3>
                    <div className="detail-grid exercise-context">
                      <div>
                        <dt>Vocabulary</dt>
                        <dd>{selectedExercise.allowedVocabulary.join(" ")}</dd>
                      </div>
                      <div>
                        <dt>Rules</dt>
                        <dd>{selectedExercise.allowedRuleIds.join(" ")}</dd>
                      </div>
                    </div>
                  <label>
                    <span>Answer</span>
                    <input
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      aria-label="Exercise answer"
                    />
                  </label>
                  <button type="button" onClick={handleGradeExercise} disabled={isGrading || answer.trim().length === 0}>
                    {isGrading ? "Grading..." : "Grade"}
                  </button>
                  {exerciseResult && <p className="exercise-result">{exerciseResult}</p>}
                    <section className="submission-history" aria-label="Exercise submission history">
                      <h4>Submission History</h4>
                      {isLoadingSubmissions ? (
                        <p className="inline-empty">Loading submissions.</p>
                      ) : submissionHistory.length === 0 ? (
                        <p className="inline-empty">No submissions yet.</p>
                      ) : (
                        <div className="detail-list">
                          {submissionHistory.map((submission) => (
                            <div key={submission.id} className="detail-row">
                              <strong>{formatSubmissionStatus(submission)}</strong>
                              <span>{submission.explanation}</span>
                              <span className="muted">{submission.submittedAt}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </article>
                </div>
              ) : (
                <p className="empty-state">No exercise available.</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
