import type { CorpusPassage, EvaluationRun, Exercise, ExerciseSubmission, Language, Note } from "@assini/db";

export type PublicExercise = Omit<Exercise, "expectedAnswers">;

export type DashboardData = {
  languages: Language[];
  corpus: CorpusPassage[];
  notes: Note[];
  exercises: PublicExercise[];
  evaluations: EvaluationRun[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);

  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchDashboardData(languageId = "avenik"): Promise<DashboardData> {
  const encodedLanguageId = encodeURIComponent(languageId);
  const [languages, corpus, notes, exercises, evaluations] = await Promise.all([
    getJson<Language[]>("/languages"),
    getJson<CorpusPassage[]>(`/languages/${encodedLanguageId}/corpus`),
    getJson<Note[]>(`/languages/${encodedLanguageId}/notes`),
    getJson<PublicExercise[]>(`/languages/${encodedLanguageId}/exercises`),
    getJson<EvaluationRun[]>("/evaluations")
  ]);

  return { languages, corpus, notes, exercises, evaluations };
}

export async function runEvaluation(): Promise<EvaluationRun[]> {
  const response = await fetch("/api/evaluations/run", { method: "POST" });

  if (!response.ok) {
    throw new Error("Evaluation run failed");
  }

  return response.json() as Promise<EvaluationRun[]>;
}

export async function reviewNote(
  noteId: string,
  payload: Partial<Pick<Note, "status" | "explanation">> & { reviewerComment?: string }
): Promise<Note> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Note review failed");
  }

  return response.json() as Promise<Note>;
}

export async function submitExerciseAnswer(exerciseId: string, answer: string): Promise<ExerciseSubmission> {
  const response = await fetch(`/api/exercises/${encodeURIComponent(exerciseId)}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer })
  });

  if (!response.ok) {
    throw new Error("Exercise submission failed");
  }

  return response.json() as Promise<ExerciseSubmission>;
}
