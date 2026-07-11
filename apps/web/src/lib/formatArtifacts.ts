import type { AiSession } from "@assini/api-contract";
import type { EvaluationArtifact, LanguageSnapshot, ObservabilityData } from "../api";
import type { MessageKey, Translate } from "../i18n";
import type { EvaluationTrendStatus } from "../evaluationTrends";
import { formatCount, formatMetric } from "./formatLabels";
import type { SnapshotDownload } from "./types";

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
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
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

export function formatIntegrityLabel(integrity: LanguageSnapshot["integrity"], t?: Translate): string {
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
    formatLocalizedCount(snapshot.notes.length, "format.count.noteOne", "format.count.noteMany", "note", undefined, t),
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
  ]
    .filter(Boolean)
    .join(", ");

  return {
    fileName: `assini-${safeLanguageId}-snapshot.json`,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(snapshot, null, 2))}`,
    summary: t ? t("governance.snapshotReadySummary", { summary }) : `Snapshot ready: ${summary}.`,
    exportedAt: snapshot.exportedAt
  };
}

export function buildEvaluationArtifactDownload(artifact: EvaluationArtifact, t?: Translate): SnapshotDownload {
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
    summary: t ? t("eval.artifactReadySummary", { summary }) : `Evaluation artifact ready: ${summary}.`,
    exportedAt: artifact.exportedAt
  };
}

export function latestAssistantMessage(session: AiSession, t?: Translate): string {
  const assistant = session.messages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  if (assistant?.content) return assistant.content;
  return t ? t("model.smokeTest.noAssistantMessage") : "Session created, but no assistant message was returned.";
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
  const match = summary.trim().match(/^(.+):\s*([\d.]+)%\s+average score across\s+(\d+)\s+categories\.?$/i);
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
