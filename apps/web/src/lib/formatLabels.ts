import type { LlmReachability, LlmStatus, PublicExerciseSubmission } from "../api";
import type { MessageKey, Translate } from "../i18n";

export function formatEvidenceLabel(count: number, t?: Translate): string {
  if (t) {
    return count === 1 ? t("reviewView.evidenceLinkOne", { count }) : t("reviewView.evidenceLinkMany", { count });
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

export function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatSubmissionStatus(submission: PublicExerciseSubmission, t?: Translate): string {
  if (t) {
    return submission.accepted ? t("learner.submissionAccepted") : t("learner.submissionNeedsReview");
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
  return submission.accepted ? "Submission accepted." : "Answer did not match the exercise answer key.";
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
    return t ? t("model.reachability.reachable", { mode: modeLabel }) : `Reachable (${modeLabel})`;
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
    value.length > ORTHOGRAPHY_META_MAX_CHARS ? `${value.slice(0, ORTHOGRAPHY_META_MAX_CHARS - 1)}…` : value;
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
  return t ? t("audit.entityPill", { entityType: typeLabel, entityId }) : `${typeLabel} / ${entityId}`;
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
export function localizeDraftGroundingMessage(flag: DraftGroundingFlagLike, t: Translate): string {
  const message = flag.message.trim();
  if (flag.kind === "gloss_conflict") {
    const match = message.match(/^Accepted lexeme "(.+)" is glossed "(.+)", but this draft glosses it "(.+)"\.$/);
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
