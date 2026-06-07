import type {
  AiSession,
  AiSessionMode,
  AuditEvent,
  CorpusPassage,
  ElderCorrection,
  EvaluationRun,
  Exercise,
  ExerciseSubmission,
  GovernanceRecord,
  Language,
  NeuralMap,
  Note,
  ReviewDisposition,
  ReviewPolicy,
  User
} from "@assini/db";

export type PublicExercise = Omit<Exercise, "expectedAnswers" | "adversarialAnswers" | "gradingExplanation">;
export type PublicExerciseSubmission = Omit<ExerciseSubmission, "answer" | "learnerId">;

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

export type FixtureMinimums = {
  consonants: number;
  vowels: number;
  phonotacticNotes: number;
  vocabularyItems: number;
  corpusPassages: number;
  grammarRules: number;
  noteAnswerKeys: number;
  exerciseAnswerKeys: number;
  exerciseTypes: number;
  paradigms: number;
  paradigmRows: number;
  dialectVariants: number;
  dialectHistoryEvents: number;
  discourseExamples: number;
  teachingSequences: number;
};

export type FixtureQualityCheck = {
  id: keyof FixtureMinimums;
  label: string;
  actual: number;
  minimum: number;
  passed: boolean;
};

export type FixtureQualityCounters = {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
};

export type FixtureQualitySummary = FixtureQualityCounters & {
  checks: FixtureQualityCheck[];
};

export type EvaluationFixtureQualitySummary = FixtureQualityCounters & {
  languages: number;
  passedLanguages: number;
  failedLanguages: number;
};

export type LanguageProfile = {
  language: Language;
  phonology: {
    consonants: string[];
    vowels: string[];
    syllableTemplate: string;
    stress: string;
    phonotactics: string[];
  };
  paradigms: Array<{
    id: string;
    title: string;
    description: string;
    rows: Array<{
      label: string;
      form: string;
      gloss: string;
      morphemes: string[];
    }>;
  }>;
  dialectVariants: Array<{
    id: string;
    name: string;
    regionLabel: string;
    phonologyNotes: string[];
    lexicalNotes: string[];
    grammarNotes: string[];
    history: {
      summary: string;
      events: Array<{
        period: string;
        description: string;
        evidencePassageIds: string[];
      }>;
    };
    examplePhrases: Array<{
      standard: string;
      variant: string;
      translation: string;
    }>;
  }>;
  discourseExamples: Array<{
    id: string;
    functionLabel: string;
    context: string;
    target: string;
    translation: string;
    notes: string[];
  }>;
  teachingSequences: Array<{
    id: string;
    title: string;
    objective: string;
    level: "intro" | "practice" | "review";
    ruleIds: string[];
    corpusPassageIds: string[];
    exerciseIds: string[];
    steps: Array<{
      label: string;
      prompt: string;
    }>;
  }>;
  vocabulary: Array<{
    id: string;
    form: string;
    gloss: string;
    partOfSpeech: string;
    tags: string[];
  }>;
  morphemeInventory: Array<{
    surface: string;
    lemma: string;
    glosses: string[];
    features: string[];
    occurrenceCount: number;
    passageIds: string[];
    vocabulary: {
      id: string;
      form: string;
      gloss: string;
      partOfSpeech: string;
      tags: string[];
    } | null;
  }>;
  grammarRules: Array<{
    id: string;
    topic: string;
    explanation: string;
    evidencePassageIds: string[];
    confidence: Note["confidence"];
  }>;
  stats: {
    vocabularyItems: number;
    grammarRules: number;
    paradigms: number;
    dialectVariants: number;
    discourseExamples: number;
    teachingSequences: number;
    corpusPassages: number;
    notes: number;
    exercises: number;
    exerciseTypes: Partial<Record<Exercise["type"], number>>;
  };
  fixtureMinimums: FixtureMinimums;
  fixtureQuality: FixtureQualitySummary;
};

export type LanguageSnapshot = {
  exportVersion: "synthetic-language-snapshot-v1";
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
  exportVersion: "synthetic-evaluation-artifact-v1";
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
    fixtureQuality: EvaluationFixtureQualitySummary;
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
    categoryDeltas: Record<string, {
      latestScore: number;
      previousScore: number | null;
      delta: number | null;
    }>;
  }>;
  failureLines: string[];
};

export type ElderContext = {
  language: Language;
  corpus: CorpusPassage[];
  notes: Note[];
  corrections: ElderCorrection[];
  governance: GovernanceRecord[];
};

export type ObservabilityData = {
  totals: {
    sessions: number;
    activeSessions: number;
    messages: number;
    elderCorrections: number;
  };
  sessions: Array<{
    id: string;
    languageId: string;
    mode: AiSessionMode;
    status: AiSession["status"];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    contextNoteIds: string[];
    contextPassageIds: string[];
    thinkingSummary: string;
    privacy: AiSession["privacy"];
  }>;
};

export type NeuralMapResponse = NeuralMap & {
  languageId: string;
};

