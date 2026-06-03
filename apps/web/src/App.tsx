import { useEffect, useMemo, useState } from "react";
import type { Note } from "@assini/db";
import type { DashboardData } from "./api";
import { fetchDashboardData, reviewNote, runEvaluation, submitExerciseAnswer } from "./api";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function App() {
  const [selectedLanguageId, setSelectedLanguageId] = useState("avenik");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [answer, setAnswer] = useState("");
  const [exerciseResult, setExerciseResult] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    setLoadState({ status: "loading" });
    setExerciseResult(null);
    setAnswer("");

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
  const firstExercise = data?.exercises[0];
  const isWorkflowBusy = isEvaluating || reviewingNoteId !== null || isGrading;

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
    if (!firstExercise || submittedAnswer.length === 0) {
      return;
    }

    setIsGrading(true);
    setExerciseResult(null);

    try {
      const submission = await submitExerciseAnswer(firstExercise.id, submittedAnswer);
      setExerciseResult(submission.explanation);
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

            <section>
              <div className="section-heading">
                <h2>Note Review Queue</h2>
                <span>{data.notes.length} notes</span>
              </div>
              <div className="item-list">
                {data.notes.length === 0 && <p className="empty-state">No notes awaiting review.</p>}
                {data.notes.map((note) => (
                  <article key={note.id} className="record">
                    <h3>{note.topic}</h3>
                    <p>{note.explanation}</p>
                    <div className="pill-row">
                      <span className="pill">{note.status}</span>
                      <span className="pill">{note.confidence} confidence</span>
                      <span className="pill">{note.evidenceCount} evidence links</span>
                    </div>
                    <div className="review-actions">
                      <button
                        type="button"
                        aria-label={`Approve ${note.topic}`}
                        disabled={reviewingNoteId !== null}
                        onClick={() => handleReviewNote(note, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Contest ${note.topic}`}
                        disabled={reviewingNoteId !== null}
                        onClick={() => handleReviewNote(note, "contested")}
                      >
                        Contest
                      </button>
                    </div>
                  </article>
                ))}
              </div>
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
              {firstExercise ? (
                <article className="record exercise-card">
                  <span className="pill">{firstExercise.type}</span>
                  <h3>{firstExercise.prompt}</h3>
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
                </article>
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
