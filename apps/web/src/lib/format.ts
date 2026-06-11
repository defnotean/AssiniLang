import type { AiSession } from "@assini/db";
import type {
  EvaluationArtifact,
  ExtractionDraft,
  LanguageSnapshot,
  LlmReachability,
  LlmStatus,
  ObservabilityData,
  PublicExerciseSubmission
} from "../api";
import type { EvaluationTrendStatus } from "../evaluationTrends";
import type { SnapshotDownload } from "./types";

export function formatEvidenceLabel(count: number): string {
  return `${count} evidence ${count === 1 ? "link" : "links"}`;
}

export function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatSubmissionStatus(submission: PublicExerciseSubmission): string {
  return submission.accepted ? "Accepted" : "Needs review";
}

export function formatMode(mode: LlmStatus["mode"]): string {
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

export function formatReachability(result: LlmReachability): string {
  if (!result.checked) {
    return "No external provider configured.";
  }
  if (result.reachable) {
    const latency = typeof result.latencyMs === "number" ? `, ${result.latencyMs} ms` : "";
    return `Reachable (${result.mode.replace(/-/g, " ")}${latency})`;
  }
  const detail = result.detail ? `: ${result.detail}` : "";
  return `Unreachable${detail}`;
}

export function formatOrthographyMeta(value?: string): string {
  if (!value) return "Latin orthography";
  if (value.length > 34) return "Latin morphology hyphenation";
  return `${value} orthography`;
}

export function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

export function formatMetric(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
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

export function formatIntegrityLabel(integrity: LanguageSnapshot["integrity"]): string {
  return `integrity ${integrity.algorithm}:${integrity.contentHash.slice(0, 12)}`;
}

export function buildSnapshotDownload(snapshot: LanguageSnapshot): SnapshotDownload {
  const safeLanguageId = snapshot.language.id.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "language";
  const summary = [
    formatCount(snapshot.corpus.length, "corpus passage"),
    formatCount(snapshot.notes.length, "note"),
    formatCount(snapshot.exercises.length, "exercise"),
    formatCount(snapshot.linguisticProfile.stats.vocabularyItems, "vocabulary item"),
    formatCount(snapshot.linguisticProfile.stats.grammarRules, "grammar rule"),
    formatCount(snapshot.linguisticProfile.stats.sourceAssets, "source asset"),
    formatIntegrityLabel(snapshot.integrity)
  ].join(", ");

  return {
    fileName: `assini-${safeLanguageId}-snapshot.json`,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(snapshot, null, 2))}`,
    summary: `Snapshot ready: ${summary}.`,
    exportedAt: snapshot.exportedAt
  };
}

export function buildEvaluationArtifactDownload(artifact: EvaluationArtifact): SnapshotDownload {
  const summary = [
    formatCount(artifact.summary.latestRuns, "latest run"),
    formatCount(artifact.summary.failedLatestRuns, "failed latest run"),
    formatCount(artifact.summary.regressedLatestRuns, "regressed latest run"),
    formatCount(artifact.summary.failureCount, "failure line"),
    `${Math.round(artifact.summary.averageLatestScore * 100)}% average latest score`,
    formatIntegrityLabel(artifact.integrity)
  ].join(", ");

  return {
    fileName: "assini-evaluation-artifact.json",
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(artifact, null, 2))}`,
    summary: `Evaluation artifact ready: ${summary}.`,
    exportedAt: artifact.exportedAt
  };
}

export function latestAssistantMessage(session: AiSession): string {
  const assistant = session.messages.slice().reverse().find((message) => message.role === "assistant");
  return assistant?.content ?? "Session created, but no assistant message was returned.";
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

export function formatTrendPoints(delta: number | null): string {
  if (delta === null) return "0 pts";
  return `${Math.round(Math.abs(delta) * 100)} pts`;
}

export function formatSignedTrendPoints(delta: number | null): string {
  if (delta === null) return "new";
  const points = Math.round(delta * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
}

export function trendVerb(status: EvaluationTrendStatus): string {
  if (status === "improved") return "improved";
  if (status === "regressed") return "regressed";
  return "held steady";
}

export function extractionDraftSummary(draft: ExtractionDraft): string {
  if (draft.kind === "lexeme") {
    return `${draft.payload.form ?? "(no form)"} — ${draft.payload.gloss ?? "(no gloss)"}`;
  }
  if (draft.kind === "corpus_passage") {
    return `${draft.payload.textTarget ?? "(no target text)"} — ${draft.payload.textTranslation ?? "(no translation)"}`;
  }
  return `${draft.payload.topic ?? "(no topic)"} — ${draft.payload.explanation ?? "(no explanation)"}`;
}