export type LlmStatus = {
  provider: string;
  mode: "deterministic" | "local-openai-compatible" | "remote-api" | "invalid";
  configured: boolean;
  activeProviderName: string;
  baseUrl?: string;
  model?: string;
  timeoutMs: number;
  apiKey: {
    required: boolean;
    configured: boolean;
    acceptedVariables: string[];
  };
  environment: {
    providerVariable: string;
    baseUrlVariable: string;
    modelVariable: string;
    apiKeyVariables: string[];
    timeoutVariable: string;
  };
  setup: {
    localExamples: string[];
    remoteExamples: string[];
  };
  warnings: string[];
};

export type ElderCorrectionPayload = {
  languageId: string;
  noteId?: string;
  passageId?: string;
  correction: string;
  rationale: string;
  severity: ElderCorrection["severity"];
  contextText?: string;
};

export type ElderCorrectionReviewStatus = Extract<ElderCorrection["status"], "accepted" | "rejected">;
export type ElderCorrectionApplyResult = {
  correction: ElderCorrection;
  note: Note;
};

export type GovernancePayload = Pick<GovernanceRecord, "languageId" | "policyType" | "content" | "effectiveDate">;
export type ReviewPolicyPayload = Pick<ReviewPolicy, "assignedReviewerIds" | "approvalThreshold" | "requiresAssignedReviewer">;
export type CorpusImportPayload = Omit<CorpusPassage, "id" | "languageId">;
export type ExerciseAuthoringPayload = Pick<
  Exercise,
  "type" | "prompt" | "allowedVocabulary" | "allowedRuleIds" | "expectedAnswers" | "adversarialAnswers" | "gradingExplanation"
>;
export type ReviewNotePayload = Partial<Pick<Note, "status" | "explanation">> & {
  reviewerComment?: string;
  dispositionAssigneeId?: string;
  dispositionDueAt?: string;
};

export type CreateAiSessionPayload = {
  languageId: string;
  mode: AiSessionMode;
  seedPrompt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
};

type LocalActor = "learner" | "elder" | "programmer" | "reviewer";

function jsonHeaders(json = false): HeadersInit {
  return json ? { "Content-Type": "application/json" } : {};
}

function prototypeAuthUnavailable(): Error {
  return new Error("Prototype session auth is available only in the local Vite dev server.");
}

function errorDetailFromBody(body: unknown): string | undefined {
  if (typeof body === "string" && body.trim().length > 0) return body.trim();
  if (!body || typeof body !== "object") return undefined;

  const record = body as Record<string, unknown>;
  for (const key of ["error", "message", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    return errorDetailFromBody(await response.json());
  } catch {
    try {
      return errorDetailFromBody(await response.text());
    } catch {
      return undefined;
    }
  }
}

async function errorFromResponse(response: Response, fallback: string): Promise<Error> {
  const status = response.status ? ` (${response.status})` : "";
  const detail = await readErrorDetail(response);
  return new Error(detail ? `${fallback}${status}: ${detail}` : `${fallback}${status}`);
}

async function assertOk(response: Response, fallback: string): Promise<void> {
  if (!response.ok) {
    throw await errorFromResponse(response, fallback);
  }
}

function prototypeActorId(actor: LocalActor): string {
  if (!import.meta.env.DEV) {
    throw prototypeAuthUnavailable();
  }

  switch (actor) {
    case "learner":
      return "learner-1";
    case "elder":
      return "elder-1";
    case "programmer":
      return "programmer-1";
    case "reviewer":
      return "reviewer-1";
  }
}

async function openPrototypeSession(actor: LocalActor): Promise<void> {
  if (!import.meta.env.DEV) {
    throw prototypeAuthUnavailable();
  }

  const response = await fetch("/api/auth/prototype-session", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders(true),
    body: JSON.stringify({ userId: prototypeActorId(actor) })
  });

  await assertOk(response, `Prototype session failed for ${actor}`);
}

async function actorRequest(actor: LocalActor, json = false): Promise<RequestInit> {
  await openPrototypeSession(actor);
  return {
    credentials: "include",
    headers: jsonHeaders(json)
  };
}

async function getJson<T>(path: string, actor?: LocalActor): Promise<T> {
  const response = await fetch(`/api${path}`, actor ? await actorRequest(actor) : undefined);

  await assertOk(response, `Request failed: ${path}`);

  return response.json() as Promise<T>;
}

function actorForAiMode(mode: AiSessionMode): LocalActor {
  if (mode === "programmer_debug") return "programmer";
  if (mode === "elder_review") return "elder";
  return "learner";
}

export async function fetchGovernance(): Promise<GovernanceRecord[]> {
  return getJson<GovernanceRecord[]>("/governance");
}

