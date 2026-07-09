import type { AiSession } from "@assini/db";
import {
  sourceProcessingErrorI18n,
  sourceProcessingWarningI18n,
  vaultImportSkipReasonI18n
} from "@assini/api-contract";
import type {
  EvaluationArtifact,
  ExtractionDraft,
  LanguageSnapshot,
  LlmReachability,
  LlmStatus,
  ObservabilityData,
  PublicExerciseSubmission
} from "../api";
import type { MessageKey, Translate } from "../i18n";
import type { EvaluationTrendStatus } from "../evaluationTrends";
import { ApiError } from "./apiClient";
import type { SnapshotDownload } from "./types";

export function formatEvidenceLabel(count: number, t?: Translate): string {
  if (t) {
    return count === 1
      ? t("reviewView.evidenceLinkOne", { count })
      : t("reviewView.evidenceLinkMany", { count });
  }
  return `${count} evidence ${count === 1 ? "link" : "links"}`;
}

const NOTE_EDIT_ACTION_KEYS: Record<string, MessageKey> = {
  applied_correction: "reviewView.editAction.applied_correction",
  created: "reviewView.editAction.created",
  disposition_resolved: "reviewView.editAction.disposition_resolved",
  drafted: "reviewView.editAction.drafted",
  migrated: "reviewView.editAction.migrated",
  reviewed: "reviewView.editAction.reviewed"
};

/** Localizes note edit-history action tokens for Review detail chrome. */
export function formatNoteEditAction(action: string, t?: Translate): string {
  const key = NOTE_EDIT_ACTION_KEYS[action];
  if (t && key) return t(key);
  return action.replace(/_/g, " ");
}

/** Localizes bulk extraction-draft per-item failure messages for Build review. */
export function localizeExtractionDraftFailure(error: string | undefined, t: Translate): string {
  if (!error?.trim()) return t("ingest.unknownFailure");
  const mapped = operatorApiErrorI18n(error);
  if (mapped) return t(mapped.i18nKey, mapped.i18nParams);
  return error;
}

export function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatSubmissionStatus(submission: PublicExerciseSubmission, t?: Translate): string {
  if (t) {
    return submission.accepted
      ? t("learner.submissionAccepted")
      : t("learner.submissionNeedsReview");
  }
  return submission.accepted ? "Accepted" : "Needs review";
}

/** Localize canned public submission explanations (API still returns English for logs/compat). */
export function formatSubmissionExplanation(submission: PublicExerciseSubmission, t?: Translate): string {
  if (t) {
    return submission.accepted
      ? t("learner.submissionExplanationAccepted")
      : t("learner.submissionExplanationRejected");
  }
  return submission.accepted
    ? "Submission accepted."
    : "Answer did not match the exercise answer key.";
}

const MODE_MESSAGE_KEYS: Record<LlmStatus["mode"], MessageKey> = {
  deterministic: "format.mode.deterministic",
  "local-openai-compatible": "format.mode.localOpenaiCompatible",
  "remote-api": "format.mode.remoteApi",
  invalid: "format.mode.invalid"
};

export function formatMode(mode: string, t?: Translate): string {
  if (t && Object.prototype.hasOwnProperty.call(MODE_MESSAGE_KEYS, mode)) {
    return t(MODE_MESSAGE_KEYS[mode as LlmStatus["mode"]]);
  }
  return mode.replace(/-/g, " ");
}

/**
 * A real model reply only comes from a configured provider whose mode is a
 * genuine backend. Deterministic and invalid modes return canned offline text,
 * so the smoke-test result must be flagged as a placeholder rather than a model
 * answer.
 */
export function isRealModelProvider(status: LlmStatus): boolean {
  if (!status.configured) return false;
  return status.mode === "local-openai-compatible" || status.mode === "remote-api";
}

export function formatReachability(result: LlmReachability, t?: Translate): string {
  if (!result.checked) {
    return t
      ? t("model.reachability.notConfigured")
      : "No external provider configured. Choose a discovered model or enter a base URL and model name in Runtime settings, then Save settings and test again.";
  }
  const modeLabel = formatMode(result.mode, t);
  if (result.reachable) {
    if (typeof result.latencyMs === "number") {
      return t
        ? t("model.reachability.reachableWithLatency", { mode: modeLabel, ms: result.latencyMs })
        : `Reachable (${modeLabel}, ${result.latencyMs} ms)`;
    }
    return t
      ? t("model.reachability.reachable", { mode: modeLabel })
      : `Reachable (${modeLabel})`;
  }
  if (result.detail) {
    return t
      ? t("model.reachability.unreachableWithDetail", { detail: result.detail })
      : `Unreachable: ${result.detail}`;
  }
  return t ? t("model.reachability.unreachable") : "Unreachable";
}

const ORTHOGRAPHY_META_MAX_CHARS = 34;

export function formatOrthographyMeta(value?: string, t?: Translate): string {
  if (!value) {
    return t ? t("header.orthographyDefault") : "Latin orthography";
  }
  const displayValue =
    value.length > ORTHOGRAPHY_META_MAX_CHARS
      ? `${value.slice(0, ORTHOGRAPHY_META_MAX_CHARS - 1)}…`
      : value;
  return t ? t("header.orthographyNamed", { value: displayValue }) : `${displayValue} orthography`;
}

const STATUS_MESSAGE_KEYS: Record<string, MessageKey> = {
  draft: "status.draft",
  under_review: "status.underReview",
  approved: "status.approved",
  contested: "status.contested",
  rejected: "status.rejected",
  deferred: "status.deferred",
  escalated: "status.escalated",
  pending: "status.pending",
  processing: "status.processing",
  processed: "status.processed",
  failed: "status.failed",
  archived: "status.archived",
  proposed: "status.proposed",
  accepted: "status.accepted",
  active: "status.active",
  completed: "status.completed",
  pending_review: "status.pendingReview",
  open: "governance.dispositionStatus.open",
  resolved: "governance.dispositionStatus.resolved",
  learner_practice: "status.learnerPractice",
  elder_review: "status.elderReview",
  programmer_debug: "status.programmerDebug"
};

export function formatStatus(value: string, t?: Translate): string {
  const key = STATUS_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value.replace(/_/g, " ");
}

const ACTOR_ROLE_MESSAGE_KEYS: Record<string, MessageKey> = {
  admin: "role.admin",
  elder: "role.elder",
  programmer: "role.programmer",
  reviewer: "role.reviewer",
  lead: "role.lead",
  learner: "role.learner"
};

/** Localizes audit-ledger actor role badges. */
export function formatActorRole(value: string, t?: Translate): string {
  const key = ACTOR_ROLE_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value;
}

