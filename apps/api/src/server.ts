import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  JsonStore,
  noteStatusSchema,
  type AuditEvent,
  type AiMessage,
  type AiSession,
  type AiSessionMode,
  type AppState,
  type CorpusPassage,
  type ElderCorrection,
  type Exercise,
  type ExerciseSubmission,
  type GovernanceRecord,
  type NeuralMap,
  type Note,
  type ReviewApproval,
  type ReviewDisposition,
  type ReviewPolicy,
  type User,
  type UserRole
} from "@assini/db";
import { draftNotesForLanguage, gradeExerciseAnswer, runEvaluationForState } from "@assini/eval";
import { findInvalidOrthographySymbols, syntheticLanguageFixtures } from "@assini/synthetic-langs";
import {
  buildLlmGenerationInputFromState,
  createLlmProviderFromEnv,
  describeLlmProviderFromEnv,
  type LlmGenerationResult,
  type LlmProvider
} from "./llmProvider";
import {
  buildSyntheticLanguageProfile,
  toPublicExercise,
  toPublicEvaluationArtifact,
  toPublicExerciseSubmission,
  toPublicLanguageSnapshot,
  toPublicNote,
  toPublicNotes
} from "./publicLanguageViews";

type RateLimitOptions = {
  max: number;
  windowMs: number;
  now?: () => number;
};

type ServerOptions = {
  store?: JsonStore;
  initialState?: AppState;
  allowedOrigins?: string[];
  bodyLimitBytes?: number;
  rateLimit?: RateLimitOptions | false;
  /** Server-only token used by tests or explicitly configured internal tools. Never bundle this into the browser. */
  authToken?: string;
  enablePrototypeAuth?: boolean;
  llmProvider?: LlmProvider;
};

type ReviewBody = Partial<Pick<Note, "status" | "explanation">> & {
  reviewerComment?: string;
  dispositionAssigneeId?: string;
  dispositionDueAt?: string;
};
type ReviewDispositionStatus = Extract<Note["status"], "contested" | "rejected" | "deferred" | "escalated">;

type ExerciseSubmissionBody = {
  answer: string;
};

type CorpusImportBody = Omit<CorpusPassage, "id" | "languageId">;

type ExerciseAuthoringBody = Pick<
  Exercise,
  "type" | "prompt" | "allowedVocabulary" | "allowedRuleIds" | "expectedAnswers" | "adversarialAnswers" | "gradingExplanation"
>;

type StudyLoopDraftBody = {
  languageId: string;
};

type AiSessionBody = {
  languageId: string;
  mode: AiSessionMode;
  seedPrompt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
};

type AiMessageBody = {
  content: string;
};

type ElderCorrectionBody = {
  languageId: string;
  noteId?: string;
  passageId?: string;
  correction: string;
  rationale: string;
  severity: ElderCorrection["severity"];
  contextText?: string;
};

type ElderCorrectionReviewBody = {
  status: Extract<ElderCorrection["status"], "accepted" | "rejected">;
};

type ElderCorrectionApplyBody = {
  explanation: string;
};

type GovernanceBody = Pick<GovernanceRecord, "languageId" | "policyType" | "content" | "effectiveDate">;

type ReviewPolicyBody = Pick<ReviewPolicy, "assignedReviewerIds" | "approvalThreshold" | "requiresAssignedReviewer">;

type ReviewDispositionResolveBody = {
  resolutionSummary: string;
};

type PublicAiSession = AiSession;

type PrototypeSessionBody = {
  userId: string;
};

type PrototypeSessionRecord = {
  userId: string;
  createdAt: number;
};

type NeuralMapResponse = NeuralMap & {
  languageId: string;
};

const STUDY_LOOP_DRAFT_AUTHOR = "deterministic-study-loop";
const STUDY_LOOP_DRAFT_ACTION = "drafted";
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const TEST_ONLY_AUTH_TOKEN = "test";
const PROTOTYPE_SESSION_COOKIE = "assini_prototype_session";
const PROTOTYPE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const PROTOTYPE_AUTH_ROLES: readonly UserRole[] = ["learner", "elder", "programmer", "reviewer", "lead"];
const REVIEW_POLICY_ASSIGNABLE_ROLES: readonly UserRole[] = ["reviewer", "elder", "lead", "admin"];
const REVIEW_DISPOSITION_STATUSES: readonly ReviewDispositionStatus[] = ["contested", "rejected", "deferred", "escalated"];
const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 120, windowMs: 60_000 };
const DEFAULT_LOCAL_USERS: User[] = [
  { id: "learner-1", name: "Local Learner", role: "learner" },
  { id: "elder-1", name: "Local Elder", role: "elder" },
  { id: "programmer-1", name: "Local Programmer", role: "programmer" },
  { id: "reviewer-1", name: "Local Reviewer", role: "reviewer" },
  { id: "lead-1", name: "Local Lead", role: "lead" },
  { id: "admin-1", name: "Local Admin", role: "admin" }
];
const RATE_LIMITED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const AI_SESSION_MODES: AiSessionMode[] = ["learner_practice", "elder_review", "programmer_debug"];
const EXERCISE_TYPES: readonly Exercise["type"][] = [
  "translate_to_target",
  "translate_to_english",
  "segment",
  "choose_particle"
];
const SECRET_ENV_NAMES = ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"] as const;

const MODE_ROLES: Record<AiSessionMode, readonly UserRole[]> = {
  learner_practice: ["learner", "elder", "reviewer", "lead", "admin"],
  elder_review: ["elder", "lead", "admin"],
  programmer_debug: ["programmer", "admin"]
};

type AuditEventDraft = {
  actor: User;
  at?: string;
  action: string;
  entityType: AuditEvent["entityType"];
  entityId: string;
  languageId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

function buildAuditEvent(state: AppState, draft: AuditEventDraft, offset: number): AuditEvent {
  return {
    id: `audit-${state.auditEvents.length + offset + 1}-${randomUUID()}`,
    at: draft.at ?? new Date().toISOString(),
    actorId: draft.actor.id,
    actorRole: draft.actor.role,
    action: draft.action,
    entityType: draft.entityType,
    entityId: draft.entityId,
    languageId: draft.languageId ?? null,
    summary: draft.summary,
    metadata: draft.metadata ?? {}
  };
}

function appendAuditEvents(state: AppState, drafts: AuditEventDraft[]): AppState {
  if (drafts.length === 0) return state;
  const auditEvents = drafts.map((draft, index) => buildAuditEvent(state, draft, index));
  return {
    ...state,
    auditEvents: [...state.auditEvents, ...auditEvents]
  };
}

function appendAuditEvent(state: AppState, draft: AuditEventDraft): AppState {
  return appendAuditEvents(state, [draft]);
}

function averageEvaluationScore(run: AppState["evaluationRuns"][number]): number {
  const scores = Object.values(run.scores);
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

function redactConfiguredSecrets(message: string): string {
  let redacted = message;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value && value.length >= 8) {
      redacted = redacted.split(value).join("[redacted-secret]");
    }
  }
  return redacted;
}

function redactErrorSecrets(message: string): string {
  return redactConfiguredSecrets(message)
    .replace(/\bsk-[A-Za-z0-9._-]+/g, "[redacted-secret]")
    .replace(/\b(ASSINI_LLM_API_KEY|OPENAI_API_KEY)=\S+/g, "$1=[redacted-secret]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted-secret]");
}

function llmGenerationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "LLM generation failed";

  const detail = error.message.trim().replace(/\s+/g, " ");
  if (!detail.startsWith("LLM provider ")) {
    return "LLM generation failed";
  }

  return `LLM generation failed: ${redactErrorSecrets(detail).slice(0, 500)}`;
}

function sanitizeNeuralMapForActor(neuralMap: NeuralMap, actor: User): NeuralMap {
  const correctionNodeIds = new Set(
    neuralMap.nodes.filter((node) => node.type === "elder_correction").map((node) => node.id)
  );

  if (actor.role === "learner" || actor.role === "reviewer") {
    return {
      nodes: neuralMap.nodes.filter((node) => !correctionNodeIds.has(node.id)),
      edges: neuralMap.edges.filter((edge) => !correctionNodeIds.has(edge.source) && !correctionNodeIds.has(edge.target))
    };
  }

  if (actor.role === "programmer") {
    return {
      nodes: neuralMap.nodes.map((node) => (
        node.type === "elder_correction"
          ? { ...node, label: "Elder correction (redacted)", metadata: { ...node.metadata, redacted: true } }
          : node
      )),
      edges: neuralMap.edges
    };
  }

  return neuralMap;
}

function toPublicAiSession(session: AiSession, actor: User): PublicAiSession {
  const canSeeActorIds = session.createdBy === actor.id || actor.role === "admin" || actor.role === "lead";

  return {
    ...session,
    createdBy: canSeeActorIds ? session.createdBy : "redacted",
    messages: session.messages.map((message) => ({
      ...message,
      content: canSeeActorIds || message.role !== "user" ? message.content : "[redacted user input]",
      createdBy: canSeeActorIds || message.createdBy === "synthetic-ai" ? message.createdBy : "redacted"
    })),
    neuralMap: sanitizeNeuralMapForActor(session.neuralMap, actor),
    privacy: {
      redactions: Array.from(new Set([
        ...session.privacy.redactions,
        "hidden-chain-of-thought",
        "answer-keys",
        "learner-identifiers"
      ])),
      exposesHiddenChainOfThought: false
    }
  };
}

function parseExerciseSubmissionBody(input: unknown): ExerciseSubmissionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.answer !== "string") {
    return undefined;
  }

  const answer = body.answer.trim();
  return answer.length > 0 ? { answer } : undefined;
}

function parseStudyLoopDraftBody(input: unknown): StudyLoopDraftBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.languageId !== "string") {
    return undefined;
  }

  const languageId = body.languageId.trim();
  return languageId.length > 0 ? { languageId } : undefined;
}

