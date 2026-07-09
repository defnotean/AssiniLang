import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  DashboardData,
  ExerciseAuthoringPayload,
  GeneratedExerciseDraft,
  PublicExerciseSubmission
} from "../api";
import { createExercise, fetchExerciseSubmissions, generateModelExercise, submitExerciseAnswer } from "../api";
import { formatSubmissionExplanation, localizeApiError } from "../lib/format";
import type { PublicExercise, ViewMode } from "../lib/types";
import { useI18n } from "../i18n";

export interface LearnerWorkspace {
  selectedExercise: PublicExercise | null;
  selectedExerciseId: string | null;
  setSelectedExerciseId: Dispatch<SetStateAction<string | null>>;
  exerciseAnswer: string;
  setExerciseAnswer: Dispatch<SetStateAction<string>>;
  isGrading: boolean;
  isLoadingSubmissions: boolean;
  exerciseResult: string | null;
  setExerciseResult: Dispatch<SetStateAction<string | null>>;
  submissionHistory: PublicExerciseSubmission[];
  setSubmissionHistory: Dispatch<SetStateAction<PublicExerciseSubmission[]>>;
  handleGrade: () => Promise<void>;
  handleCreateExercise: (payload: ExerciseAuthoringPayload) => Promise<void>;
  handleGenerateExercise: (
    options?: { type?: string }
  ) => Promise<{ exercise: GeneratedExerciseDraft; warnings: string[] }>;
}

/**
 * Owns the learner workspace state: exercise selection, answer drafting,
 * grading, and submission history, plus the submission-history loading effect.
 * Setters are exposed so the App-level dashboard reload effect can reset them.
 */
export function useLearnerWorkspace(
  view: ViewMode,
  selectedLanguageId: string | null,
  data: DashboardData | null,
  refreshDashboard: () => Promise<void>
): LearnerWorkspace {
  const { t } = useI18n();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [exerciseAnswer, setExerciseAnswer] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [exerciseResult, setExerciseResult] = useState<string | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<PublicExerciseSubmission[]>([]);

  const selectedExercise = data?.exercises.find((exercise) => exercise.id === selectedExerciseId) ?? data?.exercises[0] ?? null;

  useEffect(() => {
    let isCurrent = true;
    setExerciseAnswer("");
    setExerciseResult(null);

    if (view !== "learner" || !selectedExercise) {
      setSubmissionHistory([]);
      setIsLoadingSubmissions(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoadingSubmissions(true);
    fetchExerciseSubmissions(selectedExercise.id)
      .then((history) => {
        if (isCurrent) setSubmissionHistory(history);
      })
      .catch(() => {
        if (isCurrent) setSubmissionHistory([]);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSubmissions(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedExercise?.id, view]);

  async function handleGrade() {
    const submittedAnswer = exerciseAnswer.trim();
    if (!selectedExercise || submittedAnswer.length === 0) return;

    setIsGrading(true);
    setExerciseResult(null);
    try {
      const submission = await submitExerciseAnswer(selectedExercise.id, submittedAnswer);
      setExerciseResult(formatSubmissionExplanation(submission, t));
      setSubmissionHistory(await fetchExerciseSubmissions(selectedExercise.id));
    } catch (error) {
      setExerciseResult(localizeApiError(error, t, "learner.errSubmissionFailed"));
    } finally {
      setIsGrading(false);
    }
  }

  async function handleCreateExercise(payload: ExerciseAuthoringPayload) {
    if (!selectedLanguageId) {
      throw new Error(t("errors.selectOrCreateLanguage"));
    }
    const created = await createExercise(selectedLanguageId, payload);
    await refreshDashboard();
    setSelectedExerciseId(created.id);
    setExerciseAnswer("");
    setExerciseResult(null);
    setSubmissionHistory([]);
  }

  async function handleGenerateExercise(
    options?: { type?: string }
  ): Promise<{ exercise: GeneratedExerciseDraft; warnings: string[] }> {
    if (!selectedLanguageId) {
      throw new Error(t("errors.selectOrCreateLanguage"));
    }
    return generateModelExercise(selectedLanguageId, options);
  }

  return {
    selectedExercise,
    selectedExerciseId,
    setSelectedExerciseId,
    exerciseAnswer,
    setExerciseAnswer,
    isGrading,
    isLoadingSubmissions,
    exerciseResult,
    setExerciseResult,
    submissionHistory,
    setSubmissionHistory,
    handleGrade,
    handleCreateExercise,
    handleGenerateExercise
  };
}