const AUDIT_ENTITY_MESSAGE_KEYS: Record<string, MessageKey> = {
  exercise_submission: "audit.entity.exerciseSubmission",
  evaluation_run: "audit.entity.evaluationRun",
  governance_record: "audit.entity.governanceRecord",
  review_policy: "audit.entity.reviewPolicy",
  review_approval: "audit.entity.reviewApproval",
  review_disposition: "audit.entity.reviewDisposition",
  exercise: "audit.entity.exercise",
  corpus: "audit.entity.corpus",
  note: "audit.entity.note",
  ai_session: "audit.entity.aiSession",
  ai_message: "audit.entity.aiMessage",
  elder_correction: "audit.entity.elderCorrection",
  language: "audit.entity.language",
  source_asset: "audit.entity.sourceAsset",
  extraction_draft: "audit.entity.extractionDraft",
  lexeme: "audit.entity.lexeme"
};

/** Localizes audit entity-type labels shown in the governance ledger. */
export function formatAuditEntityType(value: string, t?: Translate): string {
  const key = AUDIT_ENTITY_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value.replace(/_/g, " ");
}

const AUDIT_ACTION_MESSAGE_KEYS: Record<string, MessageKey> = {
  "language.created": "audit.action.languageCreated",
  "language.updated": "audit.action.languageUpdated",
  "language.deleted": "audit.action.languageDeleted",
  "governance_record.created": "audit.action.governanceRecordCreated",
  "review_policy.upserted": "audit.action.reviewPolicyUpserted",
  "review_disposition.resolved": "audit.action.reviewDispositionResolved",
  "review_disposition.created": "audit.action.reviewDispositionCreated",
  "review_disposition.updated": "audit.action.reviewDispositionUpdated",
  "note.reviewed": "audit.action.noteReviewed",
  "note.draft_generated": "audit.action.noteDraftGenerated",
  "note.elder_correction_applied": "audit.action.noteElderCorrectionApplied",
  "elder_correction.created": "audit.action.elderCorrectionCreated",
  "elder_correction.reviewed": "audit.action.elderCorrectionReviewed",
  "elder_correction.applied": "audit.action.elderCorrectionApplied",
  "exercise.created": "audit.action.exerciseCreated",
  "exercise_submission.created": "audit.action.exerciseSubmissionCreated",
  "corpus.imported": "audit.action.corpusImported",
  "evaluation_run.created": "audit.action.evaluationRunCreated",
  "source_asset.registered": "audit.action.sourceAssetRegistered",
  "source_asset.uploaded": "audit.action.sourceAssetUploaded",
  "source_asset.process_started": "audit.action.sourceAssetProcessStarted",
  "source_asset.processed": "audit.action.sourceAssetProcessed",
  "source_asset.process_failed": "audit.action.sourceAssetProcessFailed",
  "source_asset.process_cancelled": "audit.action.sourceAssetProcessCancelled",
  "source_asset.processing_recovered": "audit.action.sourceAssetProcessingRecovered",
  "source_asset.obsidian_vault_imported": "audit.action.sourceAssetObsidianVaultImported",
  "extraction_draft.accepted": "audit.action.extractionDraftAccepted",
  "extraction_draft.rejected": "audit.action.extractionDraftRejected",
  "ai_session.created": "audit.action.aiSessionCreated",
  "ai_session.failed": "audit.action.aiSessionFailed",
  "ai_message.created": "audit.action.aiMessageCreated",
  "ai_message.failed": "audit.action.aiMessageFailed"
};

/** Localizes audit action titles; unknown codes fall back to spaced machine ids. */
export function formatAuditAction(value: string, t?: Translate): string {
  const key = AUDIT_ACTION_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value.replace(/[_.]/g, " ");
}

/** Localizes the entity-type / entity-id pill in the audit ledger. */
export function formatAuditEntityPill(entityType: string, entityId: string, t?: Translate): string {
  const typeLabel = formatAuditEntityType(entityType, t);
  return t
    ? t("audit.entityPill", { entityType: typeLabel, entityId })
    : `${typeLabel} / ${entityId}`;
}

const PART_OF_SPEECH_MESSAGE_KEYS: Record<string, MessageKey> = {
  noun: "pos.noun",
  verb: "pos.verb",
  adjective: "pos.adjective",
  adverb: "pos.adverb",
  pronoun: "pos.pronoun",
  particle: "pos.particle",
  suffix: "pos.suffix",
  prefix: "pos.prefix",
  infix: "pos.infix",
  clitic: "pos.clitic",
  conjunction: "pos.conjunction",
  interjection: "pos.interjection",
  numeral: "pos.numeral",
  determiner: "pos.determiner",
  unknown: "pos.unknown"
};

/** Localizes common part-of-speech labels on the language profile. */
export function formatPartOfSpeech(value: string, t?: Translate): string {
  const key = PART_OF_SPEECH_MESSAGE_KEYS[value.trim().toLowerCase()];
  if (t && key) return t(key);
  return value;
}

const PARADIGM_DIMENSION_MESSAGE_KEYS: Record<string, MessageKey> = {
  person: "profile.dimension.person",
  tense: "profile.dimension.tense",
  number: "profile.dimension.number",
  aspect: "profile.dimension.aspect",
  mood: "profile.dimension.mood",
  case: "profile.dimension.case",
  gender: "profile.dimension.gender",
  voice: "profile.dimension.voice",
  polarity: "profile.dimension.polarity"
};

/** Localizes known paradigm-gap dimension labels on the language profile. */
export function formatParadigmDimension(value: string, t?: Translate): string {
  const key = PARADIGM_DIMENSION_MESSAGE_KEYS[value.trim().toLowerCase()];
  if (t && key) return t(key);
  return value;
}

const LOCAL_USER_NAME_MESSAGE_KEYS: Record<string, MessageKey> = {
  "Local Learner": "user.localLearner",
  "Local Elder": "user.localElder",
  "Local Programmer": "user.localProgrammer",
  "Local Reviewer": "user.localReviewer",
  "Local Lead": "user.localLead",
  "Local Admin": "user.localAdmin"
};

/** Localizes canned local-prototype user display names in the sidebar user card. */
export function formatLocalUserName(name: string | undefined, t?: Translate): string | undefined {
  if (!name) return undefined;
  const key = LOCAL_USER_NAME_MESSAGE_KEYS[name];
  if (t && key) return t(key);
  return name;
}

type AuditSummaryMatch = {
  i18nKey: MessageKey;
  i18nParams?: Record<string, string | number>;
};