function parsePrototypeSessionBody(input: unknown): PrototypeSessionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.userId !== "string") {
    return undefined;
  }

  const userId = body.userId.trim();
  return userId.length > 0 ? { userId } : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  return values.every((item) => item.length > 0) ? values : undefined;
}

function parseCorpusSourceMetadata(value: unknown): CorpusPassage["sourceMetadata"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const author = typeof record.author === "string" ? record.author.trim() : "";
  const license = typeof record.license === "string" ? record.license.trim() : "";
  const consentRecord = typeof record.consentRecord === "string" ? record.consentRecord.trim() : "";
  const year = typeof record.year === "number" && Number.isInteger(record.year) ? record.year : undefined;

  if (!author || !license || !consentRecord || year === undefined) return undefined;
  return { author, year, license, consentRecord };
}

function parseCorpusMorphemes(value: unknown): CorpusPassage["morphologicalSegmentation"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const morphemes: CorpusPassage["morphologicalSegmentation"] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const surface = typeof record.surface === "string" ? record.surface.trim() : "";
    const lemma = typeof record.lemma === "string" ? record.lemma.trim() : "";
    const gloss = typeof record.gloss === "string" ? record.gloss.trim() : "";
    const features = parseStringArray(record.features);
    if (!surface || !lemma || !gloss || !features) return undefined;
    morphemes.push({ surface, lemma, gloss, features });
  }

  return morphemes.length > 0 ? morphemes : undefined;
}

function parseCorpusImportBody(input: unknown): CorpusImportBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const body = input as Record<string, unknown>;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const sourceMetadata = parseCorpusSourceMetadata(body.sourceMetadata);
  const textTarget = typeof body.textTarget === "string" ? body.textTarget.trim().replace(/\s+/g, " ") : "";
  const textTranslation = typeof body.textTranslation === "string" ? body.textTranslation.trim().replace(/\s+/g, " ") : "";
  const morphologicalSegmentation = parseCorpusMorphemes(body.morphologicalSegmentation);
  const topicTags = parseStringArray(body.topicTags);
  const consentStatus = body.consentStatus && typeof body.consentStatus === "object" && !Array.isArray(body.consentStatus)
    ? body.consentStatus as Record<string, unknown>
    : undefined;
  const restrictions = parseStringArray(consentStatus?.restrictions);

  if (!source || !sourceMetadata || !textTarget || !textTranslation || !morphologicalSegmentation) return undefined;
  if (!topicTags || topicTags.length === 0 || !restrictions || consentStatus?.use !== "synthetic-testing-only") return undefined;

  return {
    source,
    sourceMetadata,
    textTarget,
    textTranslation,
    morphologicalSegmentation,
    topicTags,
    consentStatus: {
      use: "synthetic-testing-only",
      restrictions
    }
  };
}

function parseAdversarialAnswers(value: unknown): Exercise["adversarialAnswers"] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const answers: Exercise["adversarialAnswers"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    const reason = typeof record.reason === "string" ? record.reason.trim() : "";
    if (!answer || !reason) return undefined;
    answers.push({ answer, reason });
  }

  return answers;
}

function parseExerciseAuthoringBody(input: unknown): ExerciseAuthoringBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const type = typeof body.type === "string" && EXERCISE_TYPES.includes(body.type as Exercise["type"])
    ? body.type as Exercise["type"]
    : undefined;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().replace(/\s+/g, " ") : "";
  const allowedVocabulary = parseStringArray(body.allowedVocabulary);
  const allowedRuleIds = parseStringArray(body.allowedRuleIds);
  const expectedAnswers = parseStringArray(body.expectedAnswers);
  const adversarialAnswers = parseAdversarialAnswers(body.adversarialAnswers);
  const gradingExplanation = typeof body.gradingExplanation === "string"
    ? body.gradingExplanation.trim().replace(/\s+/g, " ")
    : "";

  if (!type || prompt.length === 0 || !allowedVocabulary || allowedVocabulary.length === 0) return undefined;
  if (!allowedRuleIds || allowedRuleIds.length === 0) return undefined;
  if (!expectedAnswers || expectedAnswers.length === 0) return undefined;
  if (!adversarialAnswers || gradingExplanation.length === 0) return undefined;

  return {
    type,
    prompt,
    allowedVocabulary,
    allowedRuleIds,
    expectedAnswers,
    adversarialAnswers,
    gradingExplanation
  };
}

function parseAiSessionBody(input: unknown): AiSessionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const languageId = typeof body.languageId === "string" ? body.languageId.trim() : "";
  const mode = typeof body.mode === "string" && AI_SESSION_MODES.includes(body.mode as AiSessionMode)
    ? body.mode as AiSessionMode
    : undefined;
  const seedPrompt = typeof body.seedPrompt === "string" && body.seedPrompt.trim().length > 0
    ? body.seedPrompt.trim()
    : "Start a synthetic AI knowledge session.";
  const contextNoteIds = parseStringArray(body.contextNoteIds);
  const contextPassageIds = parseStringArray(body.contextPassageIds);

  if (!languageId || !mode || !contextNoteIds || !contextPassageIds) {
    return undefined;
  }

  return { languageId, mode, seedPrompt, contextNoteIds, contextPassageIds };
}

function parseAiMessageBody(input: unknown): AiMessageBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  return content.length > 0 ? { content } : undefined;
}

function parseElderCorrectionBody(input: unknown): ElderCorrectionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const languageId = typeof body.languageId === "string" ? body.languageId.trim() : "";
  const noteId = typeof body.noteId === "string" && body.noteId.trim().length > 0 ? body.noteId.trim() : undefined;
  const passageId = typeof body.passageId === "string" && body.passageId.trim().length > 0 ? body.passageId.trim() : undefined;
  const correction = typeof body.correction === "string" ? body.correction.trim() : "";
  const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
  const contextText = typeof body.contextText === "string" && body.contextText.trim().length > 0
    ? body.contextText.trim()
    : undefined;
  const severity = body.severity === undefined
    ? "minor"
    : body.severity === "major" || body.severity === "safety" || body.severity === "minor"
      ? body.severity
      : undefined;

  if (!languageId || !correction || !rationale || !severity || (!noteId && !passageId && !contextText)) {
    return undefined;
  }

  return { languageId, noteId, passageId, correction, rationale, severity, contextText };
}

function parseElderCorrectionReviewBody(input: unknown): ElderCorrectionReviewBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (body.status !== "accepted" && body.status !== "rejected") {
    return undefined;
  }

  return { status: body.status };
}

function parseElderCorrectionApplyBody(input: unknown): ElderCorrectionApplyBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const explanation = typeof body.explanation === "string" ? body.explanation.trim() : "";
  return explanation.length > 0 ? { explanation } : undefined;
}

function parseGovernanceBody(input: unknown): GovernanceBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const languageId = typeof body.languageId === "string" ? body.languageId.trim() : "";
  const policyType = body.policyType === "consent" || body.policyType === "access" || body.policyType === "generation"
    ? body.policyType
    : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const effectiveDate = typeof body.effectiveDate === "string" ? body.effectiveDate.trim() : "";

  if (!languageId || !policyType || !content || !effectiveDate) {
    return undefined;
  }

  return { languageId, policyType, content, effectiveDate };
}

function parseReviewPolicyBody(input: unknown): ReviewPolicyBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const assignedReviewerIds = parseStringArray(body.assignedReviewerIds);
  const approvalThreshold = typeof body.approvalThreshold === "number" && Number.isInteger(body.approvalThreshold)
    ? body.approvalThreshold
    : undefined;
  const requiresAssignedReviewer = body.requiresAssignedReviewer === undefined
    ? true
    : typeof body.requiresAssignedReviewer === "boolean"
      ? body.requiresAssignedReviewer
      : undefined;

  if (!assignedReviewerIds || assignedReviewerIds.length === 0 || !approvalThreshold || approvalThreshold < 1 || requiresAssignedReviewer === undefined) {
    return undefined;
  }

  return { assignedReviewerIds, approvalThreshold, requiresAssignedReviewer };
}

function reviewPolicyValidationError(state: AppState, body: ReviewPolicyBody): string | undefined {
  const assignableUsers = new Map(usersForState(state).map((user) => [user.id, user]));
  const uniqueReviewerIds = new Set(body.assignedReviewerIds);

  if (uniqueReviewerIds.size !== body.assignedReviewerIds.length) {
    return "Review policy assignedReviewerIds must be unique";
  }

  for (const reviewerId of body.assignedReviewerIds) {
    const reviewer = assignableUsers.get(reviewerId);
    if (!reviewer) {
      return `Review policy references unknown reviewer: ${reviewerId}`;
    }

    if (!REVIEW_POLICY_ASSIGNABLE_ROLES.includes(reviewer.role)) {
      return `Review policy reviewer is not assignable: ${reviewerId}`;
    }
  }

  if (body.requiresAssignedReviewer && body.approvalThreshold > body.assignedReviewerIds.length) {
    return "Review policy approvalThreshold cannot exceed assigned reviewers";
  }

  return undefined;
}

function noteExplanationValidationError(explanation: string | undefined): string | undefined {
  if (explanation === undefined) return undefined;

  const wordCount = explanation.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
  if (explanation.length < 24 || wordCount < 4) {
    return "Note explanation edits require a substantive explanation.";
  }

  return undefined;
}

function normalizeAuthoredAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function firstDuplicateNormalizedValue(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    const normalizedValue = normalizeAuthoredAnswer(value);
    if (seen.has(normalizedValue)) {
      return normalizedValue;
    }
    seen.add(normalizedValue);
  }
  return undefined;
}

function corpusTargetContainsSurface(textTarget: string, surface: string): boolean {
  const normalizedSurface = normalizeAuthoredAnswer(surface).toLowerCase();
  return normalizeAuthoredAnswer(textTarget)
    .toLowerCase()
    .split(/\s+/)
    .some((token) => token === normalizedSurface || token.includes(normalizedSurface));
}

