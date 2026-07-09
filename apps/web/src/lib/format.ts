import type { AiSession } from "@assini/db";
import { sourceProcessingErrorI18n, sourceProcessingWarningI18n } from "@assini/api-contract";
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
    return t ? t("model.reachability.notConfigured") : "No external provider configured.";
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
  if (/Invalid review body/i.test(normalized)) {
    return { i18nKey: "errors.invalidReviewBody" };
  }
  if (/Review dispositions require reviewerComment/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionRequiresComment" };
  }
  if (/Note explanation edits require a substantive explanation/i.test(normalized)) {
    return { i18nKey: "errors.noteExplanationTooShort" };
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
  if (/Invalid exercise submission body/i.test(normalized)) {
    return { i18nKey: "errors.invalidExerciseSubmissionBody" };
  }
  if (/Invalid corpus import body/i.test(normalized)) {
    return { i18nKey: "errors.invalidCorpusImportBody" };
  }
  if (/Corpus passage could not be imported/i.test(normalized)) {
    return { i18nKey: "errors.corpusImportFailed" };
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

/** Localizes API and persisted processing errors for operator-facing UI. */
export function localizeApiError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return t("app.sessionExpired");
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
    if (error.status === 429) {
      const seconds = retryAfterSecondsFromMessage(error.message);
      return seconds
        ? t("app.rateLimitExceeded", { seconds })
        : t("app.rateLimitExceededGeneric");
    }
    if (error.status === 413) {
      return t("errors.payloadTooLarge");
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
