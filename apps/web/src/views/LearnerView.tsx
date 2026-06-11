import { useState, type FormEvent } from "react";
import type { ExerciseAuthoringPayload, GeneratedExerciseDraft, PublicExerciseSubmission } from "../api";
import { formatSubmissionStatus, parseAuthoringList } from "../lib/format";
import { EXERCISE_TYPE_LABELS } from "../lib/viewConfig";
import type { PublicExercise } from "../lib/types";

export function LearnerView({
  exercises,
  selectedExercise,
  selectedExerciseId,
  isWorkflowBusy,
  exerciseAnswer,
  isGrading,
  exerciseResult,
  isLoadingSubmissions,
  submissionHistory,
  onSelectExercise,
  onAnswerChange,
  onGrade,
  onCreateExercise,
  onGenerateExercise
}: {
  exercises: PublicExercise[];
  selectedExercise: PublicExercise | null;
  selectedExerciseId: string | null;
  isWorkflowBusy: boolean;
  exerciseAnswer: string;
  isGrading: boolean;
  exerciseResult: string | null;
  isLoadingSubmissions: boolean;
  submissionHistory: PublicExerciseSubmission[];
  onSelectExercise: (exerciseId: string) => void;
  onAnswerChange: (answer: string) => void;
  onGrade: () => void;
  onCreateExercise: (payload: ExerciseAuthoringPayload) => Promise<void>;
  onGenerateExercise: (
    options?: { type?: string }
  ) => Promise<{ exercise: GeneratedExerciseDraft; warnings: string[] }>;
}) {
  const [authoringType, setAuthoringType] = useState<PublicExercise["type"]>("translate_to_target");
  const [authoringPrompt, setAuthoringPrompt] = useState("");
  const [authoringVocabulary, setAuthoringVocabulary] = useState("");
  const [authoringRules, setAuthoringRules] = useState("");
  const [authoringAnswers, setAuthoringAnswers] = useState("");
  const [authoringAdversarialAnswerOne, setAuthoringAdversarialAnswerOne] = useState("");
  const [authoringAdversarialReasonOne, setAuthoringAdversarialReasonOne] = useState("");
  const [authoringAdversarialAnswerTwo, setAuthoringAdversarialAnswerTwo] = useState("");
  const [authoringAdversarialReasonTwo, setAuthoringAdversarialReasonTwo] = useState("");
  const [authoringExplanation, setAuthoringExplanation] = useState("");
  const [authoringMessage, setAuthoringMessage] = useState<string | null>(null);
  const [authoringError, setAuthoringError] = useState<string | null>(null);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [isGeneratingExercise, setIsGeneratingExercise] = useState(false);
  const hasTwoAdversarialProbes = authoringAdversarialAnswerOne.trim().length > 0
    && authoringAdversarialReasonOne.trim().length > 0
    && authoringAdversarialAnswerTwo.trim().length > 0
    && authoringAdversarialReasonTwo.trim().length > 0;
  const canCreateExercise = authoringPrompt.trim().length > 0
    && authoringVocabulary.trim().length > 0
    && authoringRules.trim().length > 0
    && authoringAnswers.trim().length > 0
    && hasTwoAdversarialProbes
    && authoringExplanation.trim().length > 0
    && !isWorkflowBusy
    && !isCreatingExercise;

  function clearAuthoringNotice() {
    setAuthoringMessage(null);
    setAuthoringError(null);
  }

  async function handleCreateExercise(event: FormEvent) {
    event.preventDefault();
    if (!canCreateExercise) return;

    const adversarialAnswers = [
      { answer: authoringAdversarialAnswerOne.trim(), reason: authoringAdversarialReasonOne.trim() },
      { answer: authoringAdversarialAnswerTwo.trim(), reason: authoringAdversarialReasonTwo.trim() }
    ];

    setIsCreatingExercise(true);
    setAuthoringMessage(null);
    setAuthoringError(null);
    try {
      await onCreateExercise({
        type: authoringType,
        prompt: authoringPrompt.trim(),
        allowedVocabulary: parseAuthoringList(authoringVocabulary),
        allowedRuleIds: parseAuthoringList(authoringRules),
        expectedAnswers: parseAuthoringList(authoringAnswers),
        adversarialAnswers,
        gradingExplanation: authoringExplanation.trim()
      });
      setAuthoringMessage("Exercise authored.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exercise authoring failed";
      setAuthoringError(message);
    } finally {
      setIsCreatingExercise(false);
    }
  }

  async function handleGenerateWithModel() {
    if (isWorkflowBusy || isCreatingExercise || isGeneratingExercise) return;

    setIsGeneratingExercise(true);
    setAuthoringMessage(null);
    setAuthoringError(null);
    try {
      const { exercise, warnings } = await onGenerateExercise({ type: authoringType });

      if (exercise.type in EXERCISE_TYPE_LABELS) {
        setAuthoringType(exercise.type as PublicExercise["type"]);
      }
      setAuthoringPrompt(exercise.prompt);
      setAuthoringVocabulary(exercise.allowedVocabulary.join(", "));
      setAuthoringRules(exercise.allowedRuleIds.join(", "));
      setAuthoringAnswers(exercise.expectedAnswers.join(", "));
      setAuthoringAdversarialAnswerOne(exercise.adversarialAnswers[0]?.answer ?? "");
      setAuthoringAdversarialReasonOne(exercise.adversarialAnswers[0]?.reason ?? "");
      setAuthoringAdversarialAnswerTwo(exercise.adversarialAnswers[1]?.answer ?? "");
      setAuthoringAdversarialReasonTwo(exercise.adversarialAnswers[1]?.reason ?? "");
      setAuthoringExplanation(exercise.gradingExplanation);

      const base = "Draft generated — review before saving.";
      setAuthoringMessage(warnings.length > 0 ? `${base} ${warnings.join(" ")}` : base);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model exercise generation failed";
      setAuthoringError(message);
    } finally {
      setIsGeneratingExercise(false);
    }
  }

  return (
    <div className="exercise-workbench">
      <section className="exercise-list" aria-label="Exercise selector">
        <div className="panel-heading">{exercises.length} exercises</div>
        {exercises.length === 0 ? (
          <p className="empty-state">No exercises available.</p>
        ) : (
          exercises.map((exercise) => (
            <button
              type="button"
              key={exercise.id}
              className={`exercise-item${(selectedExerciseId ?? selectedExercise?.id) === exercise.id ? " active" : ""}`}
              aria-pressed={(selectedExerciseId ?? selectedExercise?.id) === exercise.id}
              disabled={isWorkflowBusy}
              onClick={() => onSelectExercise(exercise.id)}
            >
              <span>{exercise.prompt}</span>
              <small>{EXERCISE_TYPE_LABELS[exercise.type]}</small>
            </button>
          ))
        )}
      </section>

      <section className="detail-panel exercise-detail" aria-label="Exercise detail panel">
        {selectedExercise ? (
          <article className="record-card" aria-label="Selected exercise detail">
            <span className="pill">{EXERCISE_TYPE_LABELS[selectedExercise.type]}</span>
            <h2>{selectedExercise.prompt}</h2>
            <dl className="detail-grid exercise-context">
              <div>
                <dt>Allowed vocabulary</dt>
                <dd className="token-list">
                  {selectedExercise.allowedVocabulary.map((token) => (
                    <code key={token}>{token}</code>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Rules</dt>
                <dd className="token-list">
                  {selectedExercise.allowedRuleIds.map((rule) => (
                    <span className="pill" key={rule}>{rule}</span>
                  ))}
                </dd>
              </div>
            </dl>

            <label className="field-label" htmlFor="exercise-answer">
              Exercise answer
            </label>
            <textarea
              id="exercise-answer"
              value={exerciseAnswer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="Type your answer here"
            />
            <button type="button" className="full-width" onClick={onGrade} disabled={isGrading || exerciseAnswer.trim().length === 0}>
              {isGrading ? "Grading..." : "Grade"}
            </button>
            {exerciseResult && (
              <p className="result-notice" role="status" aria-live="polite">
                {exerciseResult}
              </p>
            )}

            <section className="submission-history" aria-label="Exercise submission history">
              <h3>Submission History</h3>
              {isLoadingSubmissions ? (
                <p className="inline-empty" role="status" aria-live="polite">
                  Loading submissions.
                </p>
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
        ) : (
          <p className="empty-state">No exercises available.</p>
        )}

        <form className="record-card form-panel compact exercise-authoring-form" aria-label="Exercise authoring" onSubmit={handleCreateExercise}>
          <div>
            <span className="detail-label">Exercise authoring</span>
            <h3>Create learner task</h3>
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-type">Exercise type</label>
            <select
              id="exercise-author-type"
              value={authoringType}
              onChange={(event) => {
                setAuthoringType(event.target.value as PublicExercise["type"]);
                clearAuthoringNotice();
              }}
            >
              {Object.entries(EXERCISE_TYPE_LABELS).map(([type, label]) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-prompt">Exercise prompt</label>
            <textarea
              id="exercise-author-prompt"
              value={authoringPrompt}
              onChange={(event) => {
                setAuthoringPrompt(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-vocabulary">Allowed vocabulary</label>
            <input
              id="exercise-author-vocabulary"
              value={authoringVocabulary}
              onChange={(event) => {
                setAuthoringVocabulary(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-rules">Allowed rule IDs</label>
            <input
              id="exercise-author-rules"
              value={authoringRules}
              onChange={(event) => {
                setAuthoringRules(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-answers">Expected answers</label>
            <textarea
              id="exercise-author-answers"
              value={authoringAnswers}
              onChange={(event) => {
                setAuthoringAnswers(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-answer-one">Adversarial answer 1</label>
            <input
              id="exercise-author-adversarial-answer-one"
              value={authoringAdversarialAnswerOne}
              onChange={(event) => {
                setAuthoringAdversarialAnswerOne(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-reason-one">Adversarial reason 1</label>
            <input
              id="exercise-author-adversarial-reason-one"
              value={authoringAdversarialReasonOne}
              onChange={(event) => {
                setAuthoringAdversarialReasonOne(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-answer-two">Adversarial answer 2</label>
            <input
              id="exercise-author-adversarial-answer-two"
              value={authoringAdversarialAnswerTwo}
              onChange={(event) => {
                setAuthoringAdversarialAnswerTwo(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-reason-two">Adversarial reason 2</label>
            <input
              id="exercise-author-adversarial-reason-two"
              value={authoringAdversarialReasonTwo}
              onChange={(event) => {
                setAuthoringAdversarialReasonTwo(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-explanation">Grading explanation</label>
            <textarea
              id="exercise-author-explanation"
              value={authoringExplanation}
              onChange={(event) => {
                setAuthoringExplanation(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="model-actions">
            <button
              type="button"
              className="secondary"
              onClick={handleGenerateWithModel}
              disabled={isWorkflowBusy || isCreatingExercise || isGeneratingExercise}
            >
              {isGeneratingExercise ? "Generating..." : "Generate with model"}
            </button>
            <button type="submit" className="secondary" disabled={!canCreateExercise}>
              {isCreatingExercise ? "Creating..." : "Create exercise"}
            </button>
          </div>
          {authoringMessage && <p className="result-notice" role="status" aria-live="polite">{authoringMessage}</p>}
          {authoringError && <p className="result-notice error" role="alert">{authoringError}</p>}
        </form>
      </section>
    </div>
  );
}