function corpusMorphemeGroundingError(languageId: string, body: CorpusImportBody): string | undefined {
  const fixture = syntheticLanguageFixtures.find((item) => item.language.id === languageId);
  if (!fixture) {
    return `Corpus import fixture metadata not found for language: ${languageId}`;
  }

  const vocabularyForms = new Set(fixture.vocabulary.map((item) => item.form.toLowerCase()));
  for (const morpheme of body.morphologicalSegmentation) {
    const surface = morpheme.surface.toLowerCase();
    const lemma = morpheme.lemma.toLowerCase();
    if (!vocabularyForms.has(surface) && !vocabularyForms.has(lemma)) {
      return `Corpus morpheme is not grounded in ${fixture.language.name} vocabulary: ${morpheme.surface}`;
    }
  }

  return undefined;
}

function corpusPhonologyValidationError(languageId: string, body: CorpusImportBody): string | undefined {
  const fixture = syntheticLanguageFixtures.find((item) => item.language.id === languageId);
  if (!fixture) {
    return `Corpus import fixture metadata not found for language: ${languageId}`;
  }

  const invalidTargetSymbols = findInvalidOrthographySymbols(body.textTarget, fixture);
  if (invalidTargetSymbols.length > 0) {
    return `Corpus target text uses ${invalidTargetSymbols.join(", ")} outside ${fixture.language.name} phonology inventory: ${body.textTarget}`;
  }

  return undefined;
}

function corpusImportValidationError(state: AppState, languageId: string, body: CorpusImportBody): string | undefined {
  const normalizedTarget = normalizeAuthoredAnswer(body.textTarget).toLowerCase();
  const duplicate = state.corpus.some((passage) => (
    passage.languageId === languageId
    && normalizeAuthoredAnswer(passage.textTarget).toLowerCase() === normalizedTarget
  ));

  if (duplicate) {
    return `Corpus passage already exists for target text: ${body.textTarget}`;
  }

  for (const morpheme of body.morphologicalSegmentation) {
    if (!corpusTargetContainsSurface(body.textTarget, morpheme.surface)) {
      return `Corpus segmentation surface is not present in target text: ${morpheme.surface}`;
    }
  }

  const phonologyError = corpusPhonologyValidationError(languageId, body);
  if (phonologyError) {
    return phonologyError;
  }

  const groundingError = corpusMorphemeGroundingError(languageId, body);
  if (groundingError) {
    return groundingError;
  }

  return undefined;
}

function exerciseAuthoringValidationError(languageId: string, body: ExerciseAuthoringBody): string | undefined {
  const fixture = syntheticLanguageFixtures.find((item) => item.language.id === languageId);
  if (!fixture) {
    return `Exercise authoring fixture metadata not found for language: ${languageId}`;
  }

  const ruleIds = new Set(fixture.grammarRules.map((rule) => rule.id));
  const vocabularyForms = new Set(fixture.vocabulary.map((item) => item.form));
  const corpusTargets = new Set(fixture.corpus.map((passage) => normalizeAuthoredAnswer(passage.textTarget)));

  for (const ruleId of body.allowedRuleIds) {
    if (!ruleIds.has(ruleId)) {
      return `Exercise references unknown rule: ${ruleId}`;
    }
  }

  for (const form of body.allowedVocabulary) {
    if (!vocabularyForms.has(form)) {
      return `Exercise references unknown vocabulary form: ${form}`;
    }
  }

  const duplicateAllowedRule = firstDuplicateNormalizedValue(body.allowedRuleIds);
  if (duplicateAllowedRule) {
    return `Exercise allowed rule is duplicated: ${duplicateAllowedRule}`;
  }

  const duplicateAllowedVocabulary = firstDuplicateNormalizedValue(body.allowedVocabulary);
  if (duplicateAllowedVocabulary) {
    return `Exercise allowed vocabulary is duplicated: ${duplicateAllowedVocabulary}`;
  }

  if (body.prompt.length < 12) {
    return "Exercise prompt must be substantive.";
  }

  if (body.gradingExplanation.length < 24) {
    return "Exercise grading explanation must be substantive.";
  }

  if (body.adversarialAnswers.length < 2) {
    return "Exercise authoring requires at least two adversarial probes.";
  }

  const normalizedExpected = new Set<string>();
  for (const answer of body.expectedAnswers) {
    const normalizedAnswer = normalizeAuthoredAnswer(answer);
    if (normalizedExpected.has(normalizedAnswer)) {
      return `Exercise expected answer is duplicated: ${normalizedAnswer}`;
    }
    normalizedExpected.add(normalizedAnswer);
  }

  if (body.type === "translate_to_target") {
    for (const answer of body.expectedAnswers) {
      if (!corpusTargets.has(normalizeAuthoredAnswer(answer))) {
        return `Translate-to-target expected answer is not present in corpus: ${answer}`;
      }
    }
  }

  if (body.type === "choose_particle") {
    for (const answer of body.expectedAnswers) {
      if (!body.allowedVocabulary.includes(answer)) {
        return `Choose-particle expected answer is not allowed vocabulary: ${answer}`;
      }
    }
  }

  const normalizedAdversarial = new Set<string>();
  for (const adversarial of body.adversarialAnswers) {
    const normalizedAnswer = normalizeAuthoredAnswer(adversarial.answer);
    if (normalizedExpected.has(normalizedAnswer)) {
      return `Exercise adversarial answer duplicates an expected answer: ${adversarial.answer}`;
    }
    if (normalizedAdversarial.has(normalizedAnswer)) {
      return `Exercise adversarial answer is duplicated: ${normalizedAnswer}`;
    }
    normalizedAdversarial.add(normalizedAnswer);
  }

  return undefined;
}

function parseReviewBody(input: unknown): ReviewBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const review: ReviewBody = {};
  let hasReviewField = false;

  if ("status" in body) {
    hasReviewField = true;
    const status = noteStatusSchema.safeParse(body.status);
    if (!status.success) return undefined;
    review.status = status.data;
  }

  if ("explanation" in body) {
    hasReviewField = true;
    if (typeof body.explanation !== "string") return undefined;
    const explanation = body.explanation.trim().replace(/\s+/g, " ");
    if (explanation.length === 0) return undefined;
    review.explanation = explanation;
  }

  if ("reviewerComment" in body) {
    hasReviewField = true;
    if (typeof body.reviewerComment !== "string") return undefined;
    const reviewerComment = body.reviewerComment.trim();
    if (reviewerComment.length > 0) {
      review.reviewerComment = reviewerComment;
    }
  }

  if ("dispositionAssigneeId" in body) {
    if (typeof body.dispositionAssigneeId !== "string") return undefined;
    const dispositionAssigneeId = body.dispositionAssigneeId.trim();
    if (dispositionAssigneeId.length === 0) return undefined;
    review.dispositionAssigneeId = dispositionAssigneeId;
  }

  if ("dispositionDueAt" in body) {
    if (typeof body.dispositionDueAt !== "string") return undefined;
    const dispositionDueAt = body.dispositionDueAt.trim();
    if (dispositionDueAt.length === 0) return undefined;
    review.dispositionDueAt = dispositionDueAt;
  }

  return hasReviewField && Object.keys(review).length > 0 ? review : undefined;
}

function isReviewDispositionStatus(status: Note["status"] | undefined): status is ReviewDispositionStatus {
  return status !== undefined && REVIEW_DISPOSITION_STATUSES.includes(status as ReviewDispositionStatus);
}

function reviewDispositionValidationError(state: AppState, body: ReviewBody, actor: User): string | undefined {
  const assignedTo = body.dispositionAssigneeId ?? actor.id;
  const assignee = usersForState(state).find((user) => user.id === assignedTo);
  if (!assignee || !REVIEW_POLICY_ASSIGNABLE_ROLES.includes(assignee.role)) {
    return `Review disposition assignee is not assignable: ${assignedTo}`;
  }

  if (body.dispositionDueAt && Number.isNaN(Date.parse(body.dispositionDueAt))) {
    return "Review disposition due date must be parseable";
  }

  return undefined;
}

function parseReviewDispositionResolveBody(input: unknown): ReviewDispositionResolveBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const resolutionSummary = typeof body.resolutionSummary === "string" ? body.resolutionSummary.trim() : "";
  return resolutionSummary.length > 0 ? { resolutionSummary } : undefined;
}

function isReplaceableGeneratedDraft(note: Note): boolean {
  const hasStudyLoopDraftMarker = note.editHistory.some(
    (entry) => entry.by === STUDY_LOOP_DRAFT_AUTHOR && entry.action === STUDY_LOOP_DRAFT_ACTION
  );

  return note.status === "draft"
    && note.reviewer.lastReviewedBy === null
    && note.reviewer.lastReviewedAt === null
    && hasStudyLoopDraftMarker;
}

function mergeGeneratedDraftNotes(existingNotes: Note[], languageId: string, generatedDrafts: Note[]): Note[] {
  const generatedById = new Map(generatedDrafts.map((note) => [note.id, note]));
  const mergedDraftIds = new Set<string>();

  const mergedNotes = existingNotes.map((note) => {
    if (note.languageId !== languageId) return note;

    const generated = generatedById.get(note.id);
    if (!generated) return note;

    mergedDraftIds.add(note.id);
    return isReplaceableGeneratedDraft(note) ? generated : note;
  });

  const missingDrafts = generatedDrafts.filter((note) => !mergedDraftIds.has(note.id));
  return [...mergedNotes, ...missingDrafts];
}

function getHeaderValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function getBearerToken(request: FastifyRequest): string | undefined {
  const authorization = getHeaderValue(request, "authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;
}

function usersForState(state: AppState): User[] {
  return state.users.length > 0 ? state.users : DEFAULT_LOCAL_USERS;
}

function actorById(state: AppState, userId: string | undefined): User | undefined {
  if (!userId) return undefined;
  return usersForState(state).find((user) => user.id === userId);
}

function cookieValue(request: FastifyRequest, name: string): string | undefined {
  const cookieHeader = getHeaderValue(request, "cookie");
  if (!cookieHeader) return undefined;

  for (const rawCookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = rawCookie.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return undefined;
}

function serializePrototypeSessionCookie(sessionId: string): string {
  return [
    `${PROTOTYPE_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${PROTOTYPE_SESSION_MAX_AGE_SECONDS}`
  ].join("; ");
}

function isPrototypeSessionActive(session: PrototypeSessionRecord, now = Date.now()): boolean {
  return now - session.createdAt <= PROTOTYPE_SESSION_MAX_AGE_SECONDS * 1000;
}

function pruneExpiredPrototypeSessions(
  prototypeSessions: Map<string, PrototypeSessionRecord>,
  now = Date.now()
): void {
  prototypeSessions.forEach((session, sessionId) => {
    if (!isPrototypeSessionActive(session, now)) {
      prototypeSessions.delete(sessionId);
    }
  });
}

function resolveActor(
  state: AppState,
  request: FastifyRequest,
  authToken: string | undefined,
  prototypeSessions: Map<string, PrototypeSessionRecord>
): User | undefined {
  const sessionId = cookieValue(request, PROTOTYPE_SESSION_COOKIE);
  const prototypeSession = sessionId ? prototypeSessions.get(sessionId) : undefined;
  if (sessionId && prototypeSession) {
    if (!isPrototypeSessionActive(prototypeSession)) {
      prototypeSessions.delete(sessionId);
    } else {
      const sessionActor = actorById(state, prototypeSession.userId);
      if (sessionActor) return sessionActor;
    }
  }

  const requestedUserId = getHeaderValue(request, "x-assini-user-id");
  const suppliedToken = getHeaderValue(request, "x-assini-dev-token") ?? getBearerToken(request);

  if (!authToken || !requestedUserId || suppliedToken !== authToken) {
    return undefined;
  }

  return actorById(state, requestedUserId);
}

function actorCan(actor: User, allowedRoles: readonly UserRole[]): boolean {
  return allowedRoles.includes(actor.role);
}

function canReadAiSession(session: AiSession, actor: User): boolean {
  if (session.createdBy === actor.id || actor.role === "admin" || actor.role === "lead") {
    return true;
  }

  if (session.mode === "programmer_debug") {
    return actor.role === "programmer";
  }

  if (session.mode === "elder_review") {
    return actor.role === "elder";
  }

  return actor.role === "elder" || actor.role === "reviewer";
}

function requireActor(
  state: AppState,
  request: FastifyRequest,
  reply: FastifyReply,
  authToken: string | undefined,
  prototypeSessions: Map<string, PrototypeSessionRecord>,
  allowedRoles?: readonly UserRole[]
): User | undefined {
  const actor = resolveActor(state, request, authToken, prototypeSessions);
  if (!actor) {
    reply.code(401);
    return undefined;
  }

  if (allowedRoles && !actorCan(actor, allowedRoles)) {
    reply.code(403);
    return undefined;
  }

  return actor;
}

function buildNeuralMap(state: AppState, languageId: string): NeuralMapResponse {
  const language = state.languages.find((item) => item.id === languageId);
  const corpus = state.corpus.filter((passage) => passage.languageId === languageId);
  const notes = state.notes.filter((note) => note.languageId === languageId);
  const exercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
  const sessions = state.aiSessions.filter((session) => session.languageId === languageId);
  const corrections = state.elderCorrections.filter((correction) => correction.languageId === languageId);

  const nodes: NeuralMap["nodes"] = [];
  const edges: NeuralMap["edges"] = [];

  if (language) {
    nodes.push({ id: `language:${language.id}`, type: "language", label: language.name, metadata: { typology: language.typology } });
  }

  for (const passage of corpus) {
    nodes.push({ id: `corpus:${passage.id}`, type: "corpus", label: passage.textTarget, metadata: { source: passage.source } });
    edges.push({ source: `language:${languageId}`, target: `corpus:${passage.id}`, relation: "has_corpus", weight: 1 });
  }

  for (const note of notes) {
    nodes.push({ id: `note:${note.id}`, type: "note", label: note.topic, metadata: { status: note.status, confidence: note.confidence } });
    edges.push({ source: `language:${languageId}`, target: `note:${note.id}`, relation: "has_note", weight: note.confidence === "high" ? 1 : 0.7 });
    for (const passageId of note.evidencePassageIds) {
      edges.push({ source: `corpus:${passageId}`, target: `note:${note.id}`, relation: "uses_context", weight: 0.85 });
    }
  }

  for (const exercise of exercises) {
    nodes.push({ id: `exercise:${exercise.id}`, type: "exercise", label: exercise.prompt, metadata: { type: exercise.type } });
    edges.push({ source: `language:${languageId}`, target: `exercise:${exercise.id}`, relation: "has_exercise", weight: 0.8 });
  }

  for (const session of sessions) {
    nodes.push({ id: `ai_session:${session.id}`, type: "ai_session", label: session.mode, metadata: { status: session.status } });
    edges.push({ source: `language:${languageId}`, target: `ai_session:${session.id}`, relation: "generated", weight: 0.75 });
    for (const noteId of session.contextNoteIds) {
      edges.push({ source: `note:${noteId}`, target: `ai_session:${session.id}`, relation: "uses_context", weight: 0.7 });
    }
    for (const passageId of session.contextPassageIds) {
      edges.push({ source: `corpus:${passageId}`, target: `ai_session:${session.id}`, relation: "uses_context", weight: 0.7 });
    }
  }

  for (const correction of corrections) {
    nodes.push({ id: `elder_correction:${correction.id}`, type: "elder_correction", label: correction.correction, metadata: { severity: correction.severity, status: correction.status } });
    edges.push({
      source: correction.noteId ? `note:${correction.noteId}` : `language:${languageId}`,
      target: `elder_correction:${correction.id}`,
      relation: "proposed_correction",
      weight: correction.severity === "safety" ? 1 : 0.8
    });
  }

  return { languageId, nodes, edges };
}

function buildThinkingSummary(state: AppState, languageId: string, mode: AiSessionMode): string {
  const notes = state.notes.filter((note) => note.languageId === languageId);
  const corpusCount = state.corpus.filter((passage) => passage.languageId === languageId).length;
  const exerciseCount = state.exercises.filter((exercise) => exercise.languageId === languageId).length;
  const approvedCount = notes.filter((note) => note.status === "approved").length;
  return `Safe reasoning summary: ${mode.replace(/_/g, " ")} used ${corpusCount} synthetic corpus passages, ${notes.length} notes (${approvedCount} approved), and ${exerciseCount} exercises. This is an observable trace, not hidden chain-of-thought.`;
}

function buildTraceWarnings(baseWarning: string, generationWarnings: string[]): string[] {
  return Array.from(new Set([baseWarning, ...generationWarnings]));
}

function buildAiSessionNeuralMap(
  state: AppState,
  languageId: string,
  sessionId: string,
  mode: AiSessionMode,
  status: AiSession["status"]
): NeuralMapResponse {
  const neuralMap = buildNeuralMap(state, languageId);
  neuralMap.nodes.push({ id: `ai_session:${sessionId}`, type: "ai_session", label: mode, metadata: { status } });
  neuralMap.edges.push({ source: `language:${languageId}`, target: `ai_session:${sessionId}`, relation: "generated", weight: 0.75 });
  return neuralMap;
}

function buildAiSessionPrivacy(): AiSession["privacy"] {
  return {
    redactions: ["hidden-chain-of-thought", "answer-keys", "learner-identifiers"],
    exposesHiddenChainOfThought: false
  };
}

function buildAiSession(
  state: AppState,
  body: AiSessionBody,
  actor: User,
  now: string,
  generation: LlmGenerationResult
): AiSession {
  const firstNote = state.notes.find((note) => note.languageId === body.languageId);
  const sessionId = `ai-session-${body.languageId}-${state.aiSessions.length + 1}-${now}`;

  const messages: AiMessage[] = [
    {
      id: `${sessionId}-message-1`,
      role: "user",
      content: body.seedPrompt,
      createdAt: now,
      createdBy: actor.id
    },
    {
      id: `${sessionId}-message-2`,
      role: "assistant",
      content: generation.content,
      createdAt: now,
      createdBy: "synthetic-ai"
    }
  ];

  return {
    id: sessionId,
    languageId: body.languageId,
    mode: body.mode,
    status: "active",
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    contextNoteIds: body.contextNoteIds,
    contextPassageIds: body.contextPassageIds,
    messages,
    thinkingSummary: buildThinkingSummary(state, body.languageId, body.mode),
    trace: [
      {
        id: `${sessionId}-trace-input`,
        kind: "input",
        label: "Input",
        summary: "Captured the user's synthetic-only input prompt.",
        referencedIds: [],
        warnings: []
      },
      {
        id: `${sessionId}-trace-retrieval`,
        kind: "retrieval",
        label: "Evidence selection",
        summary: "Linked selected notes and corpus passages as observable evidence.",
        referencedIds: [...body.contextNoteIds, ...body.contextPassageIds],
        warnings: []
      },
      {
        id: `${sessionId}-trace-output`,
        kind: "output",
        label: "Output",
        summary: "Generated a safe synthetic response and redacted hidden chain-of-thought.",
        referencedIds: firstNote ? [firstNote.id] : [],
        warnings: buildTraceWarnings("Hidden chain-of-thought is not exposed.", generation.warnings)
      }
    ],
    neuralMap: buildAiSessionNeuralMap(state, body.languageId, sessionId, body.mode, "active"),
    privacy: buildAiSessionPrivacy()
  };
}

function buildFailedAiSession(
  state: AppState,
  body: AiSessionBody,
  actor: User,
  now: string,
  failureMessage: string
): AiSession {
  const sessionId = `ai-session-${body.languageId}-${state.aiSessions.length + 1}-${now}`;

  return {
    id: sessionId,
    languageId: body.languageId,
    mode: body.mode,
    status: "failed",
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    contextNoteIds: body.contextNoteIds,
    contextPassageIds: body.contextPassageIds,
    messages: [
      {
        id: `${sessionId}-message-1`,
        role: "user",
        content: body.seedPrompt,
        createdAt: now,
        createdBy: actor.id
      }
    ],
    thinkingSummary: buildThinkingSummary(state, body.languageId, body.mode),
    trace: [
      {
        id: `${sessionId}-trace-input`,
        kind: "input",
        label: "Input",
        summary: "Captured the user's synthetic-only input prompt.",
        referencedIds: [],
        warnings: []
      },
      {
        id: `${sessionId}-trace-retrieval`,
        kind: "retrieval",
        label: "Evidence selection",
        summary: "Linked selected notes and corpus passages as observable evidence.",
        referencedIds: [...body.contextNoteIds, ...body.contextPassageIds],
        warnings: []
      },
      {
        id: `${sessionId}-trace-provider-failure`,
        kind: "generation",
        label: "Provider failure",
        summary: failureMessage,
        referencedIds: [...body.contextNoteIds, ...body.contextPassageIds],
        warnings: ["Hidden chain-of-thought is not exposed."]
      }
    ],
    neuralMap: buildAiSessionNeuralMap(state, body.languageId, sessionId, body.mode, "failed"),
    privacy: buildAiSessionPrivacy()
  };
}

function markAiSessionGenerationFailed(
  session: AiSession,
  actor: User,
  content: string,
  now: string,
  failureMessage: string
): AiSession {
  const nextMessages: AiMessage[] = [
    ...session.messages,
    {
      id: `${session.id}-message-${session.messages.length + 1}`,
      role: "user",
      content,
      createdAt: now,
      createdBy: actor.id
    }
  ];

  return {
    ...session,
    status: "failed",
    updatedAt: now,
    messages: nextMessages,
    trace: [
      ...session.trace,
      {
        id: `${session.id}-trace-provider-failure-${nextMessages.length}`,
        kind: "generation",
        label: "Provider failure",
        summary: failureMessage,
        referencedIds: [...session.contextNoteIds, ...session.contextPassageIds],
        warnings: ["Hidden chain-of-thought is not exposed."]
      }
    ],
    neuralMap: {
      ...session.neuralMap,
      nodes: session.neuralMap.nodes.map((node) => (
        node.id === `ai_session:${session.id}`
          ? { ...node, metadata: { ...node.metadata, status: "failed" } }
          : node
      ))
    },
    privacy: buildAiSessionPrivacy()
  };
}

function validateAiSessionContext(state: AppState, body: AiSessionBody): string | undefined {
  const noteIds = new Set(state.notes.filter((note) => note.languageId === body.languageId).map((note) => note.id));
  const passageIds = new Set(state.corpus.filter((passage) => passage.languageId === body.languageId).map((passage) => passage.id));

  for (const noteId of body.contextNoteIds) {
    if (!noteIds.has(noteId)) return `Context note not found for language: ${noteId}`;
  }

  for (const passageId of body.contextPassageIds) {
    if (!passageIds.has(passageId)) return `Context passage not found for language: ${passageId}`;
  }

  return undefined;
}

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false, bodyLimit: options.bodyLimitBytes ?? 64 * 1024 });
  const store = options.store ?? new JsonStore();
  const rateLimit = options.rateLimit === false ? undefined : options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const authToken = options.authToken ?? process.env.ASSINI_DEV_AUTH_TOKEN ?? (process.env.NODE_ENV === "test" ? TEST_ONLY_AUTH_TOKEN : undefined);
  const enablePrototypeAuth = options.enablePrototypeAuth ?? process.env.ASSINI_ENABLE_PROTOTYPE_AUTH === "true";
  const prototypeSessions = new Map<string, PrototypeSessionRecord>();
  const llmProvider = options.llmProvider ?? createLlmProviderFromEnv();
  const rateLimitBuckets = new Map<string, number[]>();
  let memoryState = options.initialState;
  const usesMemoryState = options.initialState !== undefined;
  let memoryUpdateQueue: Promise<void> = Promise.resolve();

  const readState = async (): Promise<AppState> => {
    if (!usesMemoryState) {
      return store.read();
    }

    if (!memoryState) {
      throw new Error("Memory state is not initialized");
    }

    return memoryState;
  };

  const updateState = async (updater: (state: AppState) => AppState): Promise<AppState> => {
    if (!usesMemoryState) {
      return store.update(updater);
    }

    const operation = memoryUpdateQueue.then(async () => {
      if (!memoryState) {
        throw new Error("Memory state is not initialized");
      }

      const next = updater(memoryState);
      memoryState = next;
      return next;
    });
    memoryUpdateQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };

  const checkRateLimit = (request: FastifyRequest, reply: FastifyReply, actor: User | undefined): boolean => {
    if (!rateLimit || !RATE_LIMITED_METHODS.has(request.method)) {
      return true;
    }

    const now = rateLimit.now?.() ?? Date.now();
    const key = `${actor?.id ?? request.ip}:${request.method}:${request.routeOptions.url ?? request.url}`;
    const windowStart = now - rateLimit.windowMs;
    const hits = (rateLimitBuckets.get(key) ?? []).filter((hit) => hit > windowStart);

    if (hits.length >= rateLimit.max) {
      const retryAfterMs = Math.max(1, hits[0] + rateLimit.windowMs - now);
      reply.header("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
      reply.code(429);
      return false;
    }

    hits.push(now);
    rateLimitBuckets.set(key, hits);
    return true;
  };

  app.setErrorHandler((error, _, reply) => {
    const maybeStatusError = error as { statusCode?: number };
    if (maybeStatusError.statusCode === 413) {
      reply.code(413).send({ error: "Payload too large" });
      return;
    }

    reply.send(error);
  });

  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    }
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/prototype-session", async (request, reply) => {
    if (!enablePrototypeAuth) {
      reply.code(404);
      return { error: "Prototype auth is disabled" };
    }

    const body = parsePrototypeSessionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid prototype session body" };
    }

    const state = await readState();
    pruneExpiredPrototypeSessions(prototypeSessions);
    const actor = actorById(state, body.userId);
    if (!actor || !actorCan(actor, PROTOTYPE_AUTH_ROLES)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    const sessionId = randomUUID();
    prototypeSessions.set(sessionId, { userId: actor.id, createdAt: Date.now() });
    reply.header("Set-Cookie", serializePrototypeSessionCookie(sessionId));
    return actor;
  });

  app.get("/llm/status", async () => describeLlmProviderFromEnv());

  app.get("/languages", async () => {
    const state = await readState();
    return state.languages;
  });

  app.get("/languages/:languageId/profile", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const profile = buildSyntheticLanguageProfile(state, languageId);
    if (!profile) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return profile;
  });

  app.get("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.corpus.filter((passage) => passage.languageId === languageId);
  });

  app.post("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseCorpusImportBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid corpus import body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let languageMissing = false;
    let validationError: string | undefined;
    let passage: CorpusPassage | undefined;

    await updateState((state) => {
      if (!state.languages.some((language) => language.id === languageId)) {
        languageMissing = true;
        return state;
      }

      validationError = corpusImportValidationError(state, languageId, body);
      if (validationError) {
        return state;
      }

      const importedAt = new Date().toISOString();
      passage = {
        id: `imported-corpus-${languageId}-${state.corpus.filter((item) => item.languageId === languageId).length + 1}-${randomUUID()}`,
        languageId,
        ...body
      };

      return appendAuditEvent({
        ...state,
        corpus: [...state.corpus, passage]
      }, {
        actor,
        at: importedAt,
        action: "corpus.imported",
        entityType: "corpus",
        entityId: passage.id,
        languageId,
        summary: `Imported synthetic corpus passage ${passage.id}.`,
        metadata: {
          source: passage.source,
          morphemeCount: passage.morphologicalSegmentation.length,
          tagCount: passage.topicTags.length,
          consentUse: passage.consentStatus.use,
          restrictionCount: passage.consentStatus.restrictions.length
        }
      });
    });

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!passage) {
      reply.code(500);
      return { error: "Corpus passage could not be imported" };
    }

    reply.code(201);
    return passage;
  });

  app.get("/languages/:languageId/notes", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return toPublicNotes(state.notes.filter((note) => note.languageId === languageId));
  });

  app.get("/languages/:languageId/exercises", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.exercises.filter((exercise) => exercise.languageId === languageId).map(toPublicExercise);
  });

  app.post("/languages/:languageId/exercises", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseExerciseAuthoringBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid exercise authoring body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let languageMissing = false;
    let validationError: string | undefined;
    let exercise: Exercise | undefined;

    await updateState((state) => {
      if (!state.languages.some((language) => language.id === languageId)) {
        languageMissing = true;
        return state;
      }

      validationError = exerciseAuthoringValidationError(languageId, body);
      if (validationError) {
        return state;
      }

      const createdAt = new Date().toISOString();
      exercise = {
        id: `authored-exercise-${languageId}-${state.exercises.filter((item) => item.languageId === languageId).length + 1}-${randomUUID()}`,
        languageId,
        ...body
      };

      return appendAuditEvent({
        ...state,
        exercises: [...state.exercises, exercise]
      }, {
        actor,
        at: createdAt,
        action: "exercise.created",
        entityType: "exercise",
        entityId: exercise.id,
        languageId,
        summary: `Created synthetic exercise ${exercise.id}.`,
        metadata: {
          exerciseType: exercise.type,
          allowedRuleCount: exercise.allowedRuleIds.length,
          allowedVocabularyCount: exercise.allowedVocabulary.length,
          expectedAnswerCount: exercise.expectedAnswers.length,
          adversarialAnswerCount: exercise.adversarialAnswers.length
        }
      });
    });

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!exercise) {
      reply.code(500);
      return { error: "Exercise could not be created" };
    }

    reply.code(201);
    return toPublicExercise(exercise);
  });

  app.get("/exports/languages/:languageId/snapshot", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const snapshot = toPublicLanguageSnapshot(state, languageId);
    if (!snapshot) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    return snapshot;
  });

  app.get("/exports/evaluations/artifact", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "programmer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    return toPublicEvaluationArtifact(state);
  });

  app.get("/exercises/:exerciseId/submissions", async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const state = await readState();
    const exercise = state.exercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      reply.code(404);
      return { error: `Exercise not found: ${exerciseId}` };
    }

    return state.exerciseSubmissions
      .filter((submission) => submission.exerciseId === exerciseId)
      .map(toPublicExerciseSubmission);
  });

  app.post("/exercises/:exerciseId/submissions", async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const body = parseExerciseSubmissionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid exercise submission body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["learner", "reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let exerciseMissing = false;
    let submission: ExerciseSubmission | undefined;

    await updateState((state) => {
      const exercise = state.exercises.find((item) => item.id === exerciseId);

      if (!exercise) {
        exerciseMissing = true;
        return state;
      }

      const graded = gradeExerciseAnswer(exercise, body.answer);
      const submittedAt = new Date().toISOString();
      submission = {
        id: `submission-${exercise.id}-${state.exerciseSubmissions.length + 1}-${submittedAt}`,
        exerciseId: exercise.id,
        languageId: exercise.languageId,
        answer: body.answer,
        accepted: graded.accepted,
        explanation: graded.accepted ? graded.explanation : "Answer did not match the synthetic exercise key.",
        submittedAt,
        learnerId: actor.id
      };

      return appendAuditEvent({
        ...state,
        exerciseSubmissions: [...state.exerciseSubmissions, submission as ExerciseSubmission]
      }, {
        actor,
        at: submittedAt,
        action: "exercise_submission.created",
        entityType: "exercise_submission",
        entityId: submission.id,
        languageId: exercise.languageId,
        summary: `Graded synthetic exercise submission for ${exercise.id}.`,
        metadata: {
          exerciseId: exercise.id,
          exerciseType: exercise.type,
          accepted: graded.accepted
        }
      });
    });

    if (exerciseMissing) {
      reply.code(404);
      return { error: `Exercise not found: ${exerciseId}` };
    }

    if (!submission) {
      reply.code(500);
      return { error: "Exercise submission could not be created" };
    }

    return toPublicExerciseSubmission(submission);
  });

  app.get("/evaluations", async () => {
    const state = await readState();
    return state.evaluationRuns;
  });

  app.post("/evaluations/run", async (request, reply) => {
    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["lead", "admin", "programmer", "reviewer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let noLanguages = false;
    let runs: ReturnType<typeof runEvaluationForState> | undefined;

    await updateState((state) => {
      if (state.languages.length === 0) {
        noLanguages = true;
        return state;
      }

      runs = runEvaluationForState(state);
      return appendAuditEvents({
        ...state,
        evaluationRuns: [...state.evaluationRuns, ...runs]
      }, runs.map((run) => ({
        actor,
        at: run.createdAt,
        action: "evaluation_run.created",
        entityType: "evaluation_run",
        entityId: run.id,
        languageId: run.languageId,
        summary: `Recorded evaluation run for ${run.languageId}.`,
        metadata: {
          averageScore: averageEvaluationScore(run),
          failureCount: run.failures.length,
          categoryCount: Object.keys(run.scores).length
        }
      })));
    });

    if (noLanguages) {
      reply.code(400);
      return { error: "No languages available to evaluate" };
    }

    return runs;
  });

  app.get("/governance", async () => {
    const state = await readState();
    return state.governance;
  });

  app.get("/audit/events", async (request, reply) => {
    const query = request.query as { languageId?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["lead", "admin", "programmer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (query.languageId && !state.languages.some((language) => language.id === query.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${query.languageId}` };
    }

    return query.languageId
      ? state.auditEvents.filter((event) => event.languageId === query.languageId)
      : state.auditEvents;
  });

  app.post("/governance", async (request, reply) => {
    const body = parseGovernanceBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid governance body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === body.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${body.languageId}` };
    }

    let record: GovernanceRecord | undefined;
    await updateState((state) => {
      const approvedAt = new Date().toISOString();
      record = {
        id: `governance-${body.languageId}-${body.policyType}-${state.governance.length + 1}-${approvedAt}`,
        languageId: body.languageId,
        policyType: body.policyType,
        content: body.content,
        effectiveDate: body.effectiveDate,
        approvedBy: actor.id
      };

      return appendAuditEvent({
        ...state,
        governance: [...state.governance, record as GovernanceRecord]
      }, {
        actor,
        at: approvedAt,
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: record.id,
        languageId: body.languageId,
        summary: `Created ${body.policyType} governance policy record.`,
        metadata: {
          policyType: body.policyType,
          effectiveDate: body.effectiveDate
        }
      });
    });

    reply.code(201);
    return record;
  });

  app.get("/languages/:languageId/review-policy", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const policy = state.reviewPolicies.find((item) => item.languageId === languageId);
    if (!policy) {
      reply.code(404);
      return { error: `Review policy not found for language: ${languageId}` };
    }

    return policy;
  });

  app.put("/languages/:languageId/review-policy", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseReviewPolicyBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review policy body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const validationError = reviewPolicyValidationError(current, body);
    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    let policy: ReviewPolicy | undefined;
    await updateState((state) => {
      const updatedAt = new Date().toISOString();
      policy = {
        id: `review-policy-${languageId}`,
        languageId,
        assignedReviewerIds: body.assignedReviewerIds,
        approvalThreshold: body.approvalThreshold,
        requiresAssignedReviewer: body.requiresAssignedReviewer,
        updatedAt,
        updatedBy: actor.id
      };
      const existingPolicy = state.reviewPolicies.some((item) => item.languageId === languageId);
      const reviewPolicies = existingPolicy
        ? state.reviewPolicies.map((item) => (item.languageId === languageId ? policy as ReviewPolicy : item))
        : [...state.reviewPolicies, policy as ReviewPolicy];

      return appendAuditEvent({
        ...state,
        reviewPolicies
      }, {
        actor,
        at: updatedAt,
        action: "review_policy.upserted",
        entityType: "review_policy",
        entityId: policy.id,
        languageId,
        summary: `Updated review policy for ${languageId}.`,
        metadata: {
          assignedReviewerCount: policy.assignedReviewerIds.length,
          approvalThreshold: policy.approvalThreshold,
          requiresAssignedReviewer: policy.requiresAssignedReviewer
        }
      });
    });

    return policy;
  });

  app.get("/languages/:languageId/review-dispositions", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    return state.reviewDispositions.filter((disposition) => disposition.languageId === languageId);
  });

  app.get("/users/me", async (request, reply) => {
    const state = await readState();
    const actor = resolveActor(state, request, authToken, prototypeSessions);
    if (!actor) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    return actor;
  });

  app.post("/study-loop/draft", async (request, reply) => {
    const body = parseStudyLoopDraftBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Missing languageId" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "elder"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let nextNotes: Note[] = [];
    let languageMissing = false;
    await updateState((state) => {
      if (!state.languages.some((language) => language.id === body.languageId)) {
        languageMissing = true;
        return state;
      }

      const drawn = draftNotesForLanguage(body.languageId, state);
      const notes = mergeGeneratedDraftNotes(state.notes, body.languageId, drawn);
      const drawnIds = new Set(drawn.map((note) => note.id));
      nextNotes = notes.filter((note) => note.languageId === body.languageId && drawnIds.has(note.id));

      return appendAuditEvents({
        ...state,
        notes
      }, nextNotes.map((note) => ({
        actor,
        action: "note.draft_generated",
        entityType: "note",
        entityId: note.id,
        languageId: note.languageId,
        summary: `Generated deterministic draft note for ${note.topic}.`,
        metadata: {
          topic: note.topic,
          status: note.status
        }
      })));
    });

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${body.languageId}` };
    }

    return toPublicNotes(nextNotes);
  });

  app.patch("/notes/:noteId/review", async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const body = parseReviewBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review body" };
    }

    if (isReviewDispositionStatus(body.status) && !body.reviewerComment) {
      reply.code(400);
      return { error: "Review dispositions require reviewerComment" };
    }

    const explanationValidationError = noteExplanationValidationError(body.explanation);
    if (explanationValidationError) {
      reply.code(400);
      return { error: explanationValidationError };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "elder"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (isReviewDispositionStatus(body.status)) {
      const validationError = reviewDispositionValidationError(current, body, actor);
      if (validationError) {
        reply.code(400);
        return { error: validationError };
      }
    }

    let noteMissing = false;
    let nextNote: Note | undefined;
    let policyForbiddenMessage: string | undefined;

    await updateState((state) => {
      const existing = state.notes.find((note) => note.id === noteId);

      if (!existing) {
        noteMissing = true;
        return state;
      }

      const reviewedAt = new Date().toISOString();
      const requestedStatus = body.status ?? existing.status;
      const policy = state.reviewPolicies.find((item) => item.languageId === existing.languageId);
      let nextStatus = requestedStatus;
      let reviewApprovals = state.reviewApprovals;
      let approvalCount: number | undefined;
      let approvalThreshold: number | undefined;
      const disposition = isReviewDispositionStatus(requestedStatus) ? requestedStatus : undefined;
      let reviewDisposition: ReviewDisposition | undefined;

      if (requestedStatus === "approved" && policy) {
        if (policy.requiresAssignedReviewer && !policy.assignedReviewerIds.includes(actor.id)) {
          policyForbiddenMessage = `Reviewer is not assigned to approve notes for language: ${existing.languageId}`;
          return state;
        }

        const alreadyApproved = reviewApprovals.some((approval) => (
          approval.languageId === existing.languageId
          && approval.noteId === noteId
          && approval.reviewerId === actor.id
        ));
        if (!alreadyApproved) {
          const approval: ReviewApproval = {
            id: `review-approval-${existing.languageId}-${noteId}-${actor.id}-${reviewedAt}`,
            languageId: existing.languageId,
            noteId,
            reviewerId: actor.id,
            approvedAt: reviewedAt
          };
          reviewApprovals = [...reviewApprovals, approval];
        }

        approvalCount = new Set(
          reviewApprovals
            .filter((approval) => approval.languageId === existing.languageId && approval.noteId === noteId)
            .map((approval) => approval.reviewerId)
        ).size;
        approvalThreshold = policy.approvalThreshold;
        nextStatus = approvalCount >= approvalThreshold ? "approved" : "under_review";
      } else if (disposition) {
        reviewApprovals = reviewApprovals.filter((approval) => (
          approval.languageId !== existing.languageId || approval.noteId !== noteId
        ));

        reviewDisposition = {
          id: `review-disposition-${existing.languageId}-${noteId}-${state.reviewDispositions.length + 1}-${reviewedAt}`,
          languageId: existing.languageId,
          noteId,
          disposition,
          status: "open",
          reason: body.reviewerComment as string,
          assignedTo: body.dispositionAssigneeId ?? actor.id,
          dueAt: body.dispositionDueAt ?? null,
          openedAt: reviewedAt,
          openedBy: actor.id,
          resolvedAt: null,
          resolvedBy: null,
          resolutionSummary: null
        };
      }

      nextNote = {
        ...existing,
        status: nextStatus,
        explanation: body.explanation ?? existing.explanation,
        reviewer: {
          lastReviewedBy: actor.id,
          lastReviewedAt: reviewedAt,
          comments: body.reviewerComment ? [...existing.reviewer.comments, body.reviewerComment] : existing.reviewer.comments
        },
        editHistory: [
          ...existing.editHistory,
          {
            at: reviewedAt,
            by: actor.id,
            action: "reviewed",
            summary: body.reviewerComment ?? `Status set to ${nextStatus}`
          }
        ]
      };

      const nextState = {
        ...state,
        notes: state.notes.map((note) => (note.id === noteId ? nextNote as Note : note)),
        reviewApprovals,
        reviewDispositions: reviewDisposition
          ? [...state.reviewDispositions, reviewDisposition]
          : state.reviewDispositions
      };

      const noteReviewedDraft: AuditEventDraft = {
        actor,
        at: reviewedAt,
        action: "note.reviewed",
        entityType: "note",
        entityId: noteId,
        languageId: existing.languageId,
        summary: `Reviewed synthetic note ${noteId}.`,
        metadata: {
          requestedStatus,
          status: nextStatus,
          explanationChanged: body.explanation !== undefined,
          ...(disposition ? { disposition } : {}),
          ...(reviewDisposition ? { reviewDispositionId: reviewDisposition.id } : {}),
          ...(approvalCount !== undefined && approvalThreshold !== undefined
            ? { approvalCount, approvalThreshold }
            : {})
        }
      };
      const dispositionCreatedDraft: AuditEventDraft[] = reviewDisposition
        ? [{
            actor,
            at: reviewedAt,
            action: "review_disposition.created",
            entityType: "review_disposition",
            entityId: reviewDisposition.id,
            languageId: existing.languageId,
            summary: `Opened ${reviewDisposition.disposition} review disposition for ${noteId}.`,
            metadata: {
              noteId,
              disposition: reviewDisposition.disposition,
              assignedTo: reviewDisposition.assignedTo,
              dueAt: reviewDisposition.dueAt
            }
          }]
        : [];

      return appendAuditEvents(nextState, [noteReviewedDraft, ...dispositionCreatedDraft]);
    });

    if (noteMissing) {
      reply.code(404);
      return { error: `Note not found: ${noteId}` };
    }

    if (policyForbiddenMessage) {
      reply.code(403);
      return { error: policyForbiddenMessage };
    }

    return toPublicNote(nextNote as Note);
  });

  app.patch("/review-dispositions/:dispositionId/resolve", async (request, reply) => {
    const { dispositionId } = request.params as { dispositionId: string };
    const body = parseReviewDispositionResolveBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review disposition resolution body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let dispositionMissing = false;
    let dispositionAlreadyResolved = false;
    let dispositionForbidden = false;
    let nextDisposition: ReviewDisposition | undefined;

    await updateState((state) => {
      const existingDisposition = state.reviewDispositions.find((disposition) => disposition.id === dispositionId);
      if (!existingDisposition) {
        dispositionMissing = true;
        return state;
      }

      if (existingDisposition.status === "resolved") {
        dispositionAlreadyResolved = true;
        return state;
      }

      const canResolve = actor.role === "lead" || actor.role === "admin" || actor.id === existingDisposition.assignedTo;
      if (!canResolve) {
        dispositionForbidden = true;
        return state;
      }

      const resolvedAt = new Date().toISOString();
      nextDisposition = {
        ...existingDisposition,
        status: "resolved",
        resolvedAt,
        resolvedBy: actor.id,
        resolutionSummary: body.resolutionSummary
      };

      const linkedNote = state.notes.find((note) => note.id === existingDisposition.noteId);
      const nextNote = linkedNote
        ? {
            ...linkedNote,
            status: "under_review" as const,
            editHistory: [
              ...linkedNote.editHistory,
              {
                at: resolvedAt,
                by: actor.id,
                action: "disposition_resolved",
                summary: body.resolutionSummary
              }
            ]
          }
        : undefined;

      return appendAuditEvent({
        ...state,
        reviewDispositions: state.reviewDispositions.map((disposition) => (
          disposition.id === dispositionId ? nextDisposition as ReviewDisposition : disposition
        )),
        notes: nextNote
          ? state.notes.map((note) => (note.id === nextNote.id ? nextNote : note))
          : state.notes
      }, {
        actor,
        at: resolvedAt,
        action: "review_disposition.resolved",
        entityType: "review_disposition",
        entityId: dispositionId,
        languageId: existingDisposition.languageId,
        summary: `Resolved ${existingDisposition.disposition} review disposition for ${existingDisposition.noteId}.`,
        metadata: {
          noteId: existingDisposition.noteId,
          disposition: existingDisposition.disposition,
          noteStatus: nextNote?.status ?? null,
          resolvedBy: actor.id
        }
      });
    });

    if (dispositionMissing) {
      reply.code(404);
      return { error: `Review disposition not found: ${dispositionId}` };
    }

    if (dispositionAlreadyResolved) {
      reply.code(400);
      return { error: "Review disposition is already resolved" };
    }

    if (dispositionForbidden) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    return nextDisposition;
  });

  app.post("/ai/sessions", async (request, reply) => {
    const body = parseAiSessionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid AI session body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, MODE_ROLES[body.mode]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === body.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${body.languageId}` };
    }

    const contextError = validateAiSessionContext(current, body);
    if (contextError) {
      reply.code(400);
      return { error: contextError };
    }

    let generation: LlmGenerationResult;
    try {
      generation = await llmProvider.generateAssistantMessage(buildLlmGenerationInputFromState(current, {
        languageId: body.languageId,
        mode: body.mode,
        prompt: body.seedPrompt,
        contextNoteIds: body.contextNoteIds,
        contextPassageIds: body.contextPassageIds
      }));
    } catch (error) {
      const failureMessage = llmGenerationErrorMessage(error);
      await updateState((state) => {
        const now = new Date().toISOString();
        const failedSession = buildFailedAiSession(state, body, actor, now, failureMessage);
        return appendAuditEvent({
          ...state,
          aiSessions: [...state.aiSessions, failedSession]
        }, {
          actor,
          at: now,
          action: "ai_session.failed",
          entityType: "ai_session",
          entityId: failedSession.id,
          languageId: failedSession.languageId,
          summary: "Stored failed AI session attempt with sanitized diagnostics.",
          metadata: {
            mode: failedSession.mode,
            contextNoteCount: failedSession.contextNoteIds.length,
            contextPassageCount: failedSession.contextPassageIds.length
          }
        });
      });
      reply.code(502);
      return { error: failureMessage };
    }

    let session: AiSession | undefined;
    await updateState((state) => {
      const now = new Date().toISOString();
      session = buildAiSession(state, body, actor, now, generation);
      return appendAuditEvent({
        ...state,
        aiSessions: [...state.aiSessions, session as AiSession]
      }, {
        actor,
        at: now,
        action: "ai_session.created",
        entityType: "ai_session",
        entityId: session.id,
        languageId: session.languageId,
        summary: `Created ${session.mode.replace(/_/g, " ")} AI session.`,
        metadata: {
          mode: session.mode,
          status: session.status,
          contextNoteCount: session.contextNoteIds.length,
          contextPassageCount: session.contextPassageIds.length
        }
      });
    });

    reply.code(201);
    return toPublicAiSession(session as AiSession, actor);
  });

  app.get("/ai/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions);
    if (!actor) return { error: "Unauthorized" };

    const session = state.aiSessions.find((item) => item.id === sessionId);
    if (!session) {
      reply.code(404);
      return { error: `AI session not found: ${sessionId}` };
    }

    if (!canReadAiSession(session, actor)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    return toPublicAiSession(session, actor);
  });

  app.post("/ai/sessions/:sessionId/messages", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = parseAiMessageBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid AI message body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions);
    if (!actor) return { error: "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const currentSession = current.aiSessions.find((item) => item.id === sessionId);
    if (!currentSession) {
      reply.code(404);
      return { error: `AI session not found: ${sessionId}` };
    }

    if (currentSession.createdBy !== actor.id && actor.role !== "admin") {
      reply.code(403);
      return { error: "Forbidden" };
    }

    let generation: LlmGenerationResult;
    try {
      generation = await llmProvider.generateAssistantMessage(buildLlmGenerationInputFromState(current, {
        languageId: currentSession.languageId,
        mode: currentSession.mode,
        prompt: body.content,
        contextNoteIds: currentSession.contextNoteIds,
        contextPassageIds: currentSession.contextPassageIds,
        previousMessages: currentSession.messages
      }));
    } catch (error) {
      const failureMessage = llmGenerationErrorMessage(error);
      await updateState((state) => {
        const now = new Date().toISOString();
        const failedSession = state.aiSessions.find((session) => session.id === sessionId);
        const failedMessageIndex = (failedSession?.messages.length ?? 0) + 1;
        const nextSessions = state.aiSessions.map((session) => (
          session.id === sessionId
            ? markAiSessionGenerationFailed(session, actor, body.content, now, failureMessage)
            : session
        ));
        return appendAuditEvent({
          ...state,
          aiSessions: nextSessions
        }, {
          actor,
          at: now,
          action: "ai_message.failed",
          entityType: "ai_message",
          entityId: `${sessionId}-failed-message-${failedMessageIndex}`,
          languageId: failedSession?.languageId ?? null,
          summary: "Stored failed AI follow-up attempt with sanitized diagnostics.",
          metadata: {
            sessionId,
            mode: failedSession?.mode ?? "unknown"
          }
        });
      });
      reply.code(502);
      return { error: failureMessage };
    }

    let updatedSession: AiSession | undefined;
    await updateState((state) => {
      const session = state.aiSessions.find((item) => item.id === sessionId);
      if (!session) return state;

      const now = new Date().toISOString();
      const nextMessages: AiMessage[] = [
        ...session.messages,
        {
          id: `${session.id}-message-${session.messages.length + 1}`,
          role: "user",
          content: body.content,
          createdAt: now,
          createdBy: actor.id
        },
        {
          id: `${session.id}-message-${session.messages.length + 2}`,
          role: "assistant",
          content: generation.content,
          createdAt: now,
          createdBy: "synthetic-ai"
        }
      ];

      updatedSession = {
        ...session,
        updatedAt: now,
        messages: nextMessages,
        trace: [
          ...session.trace,
          {
            id: `${session.id}-trace-message-${nextMessages.length}`,
            kind: "generation",
            label: "Follow-up response",
            summary: "Appended a new user input and safe synthetic output.",
            referencedIds: [],
            warnings: buildTraceWarnings("No hidden chain-of-thought exposed.", generation.warnings)
          }
        ]
      };

      return appendAuditEvent({
        ...state,
        aiSessions: state.aiSessions.map((item) => (item.id === sessionId ? updatedSession as AiSession : item))
      }, {
        actor,
        at: now,
        action: "ai_message.created",
        entityType: "ai_message",
        entityId: nextMessages[nextMessages.length - 2].id,
        languageId: session.languageId,
        summary: "Appended AI session follow-up message and response.",
        metadata: {
          sessionId: session.id,
          mode: session.mode,
          messageCount: nextMessages.length
        }
      });
    });

    return toPublicAiSession(updatedSession as AiSession, actor);
  });

  app.get("/languages/:languageId/elder-context", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["elder", "reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const language = state.languages.find((item) => item.id === languageId);
    if (!language) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    return {
      language,
      corpus: state.corpus.filter((passage) => passage.languageId === languageId),
      notes: toPublicNotes(state.notes.filter((note) => note.languageId === languageId)),
      corrections: state.elderCorrections.filter((correction) => correction.languageId === languageId),
      governance: state.governance.filter((record) => record.languageId === languageId)
    };
  });

  app.get("/elder/corrections", async (request, reply) => {
    const query = request.query as { languageId?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["elder", "reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (query.languageId && !state.languages.some((language) => language.id === query.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${query.languageId}` };
    }

    return query.languageId
      ? state.elderCorrections.filter((correction) => correction.languageId === query.languageId)
      : state.elderCorrections;
  });

  app.post("/elder/corrections", async (request, reply) => {
    const body = parseElderCorrectionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid elder correction body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === body.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${body.languageId}` };
    }

    if (body.noteId && !current.notes.some((note) => note.id === body.noteId && note.languageId === body.languageId)) {
      reply.code(400);
      return { error: `Note not found for language: ${body.noteId}` };
    }

    if (body.passageId && !current.corpus.some((passage) => passage.id === body.passageId && passage.languageId === body.languageId)) {
      reply.code(400);
      return { error: `Passage not found for language: ${body.passageId}` };
    }

    let correction: ElderCorrection | undefined;
    await updateState((state) => {
      const proposedAt = new Date().toISOString();
      correction = {
        id: `elder-correction-${body.languageId}-${state.elderCorrections.length + 1}-${proposedAt}`,
        languageId: body.languageId,
        noteId: body.noteId,
        passageId: body.passageId,
        correction: body.correction,
        rationale: body.rationale,
        severity: body.severity,
        contextText: body.contextText,
        status: "pending_review",
        proposedBy: actor.id,
        proposedAt,
        reviewedBy: null,
        reviewedAt: null
      };

      return appendAuditEvent({
        ...state,
        elderCorrections: [...state.elderCorrections, correction as ElderCorrection]
      }, {
        actor,
        at: proposedAt,
        action: "elder_correction.created",
        entityType: "elder_correction",
        entityId: correction.id,
        languageId: correction.languageId,
        summary: "Submitted elder correction for review.",
        metadata: {
          severity: correction.severity,
          hasNoteTarget: correction.noteId !== undefined,
          hasPassageTarget: correction.passageId !== undefined
        }
      });
    });

    reply.code(201);
    return correction;
  });

  app.patch("/elder/corrections/:correctionId/review", async (request, reply) => {
    const body = parseElderCorrectionReviewBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid elder correction review body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const { correctionId } = request.params as { correctionId: string };
    if (!current.elderCorrections.some((correction) => correction.id === correctionId)) {
      reply.code(404);
      return { error: `Elder correction not found: ${correctionId}` };
    }

    let reviewedCorrection: ElderCorrection | undefined;
    await updateState((state) => {
      const reviewedAt = new Date().toISOString();
      const elderCorrections = state.elderCorrections.map((correction) => {
        if (correction.id !== correctionId) return correction;
        reviewedCorrection = {
          ...correction,
          status: body.status,
          reviewedBy: actor.id,
          reviewedAt
        };
        return reviewedCorrection;
      });

      return appendAuditEvent({
        ...state,
        elderCorrections
      }, {
        actor,
        at: reviewedAt,
        action: "elder_correction.reviewed",
        entityType: "elder_correction",
        entityId: correctionId,
        languageId: reviewedCorrection?.languageId ?? null,
        summary: `Marked elder correction ${body.status}.`,
        metadata: {
          status: body.status,
          severity: reviewedCorrection?.severity ?? "unknown"
        }
      });
    });

    return reviewedCorrection;
  });

  app.patch("/elder/corrections/:correctionId/apply", async (request, reply) => {
    const body = parseElderCorrectionApplyBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid elder correction apply body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const { correctionId } = request.params as { correctionId: string };
    const existingCorrection = current.elderCorrections.find((correction) => correction.id === correctionId);
    if (!existingCorrection) {
      reply.code(404);
      return { error: `Elder correction not found: ${correctionId}` };
    }

    if (existingCorrection.status !== "accepted") {
      reply.code(409);
      return { error: `Elder correction must be accepted before apply: ${correctionId}` };
    }

    if (!existingCorrection.noteId) {
      reply.code(400);
      return { error: `Elder correction is not linked to a note: ${correctionId}` };
    }

    const linkedNoteId = existingCorrection.noteId;
    const existingNote = current.notes.find(
      (note) => note.id === linkedNoteId && note.languageId === existingCorrection.languageId
    );
    if (!existingNote) {
      reply.code(400);
      return { error: `Note not found for correction: ${existingCorrection.noteId}` };
    }

    let appliedCorrection: ElderCorrection | undefined;
    let appliedNote: Note | undefined;
    await updateState((state) => {
      const appliedAt = new Date().toISOString();
      const summary = `Applied elder correction ${correctionId}.`;
      const elderCorrections = state.elderCorrections.map((correction) => {
        if (correction.id !== correctionId) return correction;
        appliedCorrection = {
          ...correction,
          status: "applied"
        };
        return appliedCorrection;
      });
      const notes = state.notes.map((note) => {
        if (note.id !== linkedNoteId) return note;
        appliedNote = {
          ...note,
          explanation: body.explanation,
          status: "under_review",
          reviewer: {
            lastReviewedBy: actor.id,
            lastReviewedAt: appliedAt,
            comments: [...note.reviewer.comments, summary]
          },
          editHistory: [
            ...note.editHistory,
            {
              at: appliedAt,
              by: actor.id,
              action: "applied_correction",
              summary
            }
          ]
        };
        return appliedNote;
      });

      return appendAuditEvents({
        ...state,
        elderCorrections,
        notes
      }, [
        {
          actor,
          at: appliedAt,
          action: "elder_correction.applied",
          entityType: "elder_correction",
          entityId: correctionId,
          languageId: existingCorrection.languageId,
          summary: `Applied elder correction ${correctionId}.`,
          metadata: {
            noteId: linkedNoteId,
            severity: existingCorrection.severity
          }
        },
        {
          actor,
          at: appliedAt,
          action: "note.elder_correction_applied",
          entityType: "note",
          entityId: linkedNoteId,
          languageId: existingCorrection.languageId,
          summary,
          metadata: {
            correctionId,
            status: "under_review"
          }
        }
      ]);
    });

    return {
      correction: appliedCorrection,
      note: toPublicNote(appliedNote as Note)
    };
  });

  app.get("/observability/ai-sessions", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    return {
      totals: {
        sessions: state.aiSessions.length,
        activeSessions: state.aiSessions.filter((session) => session.status === "active").length,
        messages: state.aiSessions.reduce((total, session) => total + session.messages.length, 0),
        elderCorrections: state.elderCorrections.length
      },
      sessions: state.aiSessions.map((session) => ({
        id: session.id,
        languageId: session.languageId,
        mode: session.mode,
        status: session.status,
        createdBy: session.createdBy,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        contextNoteIds: session.contextNoteIds,
        contextPassageIds: session.contextPassageIds,
        thinkingSummary: session.thinkingSummary,
        privacy: session.privacy
      }))
    };
  });

  app.get("/observability/neural-map", async (request, reply) => {
    const query = request.query as { languageId?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!query.languageId) {
      reply.code(400);
      return { error: "Missing languageId" };
    }

    if (!state.languages.some((language) => language.id === query.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${query.languageId}` };
    }

    return sanitizeNeuralMapForActor(buildNeuralMap(state, query.languageId), actor);
  });

  return app;
}