function matchAuditSummary(summary: string): AuditSummaryMatch | undefined {
  const normalized = summary.trim();
  if (!normalized) return undefined;

  let match = normalized.match(/^Created language (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.languageCreated", i18nParams: { name: match[1]! } };
  match = normalized.match(/^Updated language metadata for (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.languageUpdated", i18nParams: { name: match[1]! } };
  match = normalized.match(/^Deleted language (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.languageDeleted", i18nParams: { name: match[1]! } };

  match = normalized.match(/^Created (consent|access|generation) governance policy record\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.governanceRecordCreated",
      i18nParams: { policyType: match[1]! }
    };
  }
  match = normalized.match(/^Updated review policy for (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.reviewPolicyUpdated", i18nParams: { languageId: match[1]! } };
  match = normalized.match(/^Resolved (\w+) review disposition for (.+)\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.reviewDispositionResolved",
      i18nParams: { disposition: match[1]!, noteId: match[2]! }
    };
  }
  match = normalized.match(/^Opened (\w+) review disposition for (.+)\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.reviewDispositionOpened",
      i18nParams: { disposition: match[1]!, noteId: match[2]! }
    };
  }
  match = normalized.match(/^Updated (\w+) review disposition for (.+)\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.reviewDispositionUpdated",
      i18nParams: { disposition: match[1]!, noteId: match[2]! }
    };
  }

  match = normalized.match(/^Reviewed note (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.noteReviewed", i18nParams: { noteId: match[1]! } };
  match = normalized.match(/^Generated deterministic draft note for (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.noteDraftDeterministic", i18nParams: { topic: match[1]! } };
  match = normalized.match(/^Generated model-backed draft note for (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.noteDraftModel", i18nParams: { topic: match[1]! } };

  if (normalized === "Submitted elder correction for review.") {
    return { i18nKey: "audit.summary.elderCorrectionSubmitted" };
  }
  match = normalized.match(/^Marked elder correction (accepted|rejected)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.elderCorrectionMarked", i18nParams: { status: match[1]! } };
  }
  match = normalized.match(/^Applied elder correction (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.elderCorrectionApplied", i18nParams: { correctionId: match[1]! } };
  }

  match = normalized.match(/^Created exercise (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.exerciseCreated", i18nParams: { exerciseId: match[1]! } };
  match = normalized.match(/^Graded exercise submission for (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.exerciseSubmissionGraded", i18nParams: { exerciseId: match[1]! } };
  }
  match = normalized.match(/^Imported corpus passage (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.corpusImported", i18nParams: { passageId: match[1]! } };
  match = normalized.match(/^Recorded evaluation run for (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.evaluationRunRecorded", i18nParams: { languageId: match[1]! } };
  }

  match = normalized.match(/^Registered (\S+) source "(.+)"\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.sourceRegistered",
      i18nParams: { kind: match[1]!, title: match[2]! }
    };
  }
  match = normalized.match(/^Uploaded (\S+) source "(.+)"\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.sourceUploaded",
      i18nParams: { kind: match[1]!, title: match[2]! }
    };
  }
  match = normalized.match(/^Started background processing for source "(.+)"\.$/);
  if (match) {
    return { i18nKey: "audit.summary.sourceProcessStartedAsync", i18nParams: { title: match[1]! } };
  }
  match = normalized.match(/^Started processing for source "(.+)"\.$/);
  if (match) {
    return { i18nKey: "audit.summary.sourceProcessStarted", i18nParams: { title: match[1]! } };
  }
  match = normalized.match(/^Processed source "(.+)" into (\d+) extraction drafts\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.sourceProcessed",
      i18nParams: { title: match[1]!, count: Number(match[2]) }
    };
  }
  match = normalized.match(/^Processing failed for source "(.+)"\.$/);
  if (match) {
    return { i18nKey: "audit.summary.sourceProcessFailed", i18nParams: { title: match[1]! } };
  }
  match = normalized.match(/^Cancelled queued processing for source "(.+)"\.$/);
  if (match) {
    return { i18nKey: "audit.summary.sourceProcessCancelled", i18nParams: { title: match[1]! } };
  }
  match = normalized.match(
    /^Recovered source "(.+)" from an interrupted processing run; marked failed for re-processing\.$/
  );
  if (match) {
    return { i18nKey: "audit.summary.sourceProcessingRecovered", i18nParams: { title: match[1]! } };
  }
  match = normalized.match(/^Imported (\d+) Markdown sources from Obsidian vault "(.+)"\.$/);
  if (match) {
    return {
      i18nKey: "audit.summary.obsidianVaultImported",
      i18nParams: { count: Number(match[1]), vault: match[2]! }
    };
  }

  match = normalized.match(/^Accepted lexeme draft (.+)\.$/);
  if (match) return { i18nKey: "audit.summary.lexemeDraftAccepted", i18nParams: { form: match[1]! } };
  match = normalized.match(/^Accepted corpus draft into passage (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.corpusDraftAccepted", i18nParams: { passageId: match[1]! } };
  }
  match = normalized.match(/^Accepted grammar-note extraction draft (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.grammarNoteDraftAccepted", i18nParams: { draftId: match[1]! } };
  }
  match = normalized.match(/^Accepted grammar-note draft into note (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.grammarNoteDraftIntoNote", i18nParams: { noteId: match[1]! } };
  }
  match = normalized.match(/^Rejected extraction draft (.+)\.$/);
  if (match) {
    return { i18nKey: "audit.summary.extractionDraftRejected", i18nParams: { draftId: match[1]! } };
  }

  if (normalized === "Stored failed AI session attempt with sanitized diagnostics.") {
    return { i18nKey: "audit.summary.aiSessionFailedStored" };
  }
  match = normalized.match(/^Created (.+) AI session\.$/);
  if (match) return { i18nKey: "audit.summary.aiSessionCreated", i18nParams: { mode: match[1]! } };
  if (normalized === "Stored failed AI follow-up attempt with sanitized diagnostics.") {
    return { i18nKey: "audit.summary.aiMessageFailedStored" };
  }
  if (normalized === "Appended a new user input and safe model output.") {
    return { i18nKey: "audit.summary.aiMessageAppendedSafe" };
  }
  if (normalized === "Appended AI session follow-up message and response.") {
    return { i18nKey: "audit.summary.aiMessageAppended" };
  }

  return undefined;
}

const POLICY_TYPE_MESSAGE_KEYS: Record<string, MessageKey> = {
  consent: "policyType.consent",
  access: "policyType.access",
  generation: "policyType.generation"
};

const DISPOSITION_MESSAGE_KEYS: Record<string, MessageKey> = {
  contested: "reviewDisposition.contested",
  rejected: "reviewDisposition.rejected",
  deferred: "reviewDisposition.deferred",
  escalated: "reviewDisposition.escalated"
};

const SOURCE_KIND_MESSAGE_KEYS: Record<string, MessageKey> = {
  text: "ingest.sourceKindText",
  wordlist: "ingest.sourceKindWordlist",
  url: "ingest.sourceKindUrl",
  image: "ingest.sourceKindImage",
  audio: "ingest.sourceKindAudio",
  document: "ingest.sourceKindDocument"
};

/** Localizes Build source-kind pills. */
export function formatSourceKind(value: string, t?: Translate): string {
  const key = SOURCE_KIND_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value;
}

type DraftGroundingFlagLike = {
  kind: string;
  message: string;
};

/**
 * Localizes known draft-grounding tooltip detail messages for Build review.
 * Unrecognized / custom operator notes pass through unchanged.
 */
export function localizeDraftGroundingMessage(
  flag: DraftGroundingFlagLike,
  t: Translate
): string {
  const message = flag.message.trim();
  if (flag.kind === "gloss_conflict") {
    const match = message.match(
      /^Accepted lexeme "(.+)" is glossed "(.+)", but this draft glosses it "(.+)"\.$/
    );
    if (match) {
      return t("draftGrounding.gloss_conflict.detail", {
        form: match[1]!,
        acceptedGloss: match[2]!,
        draftGloss: match[3]!
      });
    }
  }
  if (flag.kind === "decomposable_form") {
    const match = message.match(
      /^Form decomposes into accepted lexemes (.+); the draft gloss may belong to a different word\.$/
    );
    if (match) {
      return t("draftGrounding.decomposable_form.detail", { parts: match[1]! });
    }
  }
  if (flag.kind === "segmentation_conflict") {
    const match = message.match(
      /^Segment "(.+)" is glossed "(.+)" in this draft, but the accepted lexeme "(.+)" is glossed "(.+)"\.$/
    );
    if (match) {
      return t("draftGrounding.segmentation_conflict.detail", {
        surface: match[1]!,
        draftGloss: match[2]!,
        form: match[3]!,
        acceptedGloss: match[4]!
      });
    }
  }
  return flag.message;
}

/**
 * Localizes known audit-event summary lines shown in the Checks ledger.
 * Unrecognized / custom summaries pass through unchanged.
 */
export function formatAuditSummary(summary: string, t?: Translate): string {
  if (!t) return summary;
  const matched = matchAuditSummary(summary);
  if (!matched) return summary;

  const params: Record<string, string | number> = { ...(matched.i18nParams ?? {}) };
  if (typeof params.policyType === "string") {
    const key = POLICY_TYPE_MESSAGE_KEYS[params.policyType];
    if (key) params.policyType = t(key);
  }
  if (typeof params.disposition === "string") {
    const key = DISPOSITION_MESSAGE_KEYS[params.disposition];
    if (key) params.disposition = t(key);
  }
  if (typeof params.status === "string") {
    params.status = formatStatus(params.status, t);
  }
  if (typeof params.mode === "string") {
    params.mode = formatStatus(params.mode.replace(/ /g, "_"), t);
  }
  if (typeof params.kind === "string") {
    params.kind = formatSourceKind(params.kind, t);
  }
  return t(matched.i18nKey, params);
}

const TYPOLOGY_MESSAGE_KEYS: Record<string, MessageKey> = {
  unknown: "typology.unknown",
  agglutinative: "typology.agglutinative",
  isolating: "typology.isolating",
  fusional: "typology.fusional",
  "polysynthetic-lite": "typology.polysyntheticLite",
  polysynthetic: "typology.polysynthetic",
  analytic: "typology.analytic",
  mixed: "typology.mixed"
};

/** Localizes language typology labels for operator-facing chrome. */
export function formatTypology(value: string | undefined, t?: Translate): string {
  if (!value) {
    return t ? t("common.unknown") : "unknown";
  }
  const key = TYPOLOGY_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value;
}

const METRIC_MESSAGE_KEYS: Record<string, MessageKey> = {
  noteCoverage: "format.metric.noteCoverage",
  noteAccuracy: "format.metric.noteAccuracy",
  evidenceAccuracy: "format.metric.evidenceAccuracy",
  segmentationAccuracy: "format.metric.segmentationAccuracy",
  translationAccuracy: "format.metric.translationAccuracy",
  exerciseGrading: "format.metric.exerciseGrading",
  generationPolicy: "format.metric.generationPolicy",
  corpusCoverage: "format.metric.corpusCoverage",
  noteQuality: "format.metric.noteQuality",
  exerciseQuality: "format.metric.exerciseQuality"
};

export function formatMetric(value: string, t?: Translate): string {
  const key = METRIC_MESSAGE_KEYS[value];
  if (t && key) return t(key);
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type RelativeAge =
  | { kind: "justNow" }
  | { kind: "minutes"; count: number }
  | { kind: "hours"; count: number }
  | { kind: "days"; count: number };

/** Buckets an ISO timestamp into a coarse relative-age unit for operator-facing labels. */
export function relativeAge(isoTimestamp: string, now = Date.now()): RelativeAge {
  const elapsedMs = Math.max(0, now - Date.parse(isoTimestamp));
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return { kind: "justNow" };
  if (elapsedMinutes < 60) return { kind: "minutes", count: elapsedMinutes };
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return { kind: "hours", count: elapsedHours };
  return { kind: "days", count: Math.floor(elapsedHours / 24) };
}

export function parseReviewerIds(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

export function parseAuthoringList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeDomId(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-");
}

export function formatIntegrityLabel(
  integrity: LanguageSnapshot["integrity"],
  t?: Translate
): string {
  const hash = integrity.contentHash.slice(0, 12);
  if (t) {
    return t("format.integrityLabel", { algorithm: integrity.algorithm, hash });
  }
  return `integrity ${integrity.algorithm}:${hash}`;
}

function formatLocalizedCount(
  count: number,
  oneKey: MessageKey,
  manyKey: MessageKey,
  englishSingular: string,
  englishPlural: string | undefined,
  t?: Translate
): string {
  if (t) {
    return count === 1 ? t(oneKey, { count }) : t(manyKey, { count });
  }
  return formatCount(count, englishSingular, englishPlural);
}

export function formatSnapshotReviewAccountability(
  notes: LanguageSnapshot["notes"],
  t?: Translate
): string | undefined {
  const pendingReview = notes.filter((note) => note.status !== "approved").length;
  if (pendingReview === 0) return undefined;
  if (t) {
    return pendingReview === 1
      ? t("governance.snapshotNoteNeedsReviewOne", { count: pendingReview })
      : t("governance.snapshotNotesNeedReviewMany", { count: pendingReview });
  }
  return formatCount(pendingReview, "note still needs review", "notes still need review");
}

export function buildSnapshotDownload(snapshot: LanguageSnapshot, t?: Translate): SnapshotDownload {
  const safeLanguageId = snapshot.language.id.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "language";
  const reviewAccountability = formatSnapshotReviewAccountability(snapshot.notes, t);
  const summary = [
    formatLocalizedCount(
      snapshot.corpus.length,
      "format.count.corpusPassageOne",
      "format.count.corpusPassageMany",
      "corpus passage",
      undefined,
      t
    ),
    formatLocalizedCount(
      snapshot.notes.length,
      "format.count.noteOne",
      "format.count.noteMany",
      "note",
      undefined,
      t
    ),
    reviewAccountability,
    formatLocalizedCount(
      snapshot.exercises.length,
      "format.count.exerciseOne",
      "format.count.exerciseMany",
      "exercise",
      undefined,
      t
    ),
    formatLocalizedCount(
      snapshot.linguisticProfile.stats.vocabularyItems,
      "format.count.vocabularyItemOne",
      "format.count.vocabularyItemMany",
      "vocabulary item",
      undefined,
      t
    ),
    formatLocalizedCount(
      snapshot.linguisticProfile.stats.grammarRules,
      "format.count.grammarRuleOne",
      "format.count.grammarRuleMany",
      "grammar rule",
      undefined,
      t
    ),
    formatLocalizedCount(
      snapshot.linguisticProfile.stats.sourceAssets,
      "format.count.sourceAssetOne",
      "format.count.sourceAssetMany",
      "source asset",
      undefined,
      t
    ),
    formatIntegrityLabel(snapshot.integrity, t)
  ].filter(Boolean).join(", ");

  return {
    fileName: `assini-${safeLanguageId}-snapshot.json`,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(snapshot, null, 2))}`,
    summary: t
      ? t("governance.snapshotReadySummary", { summary })
      : `Snapshot ready: ${summary}.`,
    exportedAt: snapshot.exportedAt
  };
}

export function buildEvaluationArtifactDownload(
  artifact: EvaluationArtifact,
  t?: Translate
): SnapshotDownload {
  const percent = Math.round(artifact.summary.averageLatestScore * 100);
  const summary = [
    formatLocalizedCount(
      artifact.summary.latestRuns,
      "format.count.latestRunOne",
      "format.count.latestRunMany",
      "latest run",
      undefined,
      t
    ),
    formatLocalizedCount(
      artifact.summary.failedLatestRuns,
      "format.count.failedLatestRunOne",
      "format.count.failedLatestRunMany",
      "failed latest run",
      undefined,
      t
    ),
    formatLocalizedCount(
      artifact.summary.regressedLatestRuns,
      "format.count.regressedLatestRunOne",
      "format.count.regressedLatestRunMany",
      "regressed latest run",
      undefined,
      t
    ),
    formatLocalizedCount(
      artifact.summary.failureCount,
      "format.count.failureLineOne",
      "format.count.failureLineMany",
      "failure line",
      undefined,
      t
    ),
    t ? t("format.averageLatestScore", { percent }) : `${percent}% average latest score`,
    formatIntegrityLabel(artifact.integrity, t)
  ].join(", ");

  return {
    fileName: "assini-evaluation-artifact.json",
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(artifact, null, 2))}`,
    summary: t
      ? t("eval.artifactReadySummary", { summary })
      : `Evaluation artifact ready: ${summary}.`,
    exportedAt: artifact.exportedAt
  };
}

export function latestAssistantMessage(session: AiSession, t?: Translate): string {
  const assistant = session.messages.slice().reverse().find((message) => message.role === "assistant");
  if (assistant?.content) return assistant.content;
  return t
    ? t("model.smokeTest.noAssistantMessage")
    : "Session created, but no assistant message was returned.";
}

/**
 * Detects whether an AI session was answered by the deterministic offline
 * fallback rather than a real provider, by inspecting the trace warnings the
 * session exposes (e.g. "deterministic"/"offline" fallback notices).
 */
export function sessionUsedDeterministicFallback(session: AiSession): boolean {
  const trace = session.trace ?? [];
  return trace.some((step) =>
    (step.warnings ?? []).some((warning) => {
      const text = warning.toLowerCase();
      return text.includes("deterministic") || text.includes("offline fallback");
    })
  );
}

export function countFailedSessions(observability: ObservabilityData): number {
  return observability.sessions.filter((session) => session.status === "failed").length;
}

export function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 0.96) return "success";
  if (score >= 0.84) return "warning";
  return "danger";
}

/**
 * Localizes canned evaluation-run summary lines from packages/eval
 * (`"{name}: {percent}% average score across {count} categories."`).
 * Unrecognized summaries (custom fixtures) pass through unchanged.
 */
export function localizeEvaluationRunSummary(summary: string, t: Translate): string {
  const match = summary.trim().match(
    /^(.+):\s*([\d.]+)%\s+average score across\s+(\d+)\s+categories\.?$/i
  );
  if (!match) return summary;
  return t("eval.runSummary", {
    name: match[1]!.trim(),
    percent: match[2]!,
    count: Number(match[3])
  });
}

/**
 * Localizes known evaluation failure messages from packages/eval scoring.
 * Unrecognized messages (future codes / fixtures) pass through unchanged.
 */
function stripTrailingPeriod(value: string): string {
  return value.replace(/\.$/, "");
}

export function localizeEvaluationFailureMessage(message: string, t: Translate): string {
  const normalized = message.trim();
  if (!normalized) return message;

  let match = normalized.match(/^Missing corpus passage for answer key (.+)$/i);
  if (match) return t("eval.failure.missingCorpusPassage", { id: stripTrailingPeriod(match[1]!) });

  match = normalized.match(/^Translation mismatch for corpus passage (.+)$/i);
  if (match) return t("eval.failure.translationMismatch", { id: stripTrailingPeriod(match[1]!) });

  match = normalized.match(/^Segmentation mismatch for corpus passage (.+)$/i);
  if (match) return t("eval.failure.segmentationMismatch", { id: stripTrailingPeriod(match[1]!) });

  match = normalized.match(/^Missing corpus answer key for passage (.+)$/i);
  if (match) return t("eval.failure.missingCorpusAnswerKey", { id: stripTrailingPeriod(match[1]!) });

  match = normalized.match(/^Missing note topic (.+)$/i);
  if (match) return t("eval.failure.missingNoteTopic", { topic: match[1]! });

  match = normalized.match(/^Missing note content for (.+)$/i);
  if (match) return t("eval.failure.missingNoteContent", { topic: match[1]! });

  match = normalized.match(/^Missing note evidence for (.+)$/i);
  if (match) return t("eval.failure.missingNoteEvidence", { topic: match[1]! });

  match = normalized.match(/^Explanation mismatch for (.+) \(draft confidence: (.+)\)\.?$/i);
  if (match) {
    return t("eval.failure.explanationMismatch", {
      topic: match[1]!,
      confidence: stripTrailingPeriod(match[2]!)
    });
  }

  match = normalized.match(/^Evidence mismatch for (.+) \(draft confidence: (.+)\)\.?$/i);
  if (match) {
    return t("eval.failure.evidenceMismatch", {
      topic: match[1]!,
      confidence: stripTrailingPeriod(match[2]!)
    });
  }

  if (normalized === "Expected answer was rejected by the grader.") {
    return t("eval.failure.expectedAnswerRejected");
  }
  if (normalized === "Deterministic invalid answer was accepted by the grader.") {
    return t("eval.failure.invalidAnswerAccepted");
  }
  if (normalized === "Curated adversarial answer was accepted by the grader.") {
    return t("eval.failure.adversarialAnswerAccepted");
  }
  if (normalized === "Expected answer uses forms outside the exercise allowed vocabulary.") {
    return t("eval.failure.outsideAllowedVocabulary");
  }

  match = normalized.match(/^No note answer keys to score; empty (\w+) fails closed\.?$/i);
  if (match) {
    return t("eval.failure.emptyNoteKeys", { category: formatMetric(match[1]!, t) });
  }
  match = normalized.match(/^No corpus answer keys to score; empty (\w+) fails closed\.?$/i);
  if (match) {
    return t("eval.failure.emptyCorpusKeys", { category: formatMetric(match[1]!, t) });
  }
  match = normalized.match(/^No exercises to score; empty (\w+) fails closed\.?$/i);
  if (match) {
    return t("eval.failure.emptyExercises", { category: formatMetric(match[1]!, t) });
  }
  match = normalized.match(/^No generation-policy exercises to score; empty (\w+) fails closed\.?$/i);
  if (match) {
    return t("eval.failure.emptyGenerationPolicy", { category: formatMetric(match[1]!, t) });
  }

  return message;
}

export function formatTrendPoints(delta: number | null, t?: Translate): string {
  const count = delta === null ? 0 : Math.round(Math.abs(delta) * 100);
  return t ? t("format.trendPoints", { count }) : `${count} pts`;
}

export function formatSignedTrendPoints(delta: number | null, t?: Translate): string {
  if (delta === null) {
    return t ? t("format.trendPointsNew") : "new";
  }
  const points = Math.round(delta * 100);
  const signed = `${points > 0 ? "+" : ""}${points}`;
  return t ? t("format.trendPointsSigned", { signed }) : `${signed} pts`;
}

export function trendVerb(status: EvaluationTrendStatus, t?: Translate): string {
  if (status === "improved") {
    return t ? t("eval.trendImproved") : "improved";
  }
  if (status === "regressed") {
    return t ? t("eval.trendRegressed") : "regressed";
  }
  return t ? t("eval.trendHeldSteady") : "held steady";
}

export function extractionDraftSummary(draft: ExtractionDraft, t?: Translate): string {
  const pair = (left: string, right: string) =>
    t ? t("ingest.draftSummaryPair", { left, right }) : `${left} — ${right}`;
  const missing = (key: MessageKey, fallback: string) => (t ? t(key) : fallback);

  if (draft.kind === "lexeme") {
    return pair(
      draft.payload.form ?? missing("ingest.draftSummary.noForm", "(no form)"),
      draft.payload.gloss ?? missing("ingest.draftSummary.noGloss", "(no gloss)")
    );
  }
  if (draft.kind === "corpus_passage") {
    return pair(
      draft.payload.textTarget ?? missing("ingest.draftSummary.noTargetText", "(no target text)"),
      draft.payload.textTranslation ?? missing("ingest.draftSummary.noTranslation", "(no translation)")
    );
  }
  return pair(
    draft.payload.topic ?? missing("ingest.draftSummary.noTopic", "(no topic)"),
    draft.payload.explanation ?? missing("ingest.draftSummary.noExplanation", "(no explanation)")
  );
}

function retryAfterSecondsFromMessage(message: string): number | undefined {
  const match = message.match(/Retry after (\d+) second/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function vaultImportErrorI18n(error: string): { i18nKey: MessageKey } | undefined {
  const normalized = error.trim();
  if (!normalized) return undefined;

  if (/ASSINI_OBSIDIAN_VAULT_ROOTS is set/i.test(normalized) && /disabled until/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultRootsUnset" };
  }
  if (/must be absolute directory paths/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultRootsMustBeAbsolute" };
  }
  if (/outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultOutsideAllowlist" };
  }
  if (/vault path is not a directory/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultNotDirectory" };
  }
  if (/vault path could not be read/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultUnreadable" };
  }

  return undefined;
}

/** Maps known elder/export/auth/study-loop API English errors when response metadata is absent. */
function operatorApiErrorI18n(
  error: string
): { i18nKey: MessageKey; i18nParams?: Record<string, string | number> } | undefined {
  const normalized = error.trim();
  if (!normalized) return undefined;

  if (/Prototype auth is disabled/i.test(normalized)) {
    return { i18nKey: "errors.prototypeAuthDisabled" };
  }
  if (/Invalid prototype session body/i.test(normalized)) {
    return { i18nKey: "errors.invalidPrototypeSessionBody" };
  }
  if (/Invalid AI session body/i.test(normalized)) {
    return { i18nKey: "errors.invalidAiSessionBody" };
  }
  if (/Invalid AI message body/i.test(normalized)) {
    return { i18nKey: "errors.invalidAiMessageBody" };
  }
  if (/^AI session not found:/i.test(normalized)) {
    return { i18nKey: "errors.aiSessionNotFound" };
  }
  if (/^Context note not found for language:/i.test(normalized)) {
    return { i18nKey: "errors.aiSessionContextNoteNotFound" };
  }
  if (/^Context passage not found for language:/i.test(normalized)) {
    return { i18nKey: "errors.aiSessionContextPassageNotFound" };
  }
  if (/^LLM generation failed/i.test(normalized)) {
    return { i18nKey: "errors.llmGenerationFailed" };
  }
  if (/Invalid review body/i.test(normalized)) {
    return { i18nKey: "errors.invalidReviewBody" };
  }
  if (/Review dispositions require reviewerComment/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionRequiresComment" };
  }
  if (/Note explanation edits require a substantive explanation/i.test(normalized)) {
    return { i18nKey: "errors.noteExplanationTooShort" };
  }
  if (/Note example passage is not in language:/i.test(normalized)) {
    return { i18nKey: "errors.noteExamplePassageInvalid" };
  }
  if (/Note example text must match corpus passage:/i.test(normalized)) {
    return { i18nKey: "errors.noteExampleTextMismatch" };
  }
  if (/^Note not found:/i.test(normalized)) {
    return { i18nKey: "errors.noteNotFound" };
  }
  if (/Reviewer is not assigned to approve notes for language:/i.test(normalized)) {
    return { i18nKey: "errors.reviewerNotAssigned" };
  }
  if (/Review disposition assignee is not assignable:/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionAssigneeInvalid" };
  }
  if (/Review disposition due date must be parseable/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionDueAtInvalid" };
  }
  if (/A configured model is required to generate drafts/i.test(normalized)) {
    return { i18nKey: "errors.modelRequired" };
  }
  if (/Invalid language body/i.test(normalized)) {
    return { i18nKey: "errors.invalidLanguageBody" };
  }
  if (/Invalid language patch body/i.test(normalized)) {
    return { i18nKey: "errors.invalidLanguagePatchBody" };
  }
  if (/Language could not be created/i.test(normalized)) {
    return { i18nKey: "errors.languageCreateFailed" };
  }
  if (/Language could not be updated/i.test(normalized)) {
    return { i18nKey: "errors.languageUpdateFailed" };
  }
  if (/Invalid exercise authoring body/i.test(normalized)) {
    return { i18nKey: "errors.invalidExerciseAuthoringBody" };
  }
  if (
    /Exercise references unknown (?:rule|vocabulary form):/i.test(normalized)
    || /Exercise (?:allowed rule|allowed vocabulary|expected answer|adversarial answer|prompt|grading explanation)/i.test(normalized)
    || /Exercise authoring (?:language not found|requires at least two adversarial probes)/i.test(normalized)
    || /Exercise adversarial answer duplicates an expected answer:/i.test(normalized)
    || /Translate-to-target expected answer is not present in corpus:/i.test(normalized)
    || /Choose-particle expected answer is not allowed vocabulary:/i.test(normalized)
  ) {
    return { i18nKey: "errors.exerciseAuthoringValidationFailed" };
  }
  if (/Invalid exercise submission body/i.test(normalized)) {
    return { i18nKey: "errors.invalidExerciseSubmissionBody" };
  }
  if (
    /Exercise generation failed/i.test(normalized)
    || /did not return valid JSON for exercise generation/i.test(normalized)
    || /did not match the expected exercise shape/i.test(normalized)
    || /only reasoning_content for exercise generation/i.test(normalized)
    || /no draft exercise was created/i.test(normalized)
  ) {
    return { i18nKey: "errors.exerciseGenerationFailed" };
  }
  if (/Invalid corpus import body/i.test(normalized)) {
    return { i18nKey: "errors.invalidCorpusImportBody" };
  }
  if (/Corpus passage could not be imported/i.test(normalized)) {
    return { i18nKey: "errors.corpusImportFailed" };
  }
  if (/Corpus (passage already exists|segmentation|topic tag|morpheme|target text|import language not found)/i.test(normalized)) {
    return { i18nKey: "errors.corpusImportValidationFailed" };
  }
  if (/Invalid source body/i.test(normalized)) {
    return { i18nKey: "errors.invalidSourceBody" };
  }
  if (/Source could not be registered/i.test(normalized)) {
    return { i18nKey: "errors.sourceRegisterFailed" };
  }
  if (/Invalid Obsidian vault import body/i.test(normalized)) {
    return { i18nKey: "errors.invalidObsidianVaultImportBody" };
  }
  if (/Upload requires a multipart file field/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadRequiresFile" };
  }
  if (/Uploaded file is empty/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadEmpty" };
  }
  if (/Upload title field is too large/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadTitleTooLarge" };
  }
  if (/Upload title field is invalid/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadTitleInvalid" };
  }
  if (/Source could not be stored/i.test(normalized)) {
    return { i18nKey: "errors.sourceStoreFailed" };
  }
  if (/^Source not found:/i.test(normalized)) {
    return { i18nKey: "errors.sourceNotFound" };
  }
  if (/Source could not be processed/i.test(normalized)) {
    return { i18nKey: "errors.sourceProcessFailed" };
  }
  if (/Extraction draft not found:/i.test(normalized)) {
    return { i18nKey: "errors.extractionDraftNotFound" };
  }
  if (/Extraction draft could not be accepted/i.test(normalized)) {
    return { i18nKey: "errors.extractionDraftAcceptFailed" };
  }
  if (/Extraction draft could not be rejected/i.test(normalized)) {
    return { i18nKey: "errors.extractionDraftRejectFailed" };
  }
  {
    const alreadyMatch = normalized.match(/^Extraction draft is already (\w+)\.?$/i);
    if (alreadyMatch?.[1]) {
      const status = alreadyMatch[1].toLowerCase();
      if (status === "accepted") {
        return { i18nKey: "errors.extractionDraftAlreadyAccepted" };
      }
      if (status === "rejected") {
        return { i18nKey: "errors.extractionDraftAlreadyRejected" };
      }
      if (status === "proposed") {
        return { i18nKey: "errors.extractionDraftAlreadyProposed" };
      }
      return {
        i18nKey: "errors.extractionDraftAlreadyStatus",
        i18nParams: { status }
      };
    }
  }
  if (/Exercise not found:/i.test(normalized)) {
    return { i18nKey: "errors.exerciseNotFound" };
  }
  if (/Exercise could not be created/i.test(normalized)) {
    return { i18nKey: "errors.exerciseCreateFailed" };
  }
  if (/Exercise submission could not be created/i.test(normalized)) {
    return { i18nKey: "errors.exerciseSubmissionCreateFailed" };
  }
  if (/Body must include action: "accept" or "reject"/i.test(normalized)) {
    return { i18nKey: "errors.bulkReviewInvalidAction" };
  }
  if (/Body must include draftIds:/i.test(normalized)) {
    return { i18nKey: "errors.bulkReviewInvalidDraftIds" };
  }
  if (/Too many draftIds:/i.test(normalized)) {
    const maxMatch = normalized.match(/at most (\d+)/i);
    return {
      i18nKey: "errors.bulkReviewTooManyDraftIds",
      ...(maxMatch?.[1] ? { i18nParams: { max: Number(maxMatch[1]) } } : {})
    };
  }
  if (/Missing languageId/i.test(normalized)) {
    return { i18nKey: "errors.missingLanguageId" };
  }
  if (/^Language not found:/i.test(normalized)) {
    return { i18nKey: "errors.languageNotFound" };
  }
  if (/^Elder correction not found:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionNotFound" };
  }
  if (/Elder correction is no longer pending review:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionNotPending" };
  }
  if (/Elder correction must be accepted before apply:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionMustBeAccepted" };
  }
  if (/Elder correction is not linked to a note:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionNotLinkedToNote" };
  }
  if (/^Note not found for correction:/i.test(normalized)) {
    return { i18nKey: "elderWs.errNoteNotFoundForCorrection" };
  }
  if (/^Note not found for language:/i.test(normalized)) {
    return { i18nKey: "elderWs.errNoteNotFoundForLanguage" };
  }
  if (/^Passage not found for language:/i.test(normalized)) {
    return { i18nKey: "elderWs.errPassageNotFoundForLanguage" };
  }
  if (/Invalid elder correction apply body/i.test(normalized)) {
    return { i18nKey: "elderWs.errInvalidApplyBody" };
  }
  if (/Invalid elder correction review body/i.test(normalized)) {
    return { i18nKey: "elderWs.errInvalidReviewBody" };
  }
  if (/Invalid elder correction body/i.test(normalized)) {
    return { i18nKey: "elderWs.errInvalidCorrectionBody" };
  }
  if (/Payload too large/i.test(normalized)) {
    return { i18nKey: "errors.payloadTooLarge" };
  }
  if (/^Review disposition not found:/i.test(normalized)) {
    return { i18nKey: "governance.errDispositionNotFound" };
  }
  if (/Review disposition is already resolved/i.test(normalized)) {
    return { i18nKey: "governance.errDispositionAlreadyResolved" };
  }

  return undefined;
}

/** Localizes Obsidian vault import failures for operator-facing UI. */
export function localizeVaultImportError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (error instanceof ApiError) {
    if (error.i18nKey) {
      return t(error.i18nKey as MessageKey, error.i18nParams);
    }
    const vaultI18n = vaultImportErrorI18n(error.message);
    if (vaultI18n) return t(vaultI18n.i18nKey);
    return localizeApiError(error, t, fallback);
  }

  if (error instanceof Error) {
    const vaultI18n = vaultImportErrorI18n(error.message);
    if (vaultI18n) return t(vaultI18n.i18nKey);
    return error.message;
  }

  return t(fallback);
}

function rateLimitSecondsFromApiError(error: ApiError): number | undefined {
  const raw = error.i18nParams?.seconds;
  const fromParams = typeof raw === "number"
    ? raw
    : typeof raw === "string"
      ? Number.parseInt(raw, 10)
      : undefined;
  if (fromParams !== undefined && Number.isFinite(fromParams) && fromParams > 0) {
    return fromParams;
  }
  return retryAfterSecondsFromMessage(error.message);
}

/** Localizes API and persisted processing errors for operator-facing UI. */
export function localizeApiError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return t("app.sessionExpired");
    }
    // Handle 429/413 before generic i18nKey lookup so a missing `{seconds}`
    // param never renders the raw placeholder from app.rateLimitExceeded.
    if (error.i18nKey === "app.rateLimitExceeded" || error.status === 429) {
      const seconds = rateLimitSecondsFromApiError(error);
      return seconds
        ? t("app.rateLimitExceeded", { ...(error.i18nParams ?? {}), seconds })
        : t("app.rateLimitExceededGeneric");
    }
    if (error.i18nKey === "errors.payloadTooLarge" || error.status === 413) {
      return t("errors.payloadTooLarge");
    }
    if (error.i18nKey) {
      return t(error.i18nKey as MessageKey, error.i18nParams);
    }
    if (error.status === 403) {
      const forbiddenI18n = operatorApiErrorI18n(error.message);
      if (forbiddenI18n) {
        return t(forbiddenI18n.i18nKey, forbiddenI18n.i18nParams);
      }
      return t("app.forbidden");
    }
    if (error.status === 503 && /offline/i.test(error.message)) {
      return t("app.providerOffline");
    }
    const sourceI18n = sourceProcessingErrorI18n(error.message);
    if (sourceI18n) {
      return t(sourceI18n.i18nKey as MessageKey, sourceI18n.i18nParams);
    }
    const operatorI18n = operatorApiErrorI18n(error.message);
    if (operatorI18n) {
      return t(operatorI18n.i18nKey, operatorI18n.i18nParams);
    }
    return error.message;
  }

  if (error instanceof Error) {
    const sourceI18n = sourceProcessingErrorI18n(error.message);
    if (sourceI18n) {
      return t(sourceI18n.i18nKey as MessageKey, sourceI18n.i18nParams);
    }
    const operatorI18n = operatorApiErrorI18n(error.message);
    if (operatorI18n) {
      return t(operatorI18n.i18nKey, operatorI18n.i18nParams);
    }
    return error.message;
  }

  return t(fallback);
}

export function localizeSourceProcessingError(
  error: string | undefined,
  t: Translate,
  fallback: MessageKey,
  fallbackParams?: Record<string, string | number>
): string {
  if (!error?.trim()) return t(fallback, fallbackParams);
  const sourceI18n = sourceProcessingErrorI18n(error);
  if (sourceI18n) {
    return t(sourceI18n.i18nKey as MessageKey, sourceI18n.i18nParams);
  }
  return error;
}

/** Localizes known processing warnings; leaves unrecognized API warnings unchanged. */
export function localizeSourceProcessingWarning(warning: string, t: Translate): string {
  const mapped = sourceProcessingWarningI18n(warning);
  if (mapped) {
    return t(mapped.i18nKey as MessageKey, mapped.i18nParams);
  }
  return warning;
}

/** Localizes Obsidian vault import skip reasons for operator-facing UI. */
export function localizeVaultImportSkipReason(reason: string, t: Translate): string {
  const mapped = vaultImportSkipReasonI18n(reason);
  if (mapped) {
    return t(mapped.i18nKey as MessageKey, mapped.i18nParams);
  }
  return reason;
}

const LLM_PROVIDER_OPTION_KEYS = new Set<MessageKey>([
  "model.providerOption.deterministic",
  "model.providerOption.off",
  "model.providerOption.mock",
  "model.providerOption.openai-compatible",
  "model.providerOption.local",
  "model.providerOption.ollama",
  "model.providerOption.lm-studio",
  "model.providerOption.openai",
  "model.providerOption.remote"
]);

/** Localizes LLM provider option labels shown in Settings and readiness. */
export function formatLlmProvider(provider: string, t?: Translate): string {
  const key = `model.providerOption.${provider}` as MessageKey;
  if (t && LLM_PROVIDER_OPTION_KEYS.has(key)) {
    return t(key);
  }
  return provider;
}

function llmStatusWarningI18n(
  warning: string
): { i18nKey: MessageKey; i18nParams?: Record<string, string | number> } | undefined {
  if (warning === "No LLM provider configured; using deterministic fallback for safe local development.") {
    return { i18nKey: "model.warning.noProviderConfigured" };
  }
  if (warning === "Using deterministic fallback; no external LLM calls will be made.") {
    return { i18nKey: "model.warning.deterministicFallback" };
  }
  const timeoutMatch = /^ASSINI_LLM_TIMEOUT_MS must be a positive integer; using (\d+)\.$/.exec(warning);
  if (timeoutMatch) {
    return { i18nKey: "model.warning.invalidTimeout", i18nParams: { ms: timeoutMatch[1] } };
  }
  const unknownMatch = /^Unknown ASSINI_LLM_PROVIDER: (.+)$/.exec(warning);
  if (unknownMatch) {
    return { i18nKey: "model.warning.unknownProvider", i18nParams: { provider: unknownMatch[1] } };
  }
  return undefined;
}

/** Localizes known LLM status warnings; leaves unrecognized API warnings unchanged. */
export function localizeLlmStatusWarning(warning: string, t: Translate): string {
  const mapped = llmStatusWarningI18n(warning);
  if (mapped) {
    return t(mapped.i18nKey, mapped.i18nParams);
  }
  return warning;
}