export async function createGovernanceRecord(payload: GovernancePayload): Promise<GovernanceRecord> {
  const response = await fetch("/api/governance", {
    method: "POST",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Governance policy creation failed");

  return response.json() as Promise<GovernanceRecord>;
}

export async function fetchAuditEvents(languageId: string): Promise<AuditEvent[]> {
  return getJson<AuditEvent[]>(`/audit/events?languageId=${encodeURIComponent(languageId)}`, "programmer");
}

export async function fetchReviewPolicy(languageId: string): Promise<ReviewPolicy> {
  return getJson<ReviewPolicy>(`/languages/${encodeURIComponent(languageId)}/review-policy`, "reviewer");
}

export async function updateReviewPolicy(languageId: string, payload: ReviewPolicyPayload): Promise<ReviewPolicy> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/review-policy`, {
    method: "PUT",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Review policy update failed");

  return response.json() as Promise<ReviewPolicy>;
}

export async function fetchReviewDispositions(languageId: string): Promise<ReviewDisposition[]> {
  return getJson<ReviewDisposition[]>(
    `/languages/${encodeURIComponent(languageId)}/review-dispositions`,
    "reviewer"
  );
}

export async function resolveReviewDisposition(
  dispositionId: string,
  resolutionSummary: string
): Promise<ReviewDisposition> {
  const response = await fetch(`/api/review-dispositions/${encodeURIComponent(dispositionId)}/resolve`, {
    method: "PATCH",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify({ resolutionSummary })
  });

  await assertOk(response, "Review disposition resolution failed");

  return response.json() as Promise<ReviewDisposition>;
}

export async function generateDraftNotes(languageId: string): Promise<Note[]> {
  const response = await fetch("/api/study-loop/draft", {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify({ languageId })
  });
  await assertOk(response, "Draft generation failed");
  return response.json() as Promise<Note[]>;
}

export async function fetchCurrentUser(): Promise<User> {
  return getJson<User>("/users/me", "reviewer");
}

export async function fetchLlmStatus(): Promise<LlmStatus> {
  return getJson<LlmStatus>("/llm/status");
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

export async function reviewNote(
  noteId: string,
  payload: ReviewNotePayload
): Promise<Note> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/review`, {
    method: "PATCH",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Note review failed");

  return response.json() as Promise<Note>;
}

export async function submitExerciseAnswer(exerciseId: string, answer: string): Promise<PublicExerciseSubmission> {
  const response = await fetch(`/api/exercises/${encodeURIComponent(exerciseId)}/submissions`, {
    method: "POST",
    ...(await actorRequest("learner", true)),
    body: JSON.stringify({ answer })
  });

  await assertOk(response, "Exercise submission failed");

  return response.json() as Promise<PublicExerciseSubmission>;
}

export async function fetchExerciseSubmissions(exerciseId: string): Promise<PublicExerciseSubmission[]> {
  return getJson<PublicExerciseSubmission[]>(`/exercises/${encodeURIComponent(exerciseId)}/submissions`);
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

export async function importCorpusPassage(
  languageId: string,
  payload: CorpusImportPayload
): Promise<CorpusPassage> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/corpus`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Corpus import failed");

  return response.json() as Promise<CorpusPassage>;
}

export async function fetchElderContext(languageId: string): Promise<ElderContext> {
  return getJson<ElderContext>(`/languages/${encodeURIComponent(languageId)}/elder-context`, "elder");
}

export async function submitElderCorrection(payload: ElderCorrectionPayload): Promise<ElderCorrection> {
  const response = await fetch("/api/elder/corrections", {
    method: "POST",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Elder correction submission failed");

  return response.json() as Promise<ElderCorrection>;
}

export async function reviewElderCorrection(
  correctionId: string,
  status: ElderCorrectionReviewStatus
): Promise<ElderCorrection> {
  const response = await fetch(`/api/elder/corrections/${encodeURIComponent(correctionId)}/review`, {
    method: "PATCH",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify({ status })
  });

  await assertOk(response, "Elder correction review failed");

  return response.json() as Promise<ElderCorrection>;
}

export async function applyElderCorrection(
  correctionId: string,
  explanation: string
): Promise<ElderCorrectionApplyResult> {
  const response = await fetch(`/api/elder/corrections/${encodeURIComponent(correctionId)}/apply`, {
    method: "PATCH",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify({ explanation })
  });

  await assertOk(response, "Elder correction apply failed");

  return response.json() as Promise<ElderCorrectionApplyResult>;
}

export async function fetchObservability(): Promise<ObservabilityData> {
  return getJson<ObservabilityData>("/observability/ai-sessions", "programmer");
}

export async function fetchNeuralMap(languageId: string): Promise<NeuralMapResponse> {
  return getJson<NeuralMapResponse>(`/observability/neural-map?languageId=${encodeURIComponent(languageId)}`, "programmer");
}

export async function createAiSession(payload: CreateAiSessionPayload): Promise<AiSession> {
  const response = await fetch("/api/ai/sessions", {
    method: "POST",
    ...(await actorRequest(actorForAiMode(payload.mode), true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "AI session creation failed");

  return response.json() as Promise<AiSession>;
}

export async function fetchAiSession(sessionId: string, actor: LocalActor = "programmer"): Promise<AiSession> {
  return getJson<AiSession>(`/ai/sessions/${encodeURIComponent(sessionId)}`, actor);
}
