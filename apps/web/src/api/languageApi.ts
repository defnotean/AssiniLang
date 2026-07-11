import type {
  CorpusPassage,
  EvaluationRun,
  GovernanceRecord,
  Language,
  LanguagePhonology,
  Lexeme,
  Note
} from "@assini/api-contract";
import type { LanguageCreatePayload, LanguagePatchPayload } from "@assini/api-contract";
import { actorRequest, assertOk, getJson } from "../lib/apiClient";
import type { PublicExercise } from "./exerciseApi";

export type ExportIntegrity = {
  algorithm: "sha256";
  contentHash: string;
  generatedBy: "assini-local-export-v1";
  redactionPolicy: string[];
};

export type DashboardData = {
  languages: Language[];
  corpus: CorpusPassage[];
  notes: Note[];
  exercises: PublicExercise[];
  evaluations: EvaluationRun[];
};

export type PublicVocabularyItem = {
  id: string;
  form: string;
  gloss: string;
  partOfSpeech: string;
  tags: string[];
};

export type PublicGrammarRule = {
  id: string;
  topic: string;
  explanation: string;
  evidencePassageIds: string[];
  confidence: Note["confidence"];
  status: Note["status"];
};

export type MorphemeInventoryItem = {
  surface: string;
  lemma: string;
  glosses: string[];
  features: string[];
  occurrenceCount: number;
  passageIds: string[];
  vocabulary: PublicVocabularyItem | null;
};

export type LanguageProfileStats = {
  vocabularyItems: number;
  grammarRules: number;
  corpusPassages: number;
  notes: number;
  exercises: number;
  sourceAssets: number;
  pendingExtractionDrafts: number;
  exerciseTypes: Partial<Record<PublicExercise["type"], number>>;
};

export type ParadigmGap = {
  lemma: string;
  dimension: string;
  attested: string[];
  missing: string[];
  evidencePassageIds: string[];
};

export type LanguageProfile = {
  language: Language;
  phonology: LanguagePhonology | null;
  vocabulary: PublicVocabularyItem[];
  morphemeInventory: MorphemeInventoryItem[];
  grammarRules: PublicGrammarRule[];
  paradigmGaps?: ParadigmGap[];
  stats: LanguageProfileStats;
};

export type LanguageSnapshot = {
  exportVersion: "language-snapshot-v2";
  exportedAt: string;
  integrity: ExportIntegrity;
  language: Language;
  linguisticProfile: Omit<LanguageProfile, "language">;
  corpus: CorpusPassage[];
  notes: Note[];
  exercises: PublicExercise[];
  governance: GovernanceRecord[];
  evaluations: EvaluationRun[];
};

export type EvaluationArtifact = {
  exportVersion: "evaluation-artifact-v2";
  exportedAt: string;
  integrity: ExportIntegrity;
  summary: {
    languages: number;
    totalRuns: number;
    latestRuns: number;
    failedLatestRuns: number;
    regressedLatestRuns: number;
    improvedLatestRuns: number;
    stableLatestRuns: number;
    singleRunLanguages: number;
    averageLatestScore: number;
    passed: boolean;
    failureCount: number;
  };
  latestRuns: EvaluationRun[];
  runsByLanguage: Record<string, string[]>;
  trends: Array<{
    languageId: string;
    latestRunId: string;
    previousRunId: string | null;
    latestAverageScore: number;
    previousAverageScore: number | null;
    averageDelta: number | null;
    status: "improved" | "regressed" | "stable" | "single-run";
    categoryDeltas: Record<
      string,
      {
        latestScore: number;
        previousScore: number | null;
        delta: number | null;
      }
    >;
  }>;
  failureLines: string[];
};

export type LanguageDeleteResult = {
  id: string;
  name: string;
  deleted: true;
};

export async function fetchDashboardData(languageId?: string): Promise<DashboardData> {
  if (!languageId) {
    const [languages, evaluations] = await Promise.all([
      getJson<Language[]>("/languages"),
      getJson<EvaluationRun[]>("/evaluations", "reviewer")
    ]);

    const firstLanguageId = languages[0]?.id;
    if (!firstLanguageId) {
      return { languages, corpus: [], notes: [], exercises: [], evaluations };
    }

    const encodedFirstLanguageId = encodeURIComponent(firstLanguageId);
    const [corpus, notes, exercises] = await Promise.all([
      getJson<CorpusPassage[]>(`/languages/${encodedFirstLanguageId}/corpus`),
      getJson<Note[]>(`/languages/${encodedFirstLanguageId}/notes`),
      getJson<PublicExercise[]>(`/languages/${encodedFirstLanguageId}/exercises`)
    ]);

    return { languages, corpus, notes, exercises, evaluations };
  }

  const encodedLanguageId = encodeURIComponent(languageId);
  const [languages, corpus, notes, exercises, evaluations] = await Promise.all([
    getJson<Language[]>("/languages"),
    getJson<CorpusPassage[]>(`/languages/${encodedLanguageId}/corpus`),
    getJson<Note[]>(`/languages/${encodedLanguageId}/notes`),
    getJson<PublicExercise[]>(`/languages/${encodedLanguageId}/exercises`),
    getJson<EvaluationRun[]>("/evaluations", "reviewer")
  ]);

  return { languages, corpus, notes, exercises, evaluations };
}

export async function createLanguage(payload: LanguageCreatePayload): Promise<Language> {
  const response = await fetch("/api/languages", {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Language creation failed");

  return response.json() as Promise<Language>;
}

export async function deleteLanguage(languageId: string): Promise<LanguageDeleteResult> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}`, {
    method: "DELETE",
    ...(await actorRequest("reviewer"))
  });

  await assertOk(response, "Language deletion failed");

  return response.json() as Promise<LanguageDeleteResult>;
}

export async function updateLanguage(languageId: string, patch: LanguagePatchPayload): Promise<Language> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}`, {
    method: "PATCH",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(patch)
  });

  await assertOk(response, "Language update failed");

  return response.json() as Promise<Language>;
}

export async function fetchLexicon(languageId: string): Promise<Lexeme[]> {
  return getJson<Lexeme[]>(`/languages/${encodeURIComponent(languageId)}/lexicon`);
}

export async function fetchLanguageProfile(languageId: string): Promise<LanguageProfile> {
  return getJson<LanguageProfile>(`/languages/${encodeURIComponent(languageId)}/profile`);
}

export async function fetchLanguageSnapshot(languageId: string): Promise<LanguageSnapshot> {
  return getJson<LanguageSnapshot>(`/exports/languages/${encodeURIComponent(languageId)}/snapshot`, "reviewer");
}

export async function fetchEvaluationArtifact(): Promise<EvaluationArtifact> {
  return getJson<EvaluationArtifact>("/exports/evaluations/artifact", "reviewer");
}

export async function runEvaluation(): Promise<EvaluationRun[]> {
  const response = await fetch("/api/evaluations/run", {
    method: "POST",
    ...(await actorRequest("reviewer"))
  });

  await assertOk(response, "Evaluation run failed");

  return response.json() as Promise<EvaluationRun[]>;
}
