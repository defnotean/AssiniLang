import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchRecommendedExercises,
  validateExerciseAuthoring,
  type ExerciseAuthoringPayload,
  type RecommendedExercises
} from "../api";
import type { LearnerWorkspace } from "../hooks/useLearnerWorkspace";
import {
  formatSubmissionExplanation,
  formatSubmissionStatus,
  localizeApiError,
  parseAuthoringList,
  safeDomId
} from "../lib/format";
import { useI18n } from "../i18n";
import type { AsyncState, PublicExercise, PublicNote } from "../lib/types";
import { LearnerPracticeNextPanel } from "./LearnerPracticeNextPanel";

const EXERCISE_TYPES = ["translate_to_target", "translate_to_english", "segment", "choose_particle"] as const;
const MIN_ADVERSARIAL_PROBES = 2;
const NOTE_SUMMARY_MAX = 96;

type AuthoringAdversarialProbe = { answer: string; reason: string };

function emptyAdversarialProbe(): AuthoringAdversarialProbe {
  return { answer: "", reason: "" };
}

function defaultAdversarialProbes(): AuthoringAdversarialProbe[] {
  return [emptyAdversarialProbe(), emptyAdversarialProbe()];
}

function probesFromDraft(answers: { answer: string; reason: string }[]): AuthoringAdversarialProbe[] {
  const probes = answers.map((probe) => ({
    answer: probe.answer ?? "",
    reason: probe.reason ?? ""
  }));
  while (probes.length < MIN_ADVERSARIAL_PROBES) {
    probes.push(emptyAdversarialProbe());
  }
  return probes;
}

function noteSummary(explanation: string): string {
  const trimmed = explanation.trim();
  if (trimmed.length <= NOTE_SUMMARY_MAX) return trimmed;
  return `${trimmed.slice(0, NOTE_SUMMARY_MAX - 1)}…`;
}

function mergeAllowedRuleIds(selectedRuleIds: string[], advancedRules: string): string[] {
  return [...new Set([...selectedRuleIds, ...parseAuthoringList(advancedRules)])];
}

