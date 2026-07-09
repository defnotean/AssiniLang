import type { Exercise, ExerciseSubmission } from "@assini/db";
import { actorRequest, assertOk, getJson } from "../lib/apiClient";

export type PublicExercise = Omit<Exercise, "expectedAnswers" | "adversarialAnswers" | "gradingExplanation">;
export type PublicExerciseSubmission = Omit<ExerciseSubmission, "answer" | "learnerId">;

export type ExerciseAuthoringPayload = Pick<
  Exercise,
  "type" | "prompt" | "allowedVocabulary" | "allowedRuleIds" | "expectedAnswers" | "adversarialAnswers" | "gradingExplanation"
>;

export type ExerciseAuthoringDryRunResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  preview: ExerciseAuthoringPayload | null;
};

export type GeneratedExerciseDraft = {
  type: string;
  prompt: string;
  allowedVocabulary: string[];
  allowedRuleIds: string[];
  expectedAnswers: string[];
  adversarialAnswers: { answer: string; reason: string }[];
  gradingExplanation: string;
};

export type PracticeRecommendationStatus = "new" | "overdue" | "scheduled";

export type PracticeRecommendationRationale = {
  exerciseId: string;
  status: PracticeRecommendationStatus;
  dueAt?: string;
  streak: number;
};

export type RecommendedExercises = {
  exercises: PublicExercise[];
  rationale: PracticeRecommendationRationale[];
};

export async function submitExerciseAnswer(exerciseId: string, answer: string): Promise<PublicExerciseSubmission> {
  const response = await fetch(`/api/exercises/${encodeURIComponent(exerciseId)}/submissions`, {
    method: "POST",
    ...(await actorRequest("learner", true)),
    body: JSON.stringify({ answer })
  });

  await assertOk(response, "Exercise submission failed");

  return response.json() as Promise<PublicExerciseSubmission>;
}

export async function fetchRecommendedExercises(languageId: string): Promise<RecommendedExercises> {
  return getJson<RecommendedExercises>(
    `/languages/${encodeURIComponent(languageId)}/exercises/recommended`,
    "learner"
  );
}

export async function fetchExerciseSubmissions(exerciseId: string): Promise<PublicExerciseSubmission[]> {
  return getJson<PublicExerciseSubmission[]>(`/exercises/${encodeURIComponent(exerciseId)}/submissions`, "learner");
}

export async function validateExerciseAuthoring(
  languageId: string,
  payload: ExerciseAuthoringPayload
): Promise<ExerciseAuthoringDryRunResult> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/exercises?dryRun=1`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Exercise validation failed");

  return response.json() as Promise<ExerciseAuthoringDryRunResult>;
}

export async function createExercise(
  languageId: string,
  payload: ExerciseAuthoringPayload
): Promise<PublicExercise> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/exercises`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Exercise authoring failed");

  return response.json() as Promise<PublicExercise>;
}

export async function generateModelExercise(
  languageId: string,
  options?: { type?: string }
): Promise<{ exercise: GeneratedExerciseDraft; warnings: string[] }> {
  const requestedType = options?.type?.trim();
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/exercises/generate`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(requestedType ? { type: requestedType } : {})
  });

  await assertOk(response, "Model exercise generation failed");

  return response.json() as Promise<{ exercise: GeneratedExerciseDraft; warnings: string[] }>;
}
