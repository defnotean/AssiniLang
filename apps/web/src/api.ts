import type { CorpusPassage, EvaluationRun, Exercise, Language, Note } from "@assini/db";

export type DashboardData = {
  languages: Language[];
  corpus: CorpusPassage[];
  notes: Note[];
  exercises: Exercise[];
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
  const [languages, corpus, notes, exercises, evaluations] = await Promise.all([
    getJson<Language[]>("/languages"),
    getJson<CorpusPassage[]>(`/languages/${languageId}/corpus`),
    getJson<Note[]>(`/languages/${languageId}/notes`),
    getJson<Exercise[]>(`/languages/${languageId}/exercises`),
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
