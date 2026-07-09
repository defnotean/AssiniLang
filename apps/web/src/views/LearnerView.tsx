import { useEffect, useState, type FormEvent } from "react";
import {
  fetchRecommendedExercises,
  validateExerciseAuthoring,
  type ExerciseAuthoringPayload,
  type RecommendedExercises
} from "../api";
import type { LearnerWorkspace } from "../hooks/useLearnerWorkspace";
import { formatSubmissionStatus, parseAuthoringList } from "../lib/format";
import { useI18n } from "../i18n";
import type { AsyncState, PublicExercise } from "../lib/types";
import { LearnerPracticeNextPanel } from "./LearnerPracticeNextPanel";

const EXERCISE_TYPES = ["translate_to_target", "translate_to_english", "segment", "choose_particle"] as const;

export function LearnerView({
  languageId,
  exercises,
  learner,
  isWorkflowBusy
}: {
  languageId: string | null;
  exercises: PublicExercise[];
  learner: LearnerWorkspace;
  isWorkflowBusy: boolean;
}) {
  const {
    selectedExercise,
    selectedExerciseId,
    exerciseAnswer,
    isGrading,
    exerciseResult,
    isLoadingSubmissions,
    submissionHistory,
    setSelectedExerciseId: onSelectExercise,
    setExerciseAnswer: onAnswerChange,
    handleGrade: onGrade,
    handleCreateExercise: onCreateExercise,
    handleGenerateExercise: onGenerateExercise
  } = learner;
  const { t } = useI18n();
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
  const [isValidatingExercise, setIsValidatingExercise] = useState(false);
  const [isGeneratingExercise, setIsGeneratingExercise] = useState(false);
  const [practiceState, setPracticeState] = useState<AsyncState<RecommendedExercises>>({ status: "idle" });

  useEffect(() => {
    if (!languageId) {
      setPracticeState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setPracticeState({ status: "loading" });
    fetchRecommendedExercises(languageId)
      .then((data) => {
        if (!cancelled) setPracticeState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPracticeState({
            status: "error",
            message: error instanceof Error ? error.message : t("learner.practiceRecommendationsLoadError")
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [languageId, t]);
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

  const canValidateExercise = canCreateExercise && !isValidatingExercise;

  function buildAuthoringPayload(): ExerciseAuthoringPayload {
    return {
      type: authoringType,
      prompt: authoringPrompt.trim(),
      allowedVocabulary: parseAuthoringList(authoringVocabulary),
      allowedRuleIds: parseAuthoringList(authoringRules),
      expectedAnswers: parseAuthoringList(authoringAnswers),
      adversarialAnswers: [
        { answer: authoringAdversarialAnswerOne.trim(), reason: authoringAdversarialReasonOne.trim() },
        { answer: authoringAdversarialAnswerTwo.trim(), reason: authoringAdversarialReasonTwo.trim() }
      ],
      gradingExplanation: authoringExplanation.trim()
    };
  }

  async function handleValidateExercise() {
    if (!canValidateExercise || !languageId) {
      if (!languageId) {
        setAuthoringMessage(null);
        setAuthoringError(t("learner.validateExerciseNoLanguage"));
      }
      return;
    }

    setIsValidatingExercise(true);
    setAuthoringMessage(null);
    setAuthoringError(null);
    try {
      const validation = await validateExerciseAuthoring(languageId, buildAuthoringPayload());
      if (validation.ok) {
        const probeCount = validation.preview?.adversarialAnswers.length ?? 0;
        const answerCount = validation.preview?.expectedAnswers.length ?? 0;
        const dryRunPrefix = t("learner.validateExerciseDryRunNote");
        const success = validation.warnings.length > 0
          ? `${t("learner.validateExerciseSuccess", { probeCount, answerCount })} ${validation.warnings.join(" ")}`
          : t("learner.validateExerciseSuccess", { probeCount, answerCount });
        setAuthoringMessage(`${dryRunPrefix} ${success}`);
      } else {
        setAuthoringError(validation.errors.join(" "));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("learner.validateExerciseFailed");
      setAuthoringError(message);
    } finally {
      setIsValidatingExercise(false);
    }
  }

  async function handleCreateExercise(event: FormEvent) {
    event.preventDefault();
    if (!canCreateExercise) return;

    setIsCreatingExercise(true);
    setAuthoringMessage(null);
    setAuthoringError(null);
    try {
      await onCreateExercise(buildAuthoringPayload());
      setAuthoringMessage(t("learner.exerciseAuthored"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("learner.exerciseAuthoringFailed");
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

      if ((EXERCISE_TYPES as readonly string[]).includes(exercise.type)) {
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

      const base = t("learner.draftGenerated");
      setAuthoringMessage(warnings.length > 0 ? `${base} ${warnings.join(" ")}` : base);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("learner.modelExerciseGenerationFailed");
      setAuthoringError(message);
    } finally {
      setIsGeneratingExercise(false);
    }
  }

  return (
    <div className="exercise-workbench">
      <LearnerPracticeNextPanel
        practiceState={practiceState}
        isWorkflowBusy={isWorkflowBusy}
        onSelectExercise={onSelectExercise}
      />

      <section className="exercise-list" aria-label={t("learner.exerciseSelector")}>
        <div className="panel-heading">{t("learner.exercisesCount", { count: exercises.length })}</div>
        {exercises.length === 0 ? (
          <p className="empty-state">{t("learner.noExercisesAvailable")}</p>
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
              <small>{t(`exerciseType.${exercise.type}`)}</small>
            </button>
          ))
        )}
      </section>

      <section className="detail-panel exercise-detail" aria-label={t("learner.exerciseDetailPanel")}>
        {selectedExercise ? (
          <article className="record-card" aria-label={t("learner.selectedExerciseDetail")}>
            <span className="pill">{t(`exerciseType.${selectedExercise.type}`)}</span>
            <h2>{selectedExercise.prompt}</h2>
            <dl className="detail-grid exercise-context">
              <div>
                <dt>{t("learner.allowedVocabulary")}</dt>
                <dd className="token-list">
                  {selectedExercise.allowedVocabulary.map((token, index) => (
                    <code key={`${index}:${token}`}>{token}</code>
                  ))}
                </dd>
              </div>
              <div>
                <dt>{t("learner.rules")}</dt>
                <dd className="token-list">
                  {selectedExercise.allowedRuleIds.map((rule, index) => (
                    <span className="pill" key={`${index}:${rule}`}>{rule}</span>
                  ))}
                </dd>
              </div>
            </dl>

            <label className="field-label" htmlFor="exercise-answer">
              {t("learner.exerciseAnswer")}
            </label>
            <textarea
              id="exercise-answer"
              value={exerciseAnswer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder={t("learner.typeYourAnswerHere")}
            />
            <button
              type="button"
              className="full-width"
              onClick={onGrade}
              disabled={isGrading || exerciseAnswer.trim().length === 0}
              aria-busy={isGrading}
            >
              {isGrading ? t("learner.grading") : t("learner.grade")}
            </button>
            {exerciseResult && (
              <p className="result-notice" role="status" aria-live="polite">
                {exerciseResult}
              </p>
            )}

            <section className="submission-history" aria-label={t("learner.exerciseSubmissionHistory")}>
              <h3>{t("learner.submissionHistory")}</h3>
              {isLoadingSubmissions ? (
                <p className="inline-empty" role="status" aria-live="polite">
                  {t("learner.loadingSubmissions")}
                </p>
              ) : submissionHistory.length === 0 ? (
                <div className="inline-empty" role="status" aria-live="polite">
                  <p>{t("learner.noSubmissionsYet")}</p>
                  <p className="muted">{t("learner.noSubmissionsHint")}</p>
                </div>
              ) : (
                <div className="detail-list">
                  {submissionHistory.map((submission) => (
                    <div key={submission.id} className="detail-row">
                      <strong>{formatSubmissionStatus(submission, t)}</strong>
                      <span>{submission.explanation}</span>
                      <span className="muted">{submission.submittedAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </article>
        ) : (
          <p className="empty-state">{t("learner.noExercisesAuthorOrSelect")}</p>
        )}

        <form className="record-card form-panel compact exercise-authoring-form" aria-label={t("learner.exerciseAuthoring")} onSubmit={handleCreateExercise}>
          <div>
            <span className="detail-label">{t("learner.exerciseAuthoring")}</span>
            <h3>{t("learner.createLearnerTask")}</h3>
            {exercises.length === 0 && (
              <p className="inline-empty muted">{t("learner.exerciseAuthoringEmptyHint")}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-type">{t("learner.exerciseType")}</label>
            <select
              id="exercise-author-type"
              value={authoringType}
              onChange={(event) => {
                setAuthoringType(event.target.value as PublicExercise["type"]);
                clearAuthoringNotice();
              }}
            >
              {EXERCISE_TYPES.map((type) => (
                <option key={type} value={type}>{t(`exerciseType.${type}`)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-prompt">{t("learner.exercisePrompt")}</label>
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
            <label htmlFor="exercise-author-vocabulary">{t("learner.allowedVocabulary")}</label>
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
            <label htmlFor="exercise-author-rules">{t("learner.allowedRuleIds")}</label>
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
            <label htmlFor="exercise-author-answers">{t("learner.expectedAnswers")}</label>
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
            <label htmlFor="exercise-author-adversarial-answer-one">{t("learner.adversarialAnswer1")}</label>
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
            <label htmlFor="exercise-author-adversarial-reason-one">{t("learner.adversarialReason1")}</label>
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
            <label htmlFor="exercise-author-adversarial-answer-two">{t("learner.adversarialAnswer2")}</label>
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
            <label htmlFor="exercise-author-adversarial-reason-two">{t("learner.adversarialReason2")}</label>
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
            <label htmlFor="exercise-author-explanation">{t("learner.gradingExplanation")}</label>
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
              disabled={isWorkflowBusy || isCreatingExercise || isGeneratingExercise || isValidatingExercise}
              aria-busy={isGeneratingExercise}
            >
              {isGeneratingExercise ? t("learner.generating") : t("learner.generateWithModel")}
            </button>
            <button
              type="button"
              className="secondary"
              aria-label={t("learner.validateExerciseAria")}
              aria-describedby="exercise-validate-dry-run-hint"
              disabled={!canValidateExercise}
              aria-busy={isValidatingExercise}
              onClick={() => void handleValidateExercise()}
            >
              {isValidatingExercise ? t("learner.validatingExercise") : t("learner.validateExercise")}
            </button>
            <button
              type="submit"
              className="secondary"
              disabled={!canCreateExercise}
              aria-busy={isCreatingExercise}
            >
              {isCreatingExercise ? t("learner.creating") : t("learner.createExercise")}
            </button>
          </div>
          <p id="exercise-validate-dry-run-hint" className="inline-empty muted">
            {t("learner.validateExerciseDryRunHint")}
          </p>
          {authoringMessage && <p className="result-notice" role="status" aria-live="polite">{authoringMessage}</p>}
          {authoringError && <p className="result-notice error" role="alert">{authoringError}</p>}
        </form>
      </section>
    </div>
  );
}