export function LearnerView({
  languageId,
  exercises,
  notes = [],
  learner,
  isWorkflowBusy,
  onOpenBuild
}: {
  languageId: string | null;
  exercises: PublicExercise[];
  notes?: PublicNote[];
  learner: LearnerWorkspace;
  isWorkflowBusy: boolean;
  onOpenBuild?: () => void;
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
  const authoringFormRef = useRef<HTMLFormElement>(null);
  const [authoringType, setAuthoringType] = useState<PublicExercise["type"]>("translate_to_target");
  const [authoringPrompt, setAuthoringPrompt] = useState("");
  const [authoringVocabulary, setAuthoringVocabulary] = useState("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [authoringRulesAdvanced, setAuthoringRulesAdvanced] = useState("");
  const [authoringAnswers, setAuthoringAnswers] = useState("");
  const [authoringAdversarialProbes, setAuthoringAdversarialProbes] =
    useState<AuthoringAdversarialProbe[]>(defaultAdversarialProbes);
  const [authoringExplanation, setAuthoringExplanation] = useState("");
  const [authoringMessage, setAuthoringMessage] = useState<string | null>(null);
  const [authoringError, setAuthoringError] = useState<string | null>(null);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [isValidatingExercise, setIsValidatingExercise] = useState(false);
  const [isGeneratingExercise, setIsGeneratingExercise] = useState(false);
  const [practiceState, setPracticeState] = useState<AsyncState<RecommendedExercises>>({ status: "idle" });
  const [practiceRefreshKey, setPracticeRefreshKey] = useState(0);
  const practiceLanguageIdRef = useRef(languageId);

  useEffect(() => {
    if (!languageId) {
      practiceLanguageIdRef.current = null;
      setPracticeState({ status: "idle" });
      return;
    }

    const languageChanged = practiceLanguageIdRef.current !== languageId;
    practiceLanguageIdRef.current = languageId;

    let cancelled = false;
    setPracticeState((current) => {
      // Soft-refresh after grading: keep the current queue visible while refetching.
      if (!languageChanged && current.status === "ready") return current;
      return { status: "loading" };
    });
    fetchRecommendedExercises(languageId)
      .then((data) => {
        if (!cancelled) setPracticeState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPracticeState({
            status: "error",
            message: localizeApiError(error, t, "learner.practiceRecommendationsLoadError")
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [languageId, t, practiceRefreshKey]);

  useEffect(() => {
    if (!exerciseResult) return;
    setPracticeRefreshKey((current) => current + 1);
  }, [exerciseResult]);

  function focusAuthoringForm() {
    authoringFormRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    const promptField = document.getElementById("exercise-author-prompt");
    if (promptField instanceof HTMLElement) {
      promptField.focus();
    }
  }

  const nextAfterGrade =
    exerciseResult && practiceState.status === "ready"
      ? (practiceState.data.exercises.find((exercise) => exercise.id !== selectedExercise?.id) ?? null)
      : null;
  const hasFilledAdversarialProbes =
    authoringAdversarialProbes.length >= MIN_ADVERSARIAL_PROBES &&
    authoringAdversarialProbes.every((probe) => probe.answer.trim().length > 0 && probe.reason.trim().length > 0);
  const allowedRuleIds = mergeAllowedRuleIds(selectedRuleIds, authoringRulesAdvanced);
  const canCreateExercise =
    authoringPrompt.trim().length > 0 &&
    authoringVocabulary.trim().length > 0 &&
    allowedRuleIds.length > 0 &&
    authoringAnswers.trim().length > 0 &&
    hasFilledAdversarialProbes &&
    authoringExplanation.trim().length > 0 &&
    !isWorkflowBusy &&
    !isCreatingExercise;

  function clearAuthoringNotice() {
    setAuthoringMessage(null);
    setAuthoringError(null);
  }

  function toggleSelectedRuleId(noteId: string, checked: boolean) {
    setSelectedRuleIds((current) => {
      if (checked) {
        return current.includes(noteId) ? current : [...current, noteId];
      }
      return current.filter((id) => id !== noteId);
    });
    clearAuthoringNotice();
  }

  function updateAdversarialProbe(index: number, patch: Partial<AuthoringAdversarialProbe>) {
    setAuthoringAdversarialProbes((current) =>
      current.map((probe, probeIndex) => (probeIndex === index ? { ...probe, ...patch } : probe))
    );
    clearAuthoringNotice();
  }

  function addAdversarialProbe() {
    setAuthoringAdversarialProbes((current) => [...current, emptyAdversarialProbe()]);
    clearAuthoringNotice();
  }

  function removeAdversarialProbe(index: number) {
    setAuthoringAdversarialProbes((current) => {
      if (current.length <= MIN_ADVERSARIAL_PROBES) return current;
      return current.filter((_, probeIndex) => probeIndex !== index);
    });
    clearAuthoringNotice();
  }

  const canValidateExercise = canCreateExercise && !isValidatingExercise;

  function buildAuthoringPayload(): ExerciseAuthoringPayload {
    return {
      type: authoringType,
      prompt: authoringPrompt.trim(),
      allowedVocabulary: parseAuthoringList(authoringVocabulary),
      allowedRuleIds: mergeAllowedRuleIds(selectedRuleIds, authoringRulesAdvanced),
      expectedAnswers: parseAuthoringList(authoringAnswers),
      adversarialAnswers: authoringAdversarialProbes.map((probe) => ({
        answer: probe.answer.trim(),
        reason: probe.reason.trim()
      })),
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
        const success =
          validation.warnings.length > 0
            ? `${t("learner.validateExerciseSuccess", { probeCount, answerCount })} ${validation.warnings.join(" ")}`
            : t("learner.validateExerciseSuccess", { probeCount, answerCount });
        setAuthoringMessage(`${dryRunPrefix} ${success}`);
      } else {
        setAuthoringError(validation.errors.join(" "));
      }
    } catch (error) {
      setAuthoringError(localizeApiError(error, t, "learner.validateExerciseFailed"));
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
      setAuthoringError(localizeApiError(error, t, "learner.exerciseAuthoringFailed"));
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
      {
        const noteIdSet = new Set(notes.map((note) => note.id));
        const knownRuleIds = exercise.allowedRuleIds.filter((ruleId) => noteIdSet.has(ruleId));
        const unknownRuleIds = exercise.allowedRuleIds.filter((ruleId) => !noteIdSet.has(ruleId));
        setSelectedRuleIds(knownRuleIds);
        setAuthoringRulesAdvanced(unknownRuleIds.join(", "));
      }
      setAuthoringAnswers(exercise.expectedAnswers.join(", "));
      setAuthoringAdversarialProbes(probesFromDraft(exercise.adversarialAnswers));
      setAuthoringExplanation(exercise.gradingExplanation);

      const base = t("learner.draftGenerated");
      setAuthoringMessage(warnings.length > 0 ? `${base} ${warnings.join(" ")}` : base);
    } catch (error) {
      setAuthoringError(localizeApiError(error, t, "learner.modelExerciseGenerationFailed"));
    } finally {
      setIsGeneratingExercise(false);
    }
  }

  return (
    <div className="exercise-workbench">
      <LearnerPracticeNextPanel
        practiceState={practiceState}
        isWorkflowBusy={isWorkflowBusy}
        exerciseCount={exercises.length}
        onSelectExercise={onSelectExercise}
        onAuthorExercise={focusAuthoringForm}
        onOpenBuild={onOpenBuild}
      />

      <section className="exercise-list" aria-label={t("learner.exerciseSelector")}>
        <div className="panel-heading">{t("learner.exercisesCount", { count: exercises.length })}</div>
        {exercises.length === 0 ? (
          <div className="empty-state" role="status" aria-live="polite">
            <p>{t("learner.noExercisesAvailable")}</p>
            <div className="practice-next-actions">
              <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={focusAuthoringForm}>
                {t("learner.authorExerciseCta")}
              </button>
              {onOpenBuild && (
                <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={onOpenBuild}>
                  {t("learner.openBuildCta")}
                </button>
              )}
            </div>
          </div>
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
                    <span className="pill" key={`${index}:${rule}`}>
                      {rule}
                    </span>
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
              <div className="practice-grade-followup" role="status" aria-live="polite">
                <p className="result-notice">{exerciseResult}</p>
                {nextAfterGrade ? (
                  <div className="practice-next-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={isWorkflowBusy || isGrading}
                      onClick={() => onSelectExercise(nextAfterGrade.id)}
                    >
                      {t("learner.practiceNextRecommended")}
                    </button>
                    <span className="muted practice-next-followup-prompt">{nextAfterGrade.prompt}</span>
                  </div>
                ) : practiceState.status === "ready" && practiceState.data.exercises.length === 0 ? (
                  <div className="practice-next-actions">
                    <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={focusAuthoringForm}>
                      {t("learner.authorExerciseCta")}
                    </button>
                  </div>
                ) : null}
              </div>
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
                      <span>{formatSubmissionExplanation(submission, t)}</span>
                      <span className="muted">{submission.submittedAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </article>
        ) : (
          <div className="empty-state" role="status" aria-live="polite">
            {exercises.length === 0 ? (
              <>
                <p>{t("learner.noExercisesDetailEmpty")}</p>
                <p className="muted">{t("learner.noExercisesDetailEmptyHint")}</p>
                <div className="practice-next-actions">
                  <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={focusAuthoringForm}>
                    {t("learner.authorExerciseCta")}
                  </button>
                  {onOpenBuild && (
                    <button type="button" className="secondary" disabled={isWorkflowBusy} onClick={onOpenBuild}>
                      {t("learner.openBuildCta")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p>{t("learner.noExercisesAuthorOrSelect")}</p>
            )}
          </div>
        )}

        <form
          ref={authoringFormRef}
          id="exercise-authoring-form"
          className="record-card form-panel compact exercise-authoring-form"
          aria-label={t("learner.exerciseAuthoring")}
          onSubmit={handleCreateExercise}
        >
          <div>
            <span className="detail-label">{t("learner.exerciseAuthoring")}</span>
            <h3>{t("learner.createLearnerTask")}</h3>
            {exercises.length === 0 && <p className="inline-empty muted">{t("learner.exerciseAuthoringEmptyHint")}</p>}
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
                <option key={type} value={type}>
                  {t(`exerciseType.${type}`)}
                </option>
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
          <fieldset className="form-group rule-note-picker">
            <legend>{t("learner.allowedRuleNotes")}</legend>
            <p className="inline-empty muted">{t("learner.allowedRuleNotesHint")}</p>
            {notes.length === 0 ? (
              <p className="inline-empty muted">{t("learner.noRuleNotesAvailable")}</p>
            ) : (
              <div className="rule-note-picker-list">
                {notes.map((note) => {
                  const inputId = `exercise-author-rule-${safeDomId(note.id)}`;
                  return (
                    <label key={note.id} className="checkbox-row rule-note-option" htmlFor={inputId}>
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={selectedRuleIds.includes(note.id)}
                        onChange={(event) => toggleSelectedRuleId(note.id, event.target.checked)}
                      />
                      <span className="rule-note-option-copy">
                        <strong>{note.topic}</strong>
                        <code>{note.id}</code>
                        <span className="muted">{noteSummary(note.explanation)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <details className="rule-note-advanced" open={authoringRulesAdvanced.trim().length > 0 || undefined}>
              <summary>{t("learner.allowedRuleIdsAdvanced")}</summary>
              <label htmlFor="exercise-author-rules">{t("learner.allowedRuleIds")}</label>
              <input
                id="exercise-author-rules"
                value={authoringRulesAdvanced}
                onChange={(event) => {
                  setAuthoringRulesAdvanced(event.target.value);
                  clearAuthoringNotice();
                }}
                placeholder={t("learner.allowedRuleIdsPlaceholder")}
              />
              <p className="inline-empty muted">{t("learner.allowedRuleIdsAdvancedHint")}</p>
            </details>
          </fieldset>
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
          <fieldset className="form-group adversarial-probes">
            <legend>{t("learner.adversarialProbes")}</legend>
            {authoringAdversarialProbes.map((probe, index) => {
              const answerId = `exercise-author-adversarial-answer-${index + 1}`;
              const reasonId = `exercise-author-adversarial-reason-${index + 1}`;
              const canRemoveProbe = authoringAdversarialProbes.length > MIN_ADVERSARIAL_PROBES;
              return (
                <div className="adversarial-probe-row" key={`adversarial-probe-${index}`}>
                  <div className="form-group">
                    <label htmlFor={answerId}>{t("learner.adversarialAnswer", { index: index + 1 })}</label>
                    <input
                      id={answerId}
                      value={probe.answer}
                      onChange={(event) => updateAdversarialProbe(index, { answer: event.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={reasonId}>{t("learner.adversarialReason", { index: index + 1 })}</label>
                    <input
                      id={reasonId}
                      value={probe.reason}
                      onChange={(event) => updateAdversarialProbe(index, { reason: event.target.value })}
                    />
                  </div>
                  {canRemoveProbe && (
                    <button type="button" className="secondary" onClick={() => removeAdversarialProbe(index)}>
                      {t("learner.removeAdversarialProbe")}
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className="secondary" onClick={addAdversarialProbe}>
              {t("learner.addAdversarialProbe")}
            </button>
          </fieldset>
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
            <button type="submit" className="secondary" disabled={!canCreateExercise} aria-busy={isCreatingExercise}>
              {isCreatingExercise ? t("learner.creating") : t("learner.createExercise")}
            </button>
          </div>
          <p id="exercise-validate-dry-run-hint" className="inline-empty muted">
            {t("learner.validateExerciseDryRunHint")}
          </p>
          {authoringMessage && (
            <p className="result-notice" role="status" aria-live="polite">
              {authoringMessage}
            </p>
          )}
          {authoringError && (
            <p className="result-notice error" role="alert">
              {authoringError}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
