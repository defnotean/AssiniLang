import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AiSession, AuditEvent, ElderCorrection, GovernanceRecord, Note, ReviewDisposition, ReviewPolicy, User } from "@assini/db";
import type {
  DashboardData,
  ElderContext,
  ElderCorrectionPayload,
  EvaluationArtifact,
  ExerciseAuthoringPayload,
  ExtractionDraft,
  ExtractionDraftDuplicate,
  ExtractionDraftView,
  CorpusImportPayload,
  GovernancePayload,
  LanguageCreatePayload,
  LanguageProfile,
  LanguageSnapshot,
  LlmReachability,
  LlmStatus,
  ObservabilityData,
  PublicExerciseSubmission,
  ElderCorrectionReviewStatus,
  ReviewPolicyPayload,
  SourceAsset,
  SourceRegistrationPayload
} from "./api";
import {
  acceptExtractionDraft,
  applyElderCorrection,
  checkLlmReachability,
  createAiSession,
  createExercise,
  createGovernanceRecord,
  createLanguage,
  fetchAuditEvents,
  fetchCurrentUser,
  fetchDashboardData,
  fetchElderContext,
  fetchEvaluationArtifact,
  fetchExerciseSubmissions,
  fetchExtractionDrafts,
  fetchGovernance,
  fetchLanguageProfile,
  fetchLanguageSnapshot,
  fetchLlmStatus,
  fetchObservability,
  fetchReviewDispositions,
  fetchReviewPolicy,
  fetchSources,
  generateDraftNotes,
  importCorpusPassage,
  processSource,
  registerSource,
  rejectExtractionDraft,
  resolveReviewDisposition,
  reviewElderCorrection,
  reviewNote,
  runEvaluation,
  submitElderCorrection,
  submitExerciseAnswer,
  updateReviewPolicy,
  uploadSourceFile
} from "./api";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  CORPUS_CONSENT_USE_VALUES,
  EMPTY_CORPUS_IMPORT_DRAFT,
  type CorpusImportDraft
} from "./corpusImport";
import "./styles.css";

type ViewMode = "profile" | "ingest" | "corpus" | "review" | "learner" | "eval" | "governance" | "model";
type ReviewStatus = Extract<Note["status"], "approved" | "contested" | "rejected" | "deferred" | "escalated">;
type ReviewFilter = "all" | "pending" | "contested" | "rejected" | "deferred" | "escalated" | "approved";
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

type DashboardLoadState = Exclude<AsyncState<DashboardData>, { status: "idle" }>;
type Language = DashboardData["languages"][number];
type CorpusPassage = DashboardData["corpus"][number];
type EvaluationRun = DashboardData["evaluations"][number];
type PublicExercise = DashboardData["exercises"][number];
type EvaluationTrendStatus = "improved" | "regressed" | "stable" | "single-run";
type EvaluationTrend = {
  languageId: string;
  latestRunId: string;
  previousRunId: string | null;
  latestAverageScore: number;
  previousAverageScore: number | null;
  averageDelta: number | null;
  status: EvaluationTrendStatus;
  categoryDeltas: Record<string, {
    latestScore: number;
    previousScore: number | null;
    delta: number | null;
  }>;
};
type Theme = "light" | "dark";
type ThemeReader = Pick<Storage, "getItem">;
type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
type SnapshotDownload = {
  fileName: string;
  href: string;
  summary: string;
  exportedAt: string;
};

const VIEW_CONFIG: Record<ViewMode, { label: string; title: string; eyebrow: string }> = {
  profile: { label: "Language Profile", title: "Language Profile", eyebrow: "Linguistic profile" },
  ingest: { label: "Sources & intake", title: "Sources & Intake", eyebrow: "Source ingestion" },
  corpus: { label: "Corpus Browser", title: "Corpus Browser", eyebrow: "Source library" },
  review: { label: "Note Review Queue", title: "Note Review Queue", eyebrow: "Human review" },
  learner: { label: "Learning Lab", title: "Learner Exercise Preview", eyebrow: "Practice" },
  eval: { label: "Evaluation Dashboard", title: "Evaluation Dashboard", eyebrow: "Quality gates" },
  governance: { label: "Governance", title: "Governance & Policy", eyebrow: "Policy" },
  model: { label: "Model Setup", title: "Model Setup", eyebrow: "Local LLM readiness" }
};

const VIEW_ORDER: ViewMode[] = ["profile", "ingest", "corpus", "review", "learner", "eval", "governance", "model"];

const LANGUAGE_TYPOLOGY_OPTIONS: Language["typology"][] = [
  "unknown",
  "agglutinative",
  "isolating",
  "fusional",
  "polysynthetic-lite",
  "polysynthetic",
  "analytic",
  "mixed"
];

const EXTRACTION_DRAFT_KIND_LABELS: Record<ExtractionDraft["kind"], string> = {
  lexeme: "Lexeme",
  corpus_passage: "Corpus passage",
  grammar_note: "Grammar note"
};
const EXTRACTION_DRAFT_DUPLICATE_LABELS: Record<ExtractionDraftDuplicate["kind"], string> = {
  exact: "Duplicate of existing entry",
  form: "Same form, different gloss",
  topic: "Duplicate topic",
  pending: "Duplicates another pending draft"
};
const REVIEWER_COMMENTS: Record<ReviewStatus, string> = {
  approved: "Approved in local prototype.",
  contested: "Contested in local prototype.",
  rejected: "Rejected in local prototype.",
  deferred: "Deferred in local prototype.",
  escalated: "Escalated in local prototype."
};

const POLICY_TYPE_LABELS: Record<GovernanceRecord["policyType"], string> = {
  consent: "Consent",
  access: "Access",
  generation: "Generation"
};

const REVIEW_DISPOSITION_LABELS: Record<ReviewDisposition["disposition"], string> = {
  contested: "Contested",
  rejected: "Rejected",
  deferred: "Deferred",
  escalated: "Escalated"
};

const EXERCISE_TYPE_LABELS: Record<PublicExercise["type"], string> = {
  translate_to_target: "Translate to target",
  translate_to_english: "Translate to English",
  segment: "Segmentation",
  choose_particle: "Choose particle"
};

function getBrowserThemeStorage(): ThemeStorage | undefined {
  if (import.meta.env.MODE === "test") return undefined;
  if (typeof document === "undefined") return undefined;
  return document.defaultView?.localStorage;
}

export function getInitialTheme(storage: ThemeReader | undefined = getBrowserThemeStorage()): Theme {
  try {
    const stored = storage?.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Ignore localStorage failures in test runners or locked-down browsers.
  }
  return "dark";
}

function formatEvidenceLabel(count: number): string {
  return `${count} evidence ${count === 1 ? "link" : "links"}`;
}

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSubmissionStatus(submission: PublicExerciseSubmission): string {
  return submission.accepted ? "Accepted" : "Needs review";
}

function formatMode(mode: LlmStatus["mode"]): string {
  return mode.replace(/-/g, " ");
}

/**
 * A real model reply only comes from a configured provider whose mode is a
 * genuine backend. Deterministic and invalid modes return canned offline text,
 * so the smoke-test result must be flagged as a placeholder rather than a model
 * answer.
 */
function isRealModelProvider(status: LlmStatus): boolean {
  if (!status.configured) return false;
  return status.mode === "local-openai-compatible" || status.mode === "remote-api";
}

function formatReachability(result: LlmReachability): string {
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

function formatOrthographyMeta(value?: string): string {
  if (!value) return "Latin orthography";
  if (value.length > 34) return "Latin morphology hyphenation";
  return `${value} orthography`;
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function formatMetric(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseReviewerIds(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function parseAuthoringList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeDomId(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-");
}

function formatIntegrityLabel(integrity: LanguageSnapshot["integrity"]): string {
  return `integrity ${integrity.algorithm}:${integrity.contentHash.slice(0, 12)}`;
}

function buildSnapshotDownload(snapshot: LanguageSnapshot): SnapshotDownload {
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

function buildEvaluationArtifactDownload(artifact: EvaluationArtifact): SnapshotDownload {
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

function latestAssistantMessage(session: AiSession): string {
  const assistant = session.messages.slice().reverse().find((message) => message.role === "assistant");
  return assistant?.content ?? "Session created, but no assistant message was returned.";
}

/**
 * Detects whether an AI session was answered by the deterministic offline
 * fallback rather than a real provider, by inspecting the trace warnings the
 * session exposes (e.g. "deterministic"/"offline" fallback notices).
 */
function sessionUsedDeterministicFallback(session: AiSession): boolean {
  const trace = session.trace ?? [];
  return trace.some((step) =>
    (step.warnings ?? []).some((warning) => {
      const text = warning.toLowerCase();
      return text.includes("deterministic") || text.includes("offline fallback");
    })
  );
}

function countFailedSessions(observability: ObservabilityData): number {
  return observability.sessions.filter((session) => session.status === "failed").length;
}

function averageScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

function roundedScore(value: number): number {
  return Number(value.toFixed(4));
}

function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 0.96) return "success";
  if (score >= 0.84) return "warning";
  return "danger";
}

function latestRunsByLanguage(runs: EvaluationRun[]): Record<string, EvaluationRun> {
  return runs.reduce<Record<string, EvaluationRun>>((latest, run) => {
    const current = latest[run.languageId];
    if (!current || new Date(run.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latest[run.languageId] = run;
    }
    return latest;
  }, {});
}

function evaluationTrendsForRuns(runs: EvaluationRun[]): EvaluationTrend[] {
  const grouped = runs.reduce<Record<string, EvaluationRun[]>>((byLanguage, run) => {
    byLanguage[run.languageId] = [...(byLanguage[run.languageId] ?? []), run];
    return byLanguage;
  }, {});

  return Object.entries(grouped)
    .map(([languageId, languageRuns]): EvaluationTrend | undefined => {
      const sorted = languageRuns.slice().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
      const latest = sorted[sorted.length - 1];
      if (!latest) return undefined;

      const previous = sorted[sorted.length - 2];
      const latestAverageScore = roundedScore(averageScore(latest.scores));
      const previousAverageScore = previous ? roundedScore(averageScore(previous.scores)) : null;
      const averageDelta = previousAverageScore === null ? null : roundedScore(latestAverageScore - previousAverageScore);
      const categories = new Set([...Object.keys(latest.scores), ...Object.keys(previous?.scores ?? {})]);
      const categoryDeltas = [...categories].sort().reduce<EvaluationTrend["categoryDeltas"]>((deltas, category) => {
        const latestScore = roundedScore(latest.scores[category] ?? 0);
        const previousScore = previous?.scores[category] === undefined ? null : roundedScore(previous.scores[category]);
        deltas[category] = {
          latestScore,
          previousScore,
          delta: previousScore === null ? null : roundedScore(latestScore - previousScore)
        };
        return deltas;
      }, {});

      let status: EvaluationTrendStatus = "single-run";
      if (averageDelta !== null) {
        if (averageDelta < 0) status = "regressed";
        if (averageDelta > 0) status = "improved";
        if (averageDelta === 0) status = "stable";
      }

      return {
        languageId,
        latestRunId: latest.id,
        previousRunId: previous ? previous.id : null,
        latestAverageScore,
        previousAverageScore,
        averageDelta,
        status,
        categoryDeltas
      };
    })
    .filter((trend): trend is EvaluationTrend => trend !== undefined)
    .sort((left, right) => left.languageId.localeCompare(right.languageId));
}

function formatTrendPoints(delta: number | null): string {
  if (delta === null) return "0 pts";
  return `${Math.round(Math.abs(delta) * 100)} pts`;
}

function formatSignedTrendPoints(delta: number | null): string {
  if (delta === null) return "new";
  const points = Math.round(delta * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
}

function trendVerb(status: EvaluationTrendStatus): string {
  if (status === "improved") return "improved";
  if (status === "regressed") return "regressed";
  return "held steady";
}

function StatusScreen({ kind, message }: { kind: "loading" | "error"; message: string }) {
  if (kind === "loading") {
    return (
      <div className="full-page-status" role="status" aria-live="polite">
        {message}
      </div>
    );
  }

  return (
    <div className="full-page-status error" role="alert">
      {message}
    </div>
  );
}

function CompassMark() {
  return (
    <svg className="compass-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="17" className="compass-ring" />
      <circle cx="20" cy="20" r="7" className="compass-ring inner" />
      <path d="M20 2v36M2 20h36M7.8 7.8l24.4 24.4M32.2 7.8 7.8 32.2" className="compass-line" />
      <circle cx="20" cy="2.7" r="2.5" className="compass-dot main" />
      <circle cx="37.3" cy="20" r="2.5" className="compass-dot main" />
      <circle cx="20" cy="37.3" r="2.5" className="compass-dot main" />
      <circle cx="2.7" cy="20" r="2.5" className="compass-dot main" />
      <circle cx="32.2" cy="7.8" r="1.8" className="compass-dot" />
      <circle cx="32.2" cy="32.2" r="1.8" className="compass-dot" />
      <circle cx="7.8" cy="32.2" r="1.8" className="compass-dot" />
      <circle cx="7.8" cy="7.8" r="1.8" className="compass-dot" />
      <circle cx="20" cy="20" r="3.2" className="compass-dot main" />
    </svg>
  );
}

function TypologyMark({ typology }: { typology: Language["typology"] }) {
  if (typology === "agglutinative") {
    return (
      <svg className="typology-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="22" height="4.8" rx="1.5" />
        <rect x="3" y="12" width="16" height="4.8" rx="1.5" opacity="0.64" />
        <rect x="3" y="19" width="10" height="4.8" rx="1.5" opacity="0.38" />
      </svg>
    );
  }

  if (typology === "isolating") {
    return (
      <svg className="typology-mark" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="5.5" cy="14" r="3.8" />
        <circle cx="14" cy="14" r="3.8" />
        <circle cx="22.5" cy="14" r="3.8" />
      </svg>
    );
  }

  if (typology === "fusional") {
    return (
      <svg className="typology-mark outline" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="10" cy="14" r="7.4" />
        <circle cx="18" cy="14" r="7.4" />
      </svg>
    );
  }

  return (
    <svg className="typology-mark outline" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <polygon points="14,3 25,14 14,25 3,14" />
      <circle cx="14" cy="3" r="2.2" className="filled" />
      <circle cx="25" cy="14" r="2.2" className="filled" />
      <circle cx="14" cy="25" r="2.2" className="filled" />
      <circle cx="3" cy="14" r="2.2" className="filled" />
    </svg>
  );
}

function ViewGlyph({ view }: { view: ViewMode }) {
  return <span className={`view-glyph ${view}`} aria-hidden="true" />;
}

function DiamondBand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "diamond-band compact" : "diamond-band"} aria-hidden="true" />;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status}`}>{formatStatus(status)}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: Note["confidence"] }) {
  return <span className={`confidence-badge ${confidence}`}>{confidence} confidence</span>;
}

function MorphChips({ morphemes }: { morphemes: CorpusPassage["morphologicalSegmentation"] }) {
  return (
    <div className="morph-chips">
      {morphemes.map((morpheme, index) => (
        <span className="morph-chip" key={`${morpheme.surface}-${morpheme.gloss}-${index}`}>
          <strong>{morpheme.surface}</strong>
          <span>{morpheme.gloss}</span>
        </span>
      ))}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const percent = Math.round(score * 100);
  const circumference = 157.08;
  return (
    <svg className={`score-ring ${scoreTone(score)}`} viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r="25" className="score-track" />
      <circle
        cx="30"
        cy="30"
        r="25"
        className="score-fill"
        strokeDasharray={`${score * circumference} ${circumference}`}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="35" textAnchor="middle">
        {percent}%
      </text>
    </svg>
  );
}

function ScoreBar({ metric, score }: { metric: string; score: number }) {
  const percent = Math.round(score * 100);
  return (
    <div className={`score-row ${scoreTone(score)}`}>
      <span className="metric-label">{formatMetric(metric)}</span>
      <div
        className="progress-bg"
        role="progressbar"
        aria-label={formatMetric(metric)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="metric-score">{percent}%</span>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<ViewMode>("corpus");
  const [selectedLanguageId, setSelectedLanguageId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<DashboardLoadState>({ status: "loading" });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [profileState, setProfileState] = useState<AsyncState<LanguageProfile>>({ status: "idle" });

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [exerciseAnswer, setExerciseAnswer] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [exerciseResult, setExerciseResult] = useState<string | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<PublicExerciseSubmission[]>([]);

  const [isElderMode, setIsElderMode] = useState(false);
  const [elderContext, setElderContext] = useState<ElderContext | null>(null);
  const [isLoadingElder, setIsLoadingElder] = useState(false);
  const [correctionSuccess, setCorrectionSuccess] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [formNoteId, setFormNoteId] = useState("");
  const [formPassageId, setFormPassageId] = useState("");
  const [formSeverity, setFormSeverity] = useState<ElderCorrection["severity"]>("minor");
  const [formCorrection, setFormCorrection] = useState("");
  const [formRationale, setFormRationale] = useState("");
  const [formContextText, setFormContextText] = useState("");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [reviewingCorrectionId, setReviewingCorrectionId] = useState<string | null>(null);
  const [applyingCorrectionId, setApplyingCorrectionId] = useState<string | null>(null);
  const [correctionApplyDrafts, setCorrectionApplyDrafts] = useState<Record<string, string>>({});

  const [governanceState, setGovernanceState] = useState<AsyncState<GovernanceRecord[]>>({ status: "idle" });
  const [policyType, setPolicyType] = useState<GovernanceRecord["policyType"]>("generation");
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState("");
  const [policyContent, setPolicyContent] = useState("");
  const [governanceSuccess, setGovernanceSuccess] = useState<string | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [isSubmittingGovernance, setIsSubmittingGovernance] = useState(false);
  const [auditEventState, setAuditEventState] = useState<AsyncState<AuditEvent[]>>({ status: "idle" });
  const [reviewPolicyState, setReviewPolicyState] = useState<AsyncState<ReviewPolicy>>({ status: "idle" });
  const [reviewPolicyReviewerIds, setReviewPolicyReviewerIds] = useState("");
  const [reviewPolicyApprovalThreshold, setReviewPolicyApprovalThreshold] = useState("1");
  const [reviewPolicyRequiresAssigned, setReviewPolicyRequiresAssigned] = useState(true);
  const [reviewPolicySuccess, setReviewPolicySuccess] = useState<string | null>(null);
  const [reviewPolicyError, setReviewPolicyError] = useState<string | null>(null);
  const [isSubmittingReviewPolicy, setIsSubmittingReviewPolicy] = useState(false);
  const [reviewDispositionState, setReviewDispositionState] = useState<AsyncState<ReviewDisposition[]>>({ status: "idle" });
  const [reviewDispositionDrafts, setReviewDispositionDrafts] = useState<Record<string, string>>({});
  const [reviewDispositionSuccess, setReviewDispositionSuccess] = useState<string | null>(null);
  const [reviewDispositionError, setReviewDispositionError] = useState<string | null>(null);
  const [resolvingReviewDispositionId, setResolvingReviewDispositionId] = useState<string | null>(null);
  const [snapshotDownload, setSnapshotDownload] = useState<SnapshotDownload | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);
  const [evaluationArtifactDownload, setEvaluationArtifactDownload] = useState<SnapshotDownload | null>(null);
  const [evaluationArtifactError, setEvaluationArtifactError] = useState<string | null>(null);
  const [isExportingEvaluationArtifact, setIsExportingEvaluationArtifact] = useState(false);

  const [llmState, setLlmState] = useState<AsyncState<LlmStatus>>({ status: "idle" });
  const [observabilityState, setObservabilityState] = useState<AsyncState<ObservabilityData>>({ status: "idle" });
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<string | null>(null);
  const [modelTestIsPlaceholder, setModelTestIsPlaceholder] = useState(false);
  const [isCheckingReachability, setIsCheckingReachability] = useState(false);
  const [reachabilityResult, setReachabilityResult] = useState<LlmReachability | null>(null);
  const [reachabilityError, setReachabilityError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      getBrowserThemeStorage()?.setItem("theme", theme);
    } catch {
      // Ignore localStorage failures in test runners or locked-down browsers.
    }
  }, [theme]);

  useEffect(() => {
    let isCurrent = true;
    fetchCurrentUser()
      .then((user) => {
        if (isCurrent) setCurrentUser(user);
      })
      .catch(() => {
        if (isCurrent) setCurrentUser(null);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setLoadState({ status: "loading" });
    setExerciseResult(null);
    setExerciseAnswer("");
    setSelectedExerciseId(null);
    setSelectedNoteId(null);
    setSubmissionHistory([]);

    fetchDashboardData(selectedLanguageId ?? undefined)
      .then((data) => {
        if (isCurrent) setLoadState({ status: "ready", data });
      })
      .catch((error: Error) => {
        if (isCurrent) setLoadState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "profile" || !selectedLanguageId) {
      setProfileState({ status: "idle" });
      return () => {
        isCurrent = false;
      };
    }

    setProfileState({ status: "loading" });
    fetchLanguageProfile(selectedLanguageId)
      .then((profile) => {
        if (isCurrent) setProfileState({ status: "ready", data: profile });
      })
      .catch((error: Error) => {
        if (isCurrent) setProfileState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId, view]);

  useEffect(() => {
    let isCurrent = true;
    if (!isElderMode || !selectedLanguageId) {
      setElderContext(null);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoadingElder(true);
    setCorrectionSuccess(null);
    setCorrectionError(null);

    fetchElderContext(selectedLanguageId)
      .then((context) => {
        if (isCurrent) setElderContext(context);
      })
      .catch(() => {
        if (isCurrent) setElderContext(null);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingElder(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedLanguageId, isElderMode]);

  useEffect(() => {
    setFormNoteId("");
    setFormPassageId("");
    setFormSeverity("minor");
    setFormCorrection("");
    setFormRationale("");
    setFormContextText("");
    setCorrectionApplyDrafts({});
    setCorrectionSuccess(null);
    setCorrectionError(null);
  }, [selectedLanguageId, isElderMode]);

  const data = loadState.status === "ready" ? loadState.data : null;
  const selectedLanguage = data?.languages.find((language) => language.id === selectedLanguageId) ?? null;
  const selectedNote = data?.notes.find((note) => note.id === selectedNoteId) ?? data?.notes[0] ?? null;
  const selectedExercise = data?.exercises.find((exercise) => exercise.id === selectedExerciseId) ?? data?.exercises[0] ?? null;
  const activeView = VIEW_CONFIG[view];
  const isWorkflowBusy = isEvaluating
    || isDrafting
    || reviewingNoteId !== null
    || isGrading
    || isSubmittingCorrection
    || reviewingCorrectionId !== null
    || applyingCorrectionId !== null
    || isSubmittingGovernance
    || isSubmittingReviewPolicy
    || resolvingReviewDispositionId !== null
    || isExportingSnapshot
    || isExportingEvaluationArtifact
    || isTestingModel;

  const overviewStats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Notes", value: data.notes.length.toString(), hint: "review queue" },
      { label: "Corpus", value: data.corpus.length.toString(), hint: "source records" },
      { label: "Exercises", value: data.exercises.length.toString(), hint: "learner tasks" },
      { label: "Evals", value: data.evaluations.length.toString(), hint: "quality runs" }
    ];
  }, [data]);

  useEffect(() => {
    let isCurrent = true;
    setExerciseAnswer("");
    setExerciseResult(null);

    if (view !== "learner" || !selectedExercise) {
      setSubmissionHistory([]);
      setIsLoadingSubmissions(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoadingSubmissions(true);
    fetchExerciseSubmissions(selectedExercise.id)
      .then((history) => {
        if (isCurrent) setSubmissionHistory(history);
      })
      .catch(() => {
        if (isCurrent) setSubmissionHistory([]);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingSubmissions(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedExercise?.id, view]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "model") return () => {
      isCurrent = false;
    };

    setLlmState({ status: "loading" });
    setObservabilityState({ status: "loading" });
    setModelTestResult(null);
    fetchLlmStatus()
      .then((status) => {
        if (isCurrent) setLlmState({ status: "ready", data: status });
      })
      .catch((error: Error) => {
        if (isCurrent) setLlmState({ status: "error", message: error.message });
      });
    fetchObservability()
      .then((observability) => {
        if (isCurrent) setObservabilityState({ status: "ready", data: observability });
      })
      .catch((error: Error) => {
        if (isCurrent) setObservabilityState({ status: "error", message: error.message });
      });

    return () => {
      isCurrent = false;
    };
  }, [view]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "governance" || !selectedLanguageId) {
      return () => {
        isCurrent = false;
      };
    }

    setGovernanceState({ status: "loading" });
    setAuditEventState({ status: "loading" });
    setReviewPolicyState({ status: "loading" });
    setReviewDispositionState({ status: "loading" });
    setGovernanceSuccess(null);
    setGovernanceError(null);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    fetchGovernance()
      .then((records) => {
        if (isCurrent) setGovernanceState({ status: "ready", data: records });
      })
      .catch((error: Error) => {
        if (isCurrent) setGovernanceState({ status: "error", message: error.message });
      });
    const reviewPolicyRequest = fetchReviewPolicy(selectedLanguageId)
      .then((policy) => {
        if (!isCurrent) return;
        setReviewPolicyState({ status: "ready", data: policy });
        setReviewPolicyReviewerIds(policy.assignedReviewerIds.join(", "));
        setReviewPolicyApprovalThreshold(policy.approvalThreshold.toString());
        setReviewPolicyRequiresAssigned(policy.requiresAssignedReviewer);
      })
      .catch((error: Error) => {
        if (isCurrent) setReviewPolicyState({ status: "error", message: error.message });
      });
    const reviewDispositionRequest = fetchReviewDispositions(selectedLanguageId)
      .then((dispositions) => {
        if (isCurrent) setReviewDispositionState({ status: "ready", data: dispositions });
      })
      .catch((error: Error) => {
        if (isCurrent) setReviewDispositionState({ status: "error", message: error.message });
      });
    Promise.allSettled([reviewPolicyRequest, reviewDispositionRequest])
      .then(() => {
        if (!isCurrent) return undefined;
        return fetchAuditEvents(selectedLanguageId)
          .then((events) => {
            if (isCurrent) setAuditEventState({ status: "ready", data: events });
          })
          .catch((error: Error) => {
            if (isCurrent) setAuditEventState({ status: "error", message: error.message });
          });
      });

    return () => {
      isCurrent = false;
    };
  }, [view, selectedLanguageId]);

  useEffect(() => {
    setPolicyType("generation");
    setPolicyEffectiveDate("");
    setPolicyContent("");
    setGovernanceSuccess(null);
    setGovernanceError(null);
    setAuditEventState({ status: "idle" });
    setReviewPolicyState({ status: "idle" });
    setReviewPolicyReviewerIds("");
    setReviewPolicyApprovalThreshold("1");
    setReviewPolicyRequiresAssigned(true);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);
    setReviewDispositionState({ status: "idle" });
    setReviewDispositionDrafts({});
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    setSnapshotDownload(null);
    setSnapshotError(null);
    setEvaluationArtifactDownload(null);
    setEvaluationArtifactError(null);
  }, [selectedLanguageId]);

  async function refreshDashboard() {
    const refreshed = await fetchDashboardData(selectedLanguageId ?? undefined);
    setLoadState({ status: "ready", data: refreshed });
  }

  async function refreshModelObservability() {
    setObservabilityState({ status: "loading" });
    try {
      setObservabilityState({ status: "ready", data: await fetchObservability() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model observability failed";
      setObservabilityState({ status: "error", message });
    }
  }

  function handleLanguageSelect(languageId: string) {
    setIsElderMode(false);
    setView("corpus");
    setSelectedLanguageId(languageId);
  }

  async function handleCreateLanguage(payload: LanguageCreatePayload) {
    const created = await createLanguage(payload);
    setIsElderMode(false);
    setView("corpus");
    setSelectedLanguageId(created.id);
  }

  function handleViewSelect(mode: ViewMode) {
    setIsElderMode(false);
    setView(mode);
  }

  async function handleRunEval() {
    setIsEvaluating(true);
    try {
      await runEvaluation();
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation run failed";
      setLoadState({ status: "error", message });
    } finally {
      setIsEvaluating(false);
    }
  }

  async function handleGenerateDrafts() {
    if (!selectedLanguageId) return;
    setIsDrafting(true);
    try {
      await generateDraftNotes(selectedLanguageId);
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Draft generation failed";
      setLoadState({ status: "error", message });
    } finally {
      setIsDrafting(false);
    }
  }

  async function handleReview(status: ReviewStatus) {
    if (!selectedNote) return;
    setReviewingNoteId(selectedNote.id);
    try {
      await reviewNote(selectedNote.id, {
        status,
        reviewerComment: REVIEWER_COMMENTS[status]
      });
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Note review failed";
      setLoadState({ status: "error", message });
    } finally {
      setReviewingNoteId(null);
    }
  }

  async function handleSaveNoteExplanation(explanation: string) {
    if (!selectedNote) return;
    setReviewingNoteId(selectedNote.id);
    try {
      await reviewNote(selectedNote.id, {
        explanation,
        reviewerComment: "Edited note explanation in local prototype."
      });
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Note explanation update failed";
      setLoadState({ status: "error", message });
      throw error;
    } finally {
      setReviewingNoteId(null);
    }
  }

  async function handleGrade() {
    const submittedAnswer = exerciseAnswer.trim();
    if (!selectedExercise || submittedAnswer.length === 0) return;

    setIsGrading(true);
    setExerciseResult(null);
    try {
      const submission = await submitExerciseAnswer(selectedExercise.id, submittedAnswer);
      setExerciseResult(submission.explanation);
      setSubmissionHistory(await fetchExerciseSubmissions(selectedExercise.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exercise submission failed";
      setExerciseResult(message);
    } finally {
      setIsGrading(false);
    }
  }

  async function handleCreateExercise(payload: ExerciseAuthoringPayload) {
    if (!selectedLanguageId) {
      throw new Error("Select or create a language first.");
    }
    const created = await createExercise(selectedLanguageId, payload);
    await refreshDashboard();
    setSelectedExerciseId(created.id);
    setExerciseAnswer("");
    setExerciseResult(null);
    setSubmissionHistory([]);
  }

  async function handleImportCorpusPassage(payload: CorpusImportPayload) {
    if (!selectedLanguageId) {
      throw new Error("Select or create a language first.");
    }
    await importCorpusPassage(selectedLanguageId, payload);
    await refreshDashboard();
  }

  async function handleSubmitCorrection(event: FormEvent) {
    event.preventDefault();
    if (!formCorrection.trim() || !formRationale.trim()) {
      setCorrectionError("Please describe both the correction and the rationale.");
      return;
    }

    if (!formNoteId && !formPassageId && !formContextText.trim()) {
      setCorrectionError("Linguistic Rule: You must bind the correction to at least one context indicator (choose a Note, choose a Passage, or provide a Custom Context snippet).");
      return;
    }

    if (!selectedLanguageId) {
      setCorrectionError("Select or create a language first.");
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionSuccess(null);
    setCorrectionError(null);

    const payload: ElderCorrectionPayload = {
      languageId: selectedLanguageId,
      noteId: formNoteId || undefined,
      passageId: formPassageId || undefined,
      correction: formCorrection.trim(),
      rationale: formRationale.trim(),
      severity: formSeverity,
      contextText: formContextText.trim() || undefined
    };

    try {
      await submitElderCorrection(payload);
      setCorrectionSuccess("Elder Correction submitted successfully!");
      setFormCorrection("");
      setFormRationale("");
      setFormContextText("");
      setFormNoteId("");
      setFormPassageId("");
      setElderContext(await fetchElderContext(selectedLanguageId));
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Elder correction submission failed";
      setCorrectionError(message);
    } finally {
      setIsSubmittingCorrection(false);
    }
  }

  async function handleReviewCorrection(correctionId: string, status: ElderCorrectionReviewStatus) {
    if (!selectedLanguageId) return;
    setReviewingCorrectionId(correctionId);
    setCorrectionSuccess(null);
    setCorrectionError(null);
    try {
      await reviewElderCorrection(correctionId, status);
      setCorrectionSuccess(status === "accepted" ? "Elder correction accepted." : "Elder correction rejected.");
      setElderContext(await fetchElderContext(selectedLanguageId));
      await refreshModelObservability();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Elder correction review failed";
      setCorrectionError(message);
    } finally {
      setReviewingCorrectionId(null);
    }
  }

  async function handleApplyCorrection(correctionId: string, explanation: string) {
    const revisedExplanation = explanation.trim();
    if (!revisedExplanation) {
      setCorrectionSuccess(null);
      setCorrectionError("Please provide a revised explanation before applying the correction.");
      return;
    }

    if (!selectedLanguageId) {
      setCorrectionSuccess(null);
      setCorrectionError("Select or create a language first.");
      return;
    }

    setApplyingCorrectionId(correctionId);
    setCorrectionSuccess(null);
    setCorrectionError(null);
    try {
      await applyElderCorrection(correctionId, revisedExplanation);
      setCorrectionSuccess("Elder correction applied to linked note.");
      setCorrectionApplyDrafts((current) => {
        const next = { ...current };
        delete next[correctionId];
        return next;
      });
      setElderContext(await fetchElderContext(selectedLanguageId));
      await refreshDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Elder correction apply failed";
      setCorrectionError(message);
    } finally {
      setApplyingCorrectionId(null);
    }
  }

  async function handleSubmitGovernance(event: FormEvent) {
    event.preventDefault();
    const content = policyContent.trim();
    const effectiveDate = policyEffectiveDate.trim();

    if (!content || !effectiveDate) {
      setGovernanceSuccess(null);
      setGovernanceError("Please provide policy content and an effective date.");
      return;
    }

    if (!selectedLanguageId) {
      setGovernanceSuccess(null);
      setGovernanceError("Select or create a language first.");
      return;
    }

    setIsSubmittingGovernance(true);
    setGovernanceSuccess(null);
    setGovernanceError(null);

    const payload: GovernancePayload = {
      languageId: selectedLanguageId,
      policyType,
      content,
      effectiveDate
    };

    try {
      await createGovernanceRecord(payload);
      setPolicyContent("");
      setGovernanceSuccess("Governance policy recorded.");
      setGovernanceState({ status: "ready", data: await fetchGovernance() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Governance policy creation failed";
      setGovernanceError(message);
    } finally {
      setIsSubmittingGovernance(false);
    }
  }

  async function handleSubmitReviewPolicy(event: FormEvent) {
    event.preventDefault();
    const assignedReviewerIds = parseReviewerIds(reviewPolicyReviewerIds);
    const approvalThreshold = Number.parseInt(reviewPolicyApprovalThreshold, 10);

    if (assignedReviewerIds.length === 0) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Please provide at least one assigned reviewer ID.");
      return;
    }

    if (!Number.isInteger(approvalThreshold) || approvalThreshold < 1) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Approval threshold must be a positive whole number.");
      return;
    }

    if (reviewPolicyRequiresAssigned && approvalThreshold > assignedReviewerIds.length) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Approval threshold cannot exceed assigned reviewers.");
      return;
    }

    if (!selectedLanguageId) {
      setReviewPolicySuccess(null);
      setReviewPolicyError("Select or create a language first.");
      return;
    }

    const payload: ReviewPolicyPayload = {
      assignedReviewerIds,
      approvalThreshold,
      requiresAssignedReviewer: reviewPolicyRequiresAssigned
    };

    setIsSubmittingReviewPolicy(true);
    setReviewPolicySuccess(null);
    setReviewPolicyError(null);

    try {
      const policy = await updateReviewPolicy(selectedLanguageId, payload);
      setReviewPolicyState({ status: "ready", data: policy });
      setReviewPolicyReviewerIds(policy.assignedReviewerIds.join(", "));
      setReviewPolicyApprovalThreshold(policy.approvalThreshold.toString());
      setReviewPolicyRequiresAssigned(policy.requiresAssignedReviewer);
      setReviewPolicySuccess("Review policy updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review policy update failed";
      setReviewPolicyError(message);
    } finally {
      setIsSubmittingReviewPolicy(false);
    }
  }

  async function handleResolveReviewDisposition(dispositionId: string) {
    const resolutionSummary = (reviewDispositionDrafts[dispositionId] ?? "").trim();
    if (resolutionSummary.length === 0) {
      setReviewDispositionSuccess(null);
      setReviewDispositionError("Resolution summary is required.");
      return;
    }

    if (!selectedLanguageId) {
      setReviewDispositionSuccess(null);
      setReviewDispositionError("Select or create a language first.");
      return;
    }

    setResolvingReviewDispositionId(dispositionId);
    setReviewDispositionSuccess(null);
    setReviewDispositionError(null);
    try {
      await resolveReviewDisposition(dispositionId, resolutionSummary);
      const [dispositions] = await Promise.all([
        fetchReviewDispositions(selectedLanguageId),
        refreshDashboard()
      ]);
      setReviewDispositionState({ status: "ready", data: dispositions });
      setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: "" }));
      setReviewDispositionSuccess("Review disposition resolved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Review disposition resolution failed";
      setReviewDispositionError(message);
    } finally {
      setResolvingReviewDispositionId(null);
    }
  }

  async function handleExportSnapshot() {
    if (!selectedLanguageId) {
      setSnapshotDownload(null);
      setSnapshotError("Select or create a language first.");
      return;
    }

    setIsExportingSnapshot(true);
    setSnapshotDownload(null);
    setSnapshotError(null);

    try {
      const snapshot = await fetchLanguageSnapshot(selectedLanguageId);
      setSnapshotDownload(buildSnapshotDownload(snapshot));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot export failed";
      setSnapshotError(message);
    } finally {
      setIsExportingSnapshot(false);
    }
  }

  async function handleExportEvaluationArtifact() {
    setIsExportingEvaluationArtifact(true);
    setEvaluationArtifactDownload(null);
    setEvaluationArtifactError(null);

    try {
      const artifact = await fetchEvaluationArtifact();
      setEvaluationArtifactDownload(buildEvaluationArtifactDownload(artifact));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation artifact export failed";
      setEvaluationArtifactError(message);
    } finally {
      setIsExportingEvaluationArtifact(false);
    }
  }

  async function handleModelSmokeTest() {
    if (!data) return;
    if (!selectedLanguageId) {
      setModelTestResult("Select or create a language first.");
      return;
    }
    setIsTestingModel(true);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const session = await createAiSession({
        languageId: selectedLanguageId,
        mode: "learner_practice",
        seedPrompt: "Create one concise, safe practice prompt using only the provided public workspace context.",
        contextNoteIds: data.notes.slice(0, 2).map((note) => note.id),
        contextPassageIds: data.corpus.slice(0, 2).map((passage) => passage.id)
      });
      setModelTestResult(latestAssistantMessage(session));
      const refreshedStatus = await fetchLlmStatus();
      setLlmState({ status: "ready", data: refreshedStatus });
      // The reply is a genuine model answer only when a real provider is
      // configured. Deterministic/invalid modes return a canned offline string,
      // and the session trace may flag the deterministic fallback as well.
      setModelTestIsPlaceholder(!isRealModelProvider(refreshedStatus) || sessionUsedDeterministicFallback(session));
      await refreshModelObservability();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model smoke test failed";
      setModelTestResult(message);
      setModelTestIsPlaceholder(false);
      await refreshModelObservability();
    } finally {
      setIsTestingModel(false);
    }
  }

  async function handleTestConnection() {
    setIsCheckingReachability(true);
    setReachabilityError(null);
    setReachabilityResult(null);
    try {
      setReachabilityResult(await checkLlmReachability());
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM reachability check failed";
      setReachabilityError(message);
    } finally {
      setIsCheckingReachability(false);
    }
  }

  if (loadState.status === "loading") {
    return <StatusScreen kind="loading" message="Loading workspace..." />;
  }

  if (loadState.status === "error") {
    return <StatusScreen kind="error" message={loadState.message} />;
  }

  if (!data) {
    return <StatusScreen kind="error" message="Workspace data is unavailable." />;
  }

  const currentTitle = isElderMode ? "Elder Workspace" : activeView.title;
  const currentEyebrow = isElderMode ? "Elder review" : activeView.eyebrow;
  const currentBreadcrumb = `${selectedLanguage?.name ?? "Language"} / ${isElderMode ? "Elder workspace" : activeView.label}`;
  const sectionCounts: Partial<Record<ViewMode, number>> = {
    corpus: data.corpus.length,
    review: data.notes.length,
    learner: data.exercises.length,
    eval: data.evaluations.length
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Atlas language sidebar">
        <div className="brand-card">
          <div className="brand-mark">
            <CompassMark />
          </div>
          <div className="brand-copy">
            <p className="brand-kicker">AssiniLang</p>
            <strong>Language preservation</strong>
            <span>Research console</span>
          </div>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        <DiamondBand />

        <div className="sidebar-section-label">Languages</div>
        <nav className="language-nav" aria-label="Languages">
          {data.languages.length === 0 && (
            <p className="empty-state">No languages yet. Use New language below to start a workspace.</p>
          )}
          {data.languages.map((language) => {
            const isActive = language.id === selectedLanguageId;
            return (
              <div className="language-nav-group" key={language.id}>
                <button
                  type="button"
                  className={`language-button${isActive ? " active" : ""}`}
                  aria-pressed={isActive}
                  disabled={isWorkflowBusy}
                  onClick={() => handleLanguageSelect(language.id)}
                >
                  <span className="typology-frame">
                    <TypologyMark typology={language.typology} />
                  </span>
                  <span className="language-copy">
                    <strong>{language.name}</strong>
                    <span>{language.typology}</span>
                  </span>
                </button>

                {isActive && (
                  <nav className="section-nav" aria-label={`${language.name} sections`}>
                    {VIEW_ORDER.map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        className={view === mode && !isElderMode ? "active" : ""}
                        aria-current={view === mode && !isElderMode ? "page" : undefined}
                        disabled={isWorkflowBusy}
                        onClick={() => handleViewSelect(mode)}
                      >
                        <ViewGlyph view={mode} />
                        <span>{VIEW_CONFIG[mode].label}</span>
                        {sectionCounts[mode] != null && <span className="section-count" aria-hidden="true">{sectionCounts[mode]}</span>}
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <CreateLanguageForm isWorkflowBusy={isWorkflowBusy} onCreate={handleCreateLanguage} />
          <div className="user-card">
            <span>Signed in</span>
            <strong>{currentUser?.name ?? "Local User"}</strong>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="prototype-notice">
          <strong>Local prototype</strong>
          <span>all data stays on this machine</span>
        </div>

        <section className="workspace-header" aria-label="Workspace overview">
          <div className="star-field" aria-hidden="true" />
          <div className="title-block">
            <p className="breadcrumb">{currentBreadcrumb}</p>
            <p className="eyebrow">{currentEyebrow}</p>
            <h1>{currentTitle}</h1>
            <div className="language-metadata" aria-label="Selected language metadata">
              <span>{selectedLanguage?.typology ?? "unknown"}</span>
              <span>{formatOrthographyMeta(selectedLanguage?.orthography)}</span>
              <span>{selectedLanguage?.status ?? "draft"} workspace</span>
            </div>
          </div>

          <div className="header-actions">
            <button type="button" className="secondary" onClick={() => setIsElderMode((current) => !current)}>
              {isElderMode ? "Back to dashboard" : "Elder workspace"}
            </button>
            {!isElderMode && view === "review" && (
              <button type="button" onClick={handleGenerateDrafts} disabled={isWorkflowBusy}>
                {isDrafting ? "Drafting..." : "Generate AI Drafts"}
              </button>
            )}
            {!isElderMode && view === "eval" && (
              <button type="button" onClick={handleRunEval} disabled={isWorkflowBusy}>
                {isEvaluating ? "Evaluating..." : "Run System Eval"}
              </button>
            )}
          </div>
        </section>

        <DiamondBand compact />

        <section className="stat-strip" aria-label="Current language overview">
          {overviewStats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <em>{stat.hint}</em>
            </div>
          ))}
        </section>

        <section className="view-container" aria-labelledby="current-view-title">
          <h2 id="current-view-title" className="visually-hidden">
            {currentTitle}
          </h2>

          {isElderMode ? (
            <ElderWorkspace
              data={data}
              elderContext={elderContext}
              isLoadingElder={isLoadingElder}
              formNoteId={formNoteId}
              formPassageId={formPassageId}
              formSeverity={formSeverity}
              formCorrection={formCorrection}
              formRationale={formRationale}
              formContextText={formContextText}
              correctionSuccess={correctionSuccess}
              correctionError={correctionError}
              isWorkflowBusy={isWorkflowBusy}
              isSubmittingCorrection={isSubmittingCorrection}
              reviewingCorrectionId={reviewingCorrectionId}
              applyingCorrectionId={applyingCorrectionId}
              correctionApplyDrafts={correctionApplyDrafts}
              onSubmit={handleSubmitCorrection}
              onNoteChange={(value) => {
                setFormNoteId(value);
                if (value) setFormPassageId("");
              }}
              onPassageChange={(value) => {
                setFormPassageId(value);
                if (value) setFormNoteId("");
              }}
              onSeverityChange={setFormSeverity}
              onCorrectionChange={setFormCorrection}
              onRationaleChange={setFormRationale}
              onContextChange={setFormContextText}
              onReviewCorrection={handleReviewCorrection}
              onApplyDraftChange={(correctionId, explanation) => {
                setCorrectionApplyDrafts((current) => ({ ...current, [correctionId]: explanation }));
              }}
              onApplyCorrection={handleApplyCorrection}
            />
          ) : (
            <>
              {view === "profile" && (
                selectedLanguageId ? <LanguageProfileView profileState={profileState} /> : <NoLanguageNotice />
              )}
              {view === "ingest" && (
                selectedLanguageId ? <IngestView languageId={selectedLanguageId} /> : <NoLanguageNotice />
              )}
              {view === "corpus" && (
                <CorpusView
                  corpus={data.corpus}
                  isWorkflowBusy={isWorkflowBusy}
                  onImportCorpusPassage={handleImportCorpusPassage}
                />
              )}
              {view === "review" && (
                <ReviewView
                  notes={data.notes}
                  selectedNote={selectedNote}
                  isWorkflowBusy={isWorkflowBusy}
                  reviewingNoteId={reviewingNoteId}
                  onSelectNote={setSelectedNoteId}
                  onReview={handleReview}
                  onSaveExplanation={handleSaveNoteExplanation}
                />
              )}
              {view === "learner" && (
                <LearnerView
                  exercises={data.exercises}
                  selectedExercise={selectedExercise}
                  selectedExerciseId={selectedExerciseId}
                  isWorkflowBusy={isWorkflowBusy}
                  exerciseAnswer={exerciseAnswer}
                  isGrading={isGrading}
                  exerciseResult={exerciseResult}
                  isLoadingSubmissions={isLoadingSubmissions}
                  submissionHistory={submissionHistory}
                  onSelectExercise={setSelectedExerciseId}
                  onAnswerChange={setExerciseAnswer}
                  onGrade={handleGrade}
                  onCreateExercise={handleCreateExercise}
                />
              )}
              {view === "eval" && (
                <EvaluationView
                  evaluations={data.evaluations}
                  languages={data.languages}
                  selectedLanguageId={selectedLanguageId}
                  isWorkflowBusy={isWorkflowBusy}
                  artifactDownload={evaluationArtifactDownload}
                  artifactError={evaluationArtifactError}
                  isExportingArtifact={isExportingEvaluationArtifact}
                  onExportArtifact={handleExportEvaluationArtifact}
                />
              )}
              {view === "governance" && !selectedLanguageId && <NoLanguageNotice />}
              {view === "governance" && selectedLanguageId && (
                <GovernanceView
                  selectedLanguageId={selectedLanguageId}
                  governanceState={governanceState}
                  auditEventState={auditEventState}
                  policyType={policyType}
                  policyEffectiveDate={policyEffectiveDate}
                  policyContent={policyContent}
                  governanceSuccess={governanceSuccess}
                  governanceError={governanceError}
                  isSubmittingGovernance={isSubmittingGovernance}
                  reviewPolicyState={reviewPolicyState}
                  reviewPolicyReviewerIds={reviewPolicyReviewerIds}
                  reviewPolicyApprovalThreshold={reviewPolicyApprovalThreshold}
                  reviewPolicyRequiresAssigned={reviewPolicyRequiresAssigned}
                  reviewPolicySuccess={reviewPolicySuccess}
                  reviewPolicyError={reviewPolicyError}
                  isSubmittingReviewPolicy={isSubmittingReviewPolicy}
                  reviewDispositionState={reviewDispositionState}
                  reviewDispositionDrafts={reviewDispositionDrafts}
                  reviewDispositionSuccess={reviewDispositionSuccess}
                  reviewDispositionError={reviewDispositionError}
                  resolvingReviewDispositionId={resolvingReviewDispositionId}
                  snapshotDownload={snapshotDownload}
                  snapshotError={snapshotError}
                  isExportingSnapshot={isExportingSnapshot}
                  onPolicyTypeChange={setPolicyType}
                  onEffectiveDateChange={setPolicyEffectiveDate}
                  onContentChange={setPolicyContent}
                  onSubmit={handleSubmitGovernance}
                  onReviewPolicyReviewerIdsChange={setReviewPolicyReviewerIds}
                  onReviewPolicyApprovalThresholdChange={setReviewPolicyApprovalThreshold}
                  onReviewPolicyRequiresAssignedChange={setReviewPolicyRequiresAssigned}
                  onReviewPolicySubmit={handleSubmitReviewPolicy}
                  onReviewDispositionDraftChange={(dispositionId, summary) => {
                    setReviewDispositionDrafts((drafts) => ({ ...drafts, [dispositionId]: summary }));
                  }}
                  onResolveReviewDisposition={handleResolveReviewDisposition}
                  onExportSnapshot={handleExportSnapshot}
                />
              )}
              {view === "model" && (
                <ModelSetupView
                  llmState={llmState}
                  observabilityState={observabilityState}
                  isTestingModel={isTestingModel}
                  modelTestResult={modelTestResult}
                  modelTestIsPlaceholder={modelTestIsPlaceholder}
                  onSmokeTest={handleModelSmokeTest}
                  isCheckingReachability={isCheckingReachability}
                  reachabilityResult={reachabilityResult}
                  reachabilityError={reachabilityError}
                  onTestConnection={handleTestConnection}
                />
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function LanguageProfileView({ profileState }: { profileState: AsyncState<LanguageProfile> }) {
  if (profileState.status === "loading" || profileState.status === "idle") {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Loading language profile...
      </div>
    );
  }

  if (profileState.status === "error") {
    return (
      <div className="panel-card error" role="alert">
        {profileState.message}
      </div>
    );
  }

  const { language, stats, phonology, grammarRules, vocabulary, morphemeInventory } = profileState.data;

  return (
    <div className="profile-view">
      <section className="panel-card profile-summary" aria-label="Language profile summary">
        <div className="record-topline">
          <div>
            <span className="detail-label">Language profile</span>
            <h2>{language.name}</h2>
          </div>
          <span className="id-badge">{language.id}</span>
        </div>
        <p className="explanation">{language.description}</p>
        <dl className="detail-grid">
          <div>
            <dt>Typology</dt>
            <dd>{language.typology}</dd>
          </div>
          <div>
            <dt>Vocabulary</dt>
            <dd>{stats.vocabularyItems}</dd>
          </div>
          <div>
            <dt>Grammar rules</dt>
            <dd>{stats.grammarRules}</dd>
          </div>
          <div>
            <dt>Exercise types</dt>
            <dd>{Object.keys(stats.exerciseTypes).length}</dd>
          </div>
          <div>
            <dt>Corpus passages</dt>
            <dd>{stats.corpusPassages}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{stats.notes}</dd>
          </div>
          <div>
            <dt>Exercises</dt>
            <dd>{stats.exercises}</dd>
          </div>
          <div>
            <dt>Source assets</dt>
            <dd>{stats.sourceAssets}</dd>
          </div>
          <div>
            <dt>Pending extraction drafts</dt>
            <dd>{stats.pendingExtractionDrafts}</dd>
          </div>
        </dl>
      </section>

      {phonology ? (
        <section className="panel-card phonology-panel" aria-label="Phonology profile">
          <div className="record-topline">
            <div>
              <span className="detail-label">Phonology profile</span>
              <h2>{phonology.syllableTemplate ?? "Syllable template not set"}</h2>
            </div>
            {phonology.stress && <span className="id-badge">{phonology.stress}</span>}
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Consonants</dt>
              <dd>{phonology.consonants.length > 0 ? phonology.consonants.join(" ") : "None recorded"}</dd>
            </div>
            <div>
              <dt>Vowels</dt>
              <dd>{phonology.vowels.length > 0 ? phonology.vowels.join(" ") : "None recorded"}</dd>
            </div>
          </dl>
          <div className="detail-list">
            {phonology.notes.map((note) => (
              <p className="detail-row" key={note}>{note}</p>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel-card phonology-panel" aria-label="Phonology profile">
          <div className="record-topline">
            <div>
              <span className="detail-label">Phonology profile</span>
              <h2>No phonology declared yet</h2>
            </div>
          </div>
          <p className="empty-state">Add phonology details to the language record to populate this panel.</p>
        </section>
      )}

      <section className="panel-card grammar-panel" aria-label="Grammar inventory">
        <div className="record-topline">
          <div>
            <span className="detail-label">Grammar inventory</span>
            <h2>{formatCount(grammarRules.length, "rule")}</h2>
          </div>
        </div>
        <div className="detail-list">
          {grammarRules.map((rule) => (
            <article className="detail-row grammar-rule-row" key={rule.id}>
              <div>
                <strong>{rule.topic}</strong>
                <p>{rule.explanation}</p>
              </div>
              <ConfidenceBadge confidence={rule.confidence} />
              <div className="pill-row">
                {rule.evidencePassageIds.map((passageId) => (
                  <span className="pill" key={passageId}>{passageId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card vocabulary-panel" aria-label="Vocabulary inventory">
        <div className="record-topline">
          <div>
            <span className="detail-label">Vocabulary inventory</span>
            <h2>{formatCount(vocabulary.length, "entry", "entries")}</h2>
          </div>
        </div>
        <div className="vocabulary-grid">
          {vocabulary.map((item) => (
            <article className="vocabulary-entry" key={item.id}>
              <code>{item.form}</code>
              <strong>{item.gloss}</strong>
              <span>{item.partOfSpeech}</span>
              <div className="pill-row">
                {item.tags.map((tag) => (
                  <span className="pill" key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-card morpheme-panel" aria-label="Morpheme inventory">
        <div className="record-topline">
          <div>
            <span className="detail-label">Morpheme inventory</span>
            <h2>{formatCount(morphemeInventory.length, "morpheme")}</h2>
          </div>
        </div>
        <div className="morpheme-grid">
          {morphemeInventory.map((item) => (
            <article className="morpheme-entry" key={`${item.surface}-${item.lemma}`}>
              <div className="morpheme-entry-topline">
                <code>{item.surface}</code>
                <span className="id-badge">{formatCount(item.occurrenceCount, "corpus use")}</span>
              </div>
              <strong>{item.lemma}</strong>
              <span>{item.glosses.join(" / ")}</span>
              {item.vocabulary && (
                <small>{item.vocabulary.partOfSpeech}: {item.vocabulary.gloss}</small>
              )}
              <div className="pill-row">
                {item.features.map((feature) => (
                  <span className="pill" key={`${item.surface}-${feature}`}>{feature}</span>
                ))}
              </div>
              <div className="pill-row">
                {item.passageIds.map((passageId) => (
                  <span className="pill" key={`${item.surface}-${passageId}`}>{passageId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function NoLanguageNotice() {
  return <p className="empty-state panel-card">Select or create a language first.</p>;
}

function CreateLanguageForm({
  isWorkflowBusy,
  onCreate
}: {
  isWorkflowBusy: boolean;
  onCreate: (payload: LanguageCreatePayload) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orthography, setOrthography] = useState("");
  const [typology, setTypology] = useState<Language["typology"]>("unknown");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !description.trim() || !orthography.trim()) {
      setCreateError("Name, description, and orthography are required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        orthography: orthography.trim(),
        typology
      });
      setName("");
      setDescription("");
      setOrthography("");
      setTypology("unknown");
      setIsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Language creation failed";
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="secondary new-language-toggle" disabled={isWorkflowBusy} onClick={() => setIsOpen(true)}>
        New language
      </button>
    );
  }

  return (
    <form className="form-panel compact new-language-form" aria-label="Create language" onSubmit={handleSubmit}>
      <div>
        <span className="detail-label">Workspace setup</span>
        <h3>New language</h3>
      </div>
      {createError && <p className="result-notice error" role="alert">{createError}</p>}
      <div className="form-group">
        <label htmlFor="new-language-name">Language name</label>
        <input id="new-language-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-description">Description</label>
        <textarea
          id="new-language-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-orthography">Orthography</label>
        <input id="new-language-orthography" value={orthography} onChange={(event) => setOrthography(event.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="new-language-typology">Typology</label>
        <select
          id="new-language-typology"
          value={typology}
          onChange={(event) => setTypology(event.target.value as Language["typology"])}
        >
          {LANGUAGE_TYPOLOGY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isWorkflowBusy || isCreating}>
        {isCreating ? "Creating..." : "Create language"}
      </button>
      <button type="button" className="secondary" disabled={isCreating} onClick={() => setIsOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function extractionDraftSummary(draft: ExtractionDraft): string {
  if (draft.kind === "lexeme") {
    return `${draft.payload.form ?? "(no form)"} — ${draft.payload.gloss ?? "(no gloss)"}`;
  }
  if (draft.kind === "corpus_passage") {
    return `${draft.payload.textTarget ?? "(no target text)"} — ${draft.payload.textTranslation ?? "(no translation)"}`;
  }
  return `${draft.payload.topic ?? "(no topic)"} — ${draft.payload.explanation ?? "(no explanation)"}`;
}

function IngestView({ languageId }: { languageId: string }) {
  const [sources, setSources] = useState<SourceAsset[]>([]);
  const [drafts, setDrafts] = useState<ExtractionDraftView[]>([]);
  const [isLoadingIntake, setIsLoadingIntake] = useState(true);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  const [registerKind, setRegisterKind] = useState<SourceRegistrationPayload["kind"]>("text");
  const [registerTitle, setRegisterTitle] = useState("");
  const [registerText, setRegisterText] = useState("");
  const [registerUrl, setRegisterUrl] = useState("");
  const [registerNotice, setRegisterNotice] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegisteringSource, setIsRegisteringSource] = useState(false);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadingSource, setIsUploadingSource] = useState(false);

  const [processingSourceId, setProcessingSourceId] = useState<string | null>(null);
  const [pollingSource, setPollingSource] = useState<{ id: string; title: string } | null>(null);
  const [processNotice, setProcessNotice] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processWarnings, setProcessWarnings] = useState<string[]>([]);

  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setIsLoadingIntake(true);
    setIntakeError(null);
    setRegisterNotice(null);
    setRegisterError(null);
    setProcessingSourceId(null);
    setPollingSource(null);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    setDraftNotice(null);
    setDraftError(null);

    Promise.all([fetchSources(languageId), fetchExtractionDrafts(languageId, "proposed")])
      .then(([loadedSources, loadedDrafts]) => {
        if (!isCurrent) return;
        setSources(loadedSources);
        setDrafts(loadedDrafts);
      })
      .catch((error: Error) => {
        if (isCurrent) setIntakeError(error.message);
      })
      .finally(() => {
        if (isCurrent) setIsLoadingIntake(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [languageId]);

  async function refreshIntake() {
    const [loadedSources, loadedDrafts] = await Promise.all([
      fetchSources(languageId),
      fetchExtractionDrafts(languageId, "proposed")
    ]);
    setSources(loadedSources);
    setDrafts(loadedDrafts);
  }

  async function handleRegisterSource(event: FormEvent) {
    event.preventDefault();
    const title = registerTitle.trim();
    const rawText = registerText.trim();
    const url = registerUrl.trim();

    if (!title) {
      setRegisterNotice(null);
      setRegisterError("Please provide a source title.");
      return;
    }

    if (registerKind === "url" ? !url : !rawText) {
      setRegisterNotice(null);
      setRegisterError(registerKind === "url" ? "Please provide the source URL." : "Please paste the source text.");
      return;
    }

    const payload: SourceRegistrationPayload = registerKind === "url"
      ? { kind: registerKind, title, url }
      : { kind: registerKind, title, rawText };

    setIsRegisteringSource(true);
    setRegisterNotice(null);
    setRegisterError(null);
    try {
      const registered = await registerSource(languageId, payload);
      setRegisterTitle("");
      setRegisterText("");
      setRegisterUrl("");
      setRegisterNotice(`Source registered: ${registered.title}.`);
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source registration failed";
      setRegisterError(message);
    } finally {
      setIsRegisteringSource(false);
    }
  }

  async function handleUploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!uploadFile) {
      setRegisterNotice(null);
      setRegisterError("Choose a file to upload.");
      return;
    }

    setIsUploadingSource(true);
    setRegisterNotice(null);
    setRegisterError(null);
    try {
      const uploaded = await uploadSourceFile(languageId, uploadFile, uploadTitle.trim() || undefined);
      setUploadFile(null);
      setUploadTitle("");
      form.reset();
      setRegisterNotice(`File uploaded as ${uploaded.kind} source: ${uploaded.title}.`);
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source upload failed";
      setRegisterError(message);
    } finally {
      setIsUploadingSource(false);
    }
  }

  // Poll the source list while a background extraction is running. The
  // first poll fires immediately, then every 2.5s until the asset leaves
  // "processing"; cleanup cancels the loop on unmount or language change.
  useEffect(() => {
    if (!pollingSource) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const loadedSources = await fetchSources(languageId);
        if (cancelled) return;
        setSources(loadedSources);

        const asset = loadedSources.find((item) => item.id === pollingSource.id);
        if (asset && asset.status === "processing") {
          timer = setTimeout(() => { void poll(); }, 2500);
          return;
        }

        setPollingSource(null);
        setProcessingSourceId(null);
        if (asset && asset.status === "failed") {
          setProcessError(asset.error ?? `Processing ${pollingSource.title} failed.`);
        } else {
          setProcessNotice(`Processing ${pollingSource.title} finished.`);
        }

        const loadedDrafts = await fetchExtractionDrafts(languageId, "proposed");
        if (!cancelled) setDrafts(loadedDrafts);
      } catch {
        // Transient fetch failure: keep polling instead of giving up.
        if (!cancelled) {
          timer = setTimeout(() => { void poll(); }, 2500);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pollingSource, languageId]);

  async function handleProcessSource(sourceId: string) {
    setProcessingSourceId(sourceId);
    setProcessNotice(null);
    setProcessError(null);
    setProcessWarnings([]);
    try {
      const result = await processSource(sourceId, { async: true });
      setSources((previous) => previous.map((item) => (item.id === result.asset.id ? result.asset : item)));
      setPollingSource({ id: result.asset.id, title: result.asset.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source processing failed";
      setProcessError(message);
      setProcessingSourceId(null);
    }
  }

  async function handleDraftDecision(draftId: string, decision: "accept" | "reject") {
    setReviewingDraftId(draftId);
    setDraftNotice(null);
    setDraftError(null);
    try {
      if (decision === "accept") {
        const result = await acceptExtractionDraft(draftId);
        setDraftNotice(`Draft accepted: ${EXTRACTION_DRAFT_KIND_LABELS[result.draft.kind]} committed.`);
      } else {
        const rejected = await rejectExtractionDraft(draftId);
        setDraftNotice(`Draft rejected: ${EXTRACTION_DRAFT_KIND_LABELS[rejected.kind]}.`);
      }
      await refreshIntake();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction draft review failed";
      setDraftError(message);
    } finally {
      setReviewingDraftId(null);
    }
  }

  if (isLoadingIntake) {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Loading sources and intake queue...
      </div>
    );
  }

  if (intakeError) {
    return (
      <div className="panel-card error" role="alert">
        {intakeError}
      </div>
    );
  }

  return (
    <div className="ingest-view">
      <form className="record-card form-panel compact" aria-label="Register source" onSubmit={handleRegisterSource}>
        <div>
          <span className="detail-label">Source intake</span>
          <h3>Add source</h3>
        </div>
        {registerNotice && <p className="result-notice" role="status" aria-live="polite">{registerNotice}</p>}
        {registerError && <p className="result-notice error" role="alert">{registerError}</p>}
        <div className="form-group">
          <label htmlFor="ingest-source-kind">Source kind</label>
          <select
            id="ingest-source-kind"
            value={registerKind}
            onChange={(event) => setRegisterKind(event.target.value as SourceRegistrationPayload["kind"])}
          >
            <option value="text">Text</option>
            <option value="wordlist">Word list</option>
            <option value="url">URL</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="ingest-source-title">Source title</label>
          <input id="ingest-source-title" value={registerTitle} onChange={(event) => setRegisterTitle(event.target.value)} />
        </div>
        {registerKind === "url" ? (
          <div className="form-group">
            <label htmlFor="ingest-source-url">Source URL</label>
            <input
              id="ingest-source-url"
              type="url"
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
              placeholder="https://example.org/wordlist"
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="ingest-source-text">Raw text</label>
            <textarea
              id="ingest-source-text"
              value={registerText}
              onChange={(event) => setRegisterText(event.target.value)}
              placeholder="Paste raw text or word list lines"
            />
          </div>
        )}
        <button type="submit" className="secondary" disabled={isRegisteringSource}>
          {isRegisteringSource ? "Registering..." : "Register source"}
        </button>
      </form>

      <form className="record-card form-panel compact" aria-label="Upload source file" onSubmit={handleUploadSource}>
        <div>
          <span className="detail-label">File intake</span>
          <h3>Upload image, audio, or document</h3>
        </div>
        <div className="form-group">
          <label htmlFor="ingest-upload-title">Upload title (optional)</label>
          <input id="ingest-upload-title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="ingest-upload-file">Source file</label>
          <input
            id="ingest-upload-file"
            type="file"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <button type="submit" className="secondary" disabled={isUploadingSource || !uploadFile}>
          {isUploadingSource ? "Uploading..." : "Upload source file"}
        </button>
      </form>

      <section className="panel-card" aria-label="Registered sources">
        <div className="record-topline">
          <div>
            <span className="detail-label">Registered sources</span>
            <h2>{formatCount(sources.length, "source")}</h2>
          </div>
        </div>
        {processNotice && <p className="result-notice" role="status" aria-live="polite">{processNotice}</p>}
        {processError && <p className="result-notice error" role="alert">{processError}</p>}
        {processWarnings.length > 0 && (
          <div className="warning-list">
            {processWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        {sources.length === 0 ? (
          <p className="empty-state">No sources registered yet. Add raw text, a word list, a URL, or upload a file.</p>
        ) : (
          <div className="detail-list">
            {sources.map((source) => (
              <article className="detail-row source-row" key={source.id} aria-label={`Source ${source.title}`}>
                <div>
                  <strong>{source.title}</strong>
                  <div className="pill-row">
                    <span className="pill">{source.kind}</span>
                    <StatusBadge status={source.status} />
                    {source.kind === "audio" && (
                      <span className="pill">{source.transcript ? "transcript ready" : "no transcript yet"}</span>
                    )}
                  </div>
                  <small className="muted">Added by {source.createdBy} at {source.createdAt}</small>
                  {source.error && <p className="result-notice error">{source.error}</p>}
                  {source.warnings && source.warnings.length > 0 && (
                    <ul className="source-warnings" aria-label={`Processing warnings for ${source.title}`}>
                      {source.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={processingSourceId !== null}
                  onClick={() => handleProcessSource(source.id)}
                >
                  {processingSourceId === source.id ? "Processing..." : `Process ${source.title}`}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card" aria-label="Extraction draft queue">
        <div className="record-topline">
          <div>
            <span className="detail-label">Extraction drafts</span>
            <h2>{formatCount(drafts.length, "proposed draft")}</h2>
          </div>
        </div>
        {draftNotice && <p className="result-notice" role="status" aria-live="polite">{draftNotice}</p>}
        {draftError && <p className="result-notice error" role="alert">{draftError}</p>}
        {drafts.length === 0 ? (
          <p className="empty-state">No proposed extraction drafts. Process a source to propose lexemes, passages, and grammar notes.</p>
        ) : (
          <div className="detail-list">
            {drafts.map((draft) => (
              <article className="detail-row draft-row" key={draft.id} aria-label={`Extraction draft ${draft.id}`}>
                <div>
                  <div className="pill-row">
                    <span className="pill">{EXTRACTION_DRAFT_KIND_LABELS[draft.kind]}</span>
                    <ConfidenceBadge confidence={draft.confidence} />
                    {draft.duplicate && (
                      <span className={`status-badge ${draft.duplicate.kind === "pending" ? "under_review" : "contested"}`}>
                        {EXTRACTION_DRAFT_DUPLICATE_LABELS[draft.duplicate.kind]}
                      </span>
                    )}
                  </div>
                  <strong>{extractionDraftSummary(draft)}</strong>
                  {draft.rationale && <p>{draft.rationale}</p>}
                </div>
                <div className="correction-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={reviewingDraftId !== null}
                    onClick={() => handleDraftDecision(draft.id, "accept")}
                  >
                    {reviewingDraftId === draft.id ? "Reviewing..." : `Accept draft ${draft.id}`}
                  </button>
                  <button
                    type="button"
                    className="contest"
                    disabled={reviewingDraftId !== null}
                    onClick={() => handleDraftDecision(draft.id, "reject")}
                  >
                    Reject draft {draft.id}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CorpusView({
  corpus,
  isWorkflowBusy,
  onImportCorpusPassage
}: {
  corpus: CorpusPassage[];
  isWorkflowBusy: boolean;
  onImportCorpusPassage: (payload: CorpusImportPayload) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [importDraft, setImportDraft] = useState<CorpusImportDraft>(() => ({ ...EMPTY_CORPUS_IMPORT_DRAFT }));
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingCorpus, setIsImportingCorpus] = useState(false);
  const normalized = search.trim().toLowerCase();
  const canImportPassage = canSubmitCorpusImportDraft(importDraft)
    && !isWorkflowBusy
    && !isImportingCorpus;
  const filtered = useMemo(() => {
    if (!normalized) return corpus;
    return corpus.filter((passage) => {
      const morphemeText = passage.morphologicalSegmentation
        .map((morpheme) => `${morpheme.surface} ${morpheme.gloss} ${morpheme.lemma} ${morpheme.features.join(" ")}`)
        .join(" ");
      return [
        passage.id,
        passage.source,
        passage.textTarget,
        passage.textTranslation,
        passage.topicTags.join(" "),
        morphemeText
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [corpus, normalized]);

  function clearImportNotice() {
    setImportMessage(null);
    setImportError(null);
  }

  function updateImportDraft(field: keyof CorpusImportDraft, value: string) {
    setImportDraft((current) => ({ ...current, [field]: value }));
    clearImportNotice();
  }

  async function handleImportCorpus(event: FormEvent) {
    event.preventDefault();
    const result = buildCorpusImportPayload(importDraft);
    if (!result.ok) {
      setImportMessage(null);
      setImportError(result.error);
      return;
    }

    setIsImportingCorpus(true);
    setImportMessage(null);
    setImportError(null);
    try {
      await onImportCorpusPassage(result.payload);
      setImportDraft({ ...EMPTY_CORPUS_IMPORT_DRAFT });
      setImportMessage("Corpus passage imported.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Corpus import failed";
      setImportError(message);
    } finally {
      setIsImportingCorpus(false);
    }
  }

  return (
    <div className="corpus-view">
      <form className="record-card form-panel compact corpus-import-form" aria-label="Corpus import" onSubmit={handleImportCorpus}>
        <div>
          <span className="detail-label">Corpus import</span>
          <h3>Add source passage</h3>
        </div>
        <div className="corpus-import-grid">
          <div className="form-group wide">
            <label htmlFor="corpus-import-target">Corpus target text</label>
            <input
              id="corpus-import-target"
              value={importDraft.target}
              onChange={(event) => updateImportDraft("target", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-translation">English translation</label>
            <input
              id="corpus-import-translation"
              value={importDraft.translation}
              onChange={(event) => updateImportDraft("translation", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-source">Source</label>
            <input
              id="corpus-import-source"
              value={importDraft.source}
              onChange={(event) => updateImportDraft("source", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-author">Author</label>
            <input
              id="corpus-import-author"
              value={importDraft.author}
              onChange={(event) => updateImportDraft("author", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-year">Year</label>
            <input
              id="corpus-import-year"
              type="number"
              inputMode="numeric"
              value={importDraft.year}
              onChange={(event) => updateImportDraft("year", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-license">License</label>
            <input
              id="corpus-import-license"
              value={importDraft.license}
              onChange={(event) => updateImportDraft("license", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-consent-record">Consent record</label>
            <input
              id="corpus-import-consent-record"
              value={importDraft.consentRecord}
              onChange={(event) => updateImportDraft("consentRecord", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="corpus-import-tags">Topic tags</label>
            <input
              id="corpus-import-tags"
              value={importDraft.tags}
              onChange={(event) => updateImportDraft("tags", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-morphemes">Morpheme segmentation</label>
            <textarea
              id="corpus-import-morphemes"
              value={importDraft.morphemes}
              onChange={(event) => updateImportDraft("morphemes", event.target.value)}
            />
          </div>
          <div className="form-group wide">
            <label htmlFor="corpus-import-restrictions">Access restrictions</label>
            <input
              id="corpus-import-restrictions"
              value={importDraft.restrictions}
              onChange={(event) => updateImportDraft("restrictions", event.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="secondary" disabled={!canImportPassage}>
          {isImportingCorpus ? "Importing..." : "Import passage"}
        </button>
        {importMessage && <p className="result-notice" role="status" aria-live="polite">{importMessage}</p>}
        {importError && <p className="result-notice error" role="alert">{importError}</p>}
      </form>

      <div className="toolbar-row">
        <label className="search-field" htmlFor="corpus-search">
          <span className="visually-hidden">Search corpus</span>
          <input
            id="corpus-search"
            type="search"
            aria-label="Search corpus"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search passages, translations, tags"
          />
        </label>
        <span className="record-count">{filtered.length} of {corpus.length} passages</span>
      </div>

      <section className="corpus-list" aria-label="Corpus passages">
        {filtered.length === 0 ? (
          <p className="empty-state">No passages match your search.</p>
        ) : (
          filtered.map((passage) => (
            <article className="corpus-card" key={passage.id}>
              <div className="bead-strip" aria-hidden="true" />
              <div className="corpus-card-body">
                <div className="corpus-topline">
                  <code>{passage.textTarget}</code>
                  <span className="id-badge">{passage.id}</span>
                </div>
                <p className="translation">{passage.textTranslation}</p>
                <MorphChips morphemes={passage.morphologicalSegmentation} />
                <div className="pill-row">
                  {passage.topicTags.map((tag) => (
                    <span className="pill" key={tag}>{tag}</span>
                  ))}
                  <span className="pill">{passage.source}</span>
                  <span className="pill">{passage.consentStatus.use}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ReviewView({
  notes,
  selectedNote,
  isWorkflowBusy,
  reviewingNoteId,
  onSelectNote,
  onReview,
  onSaveExplanation
}: {
  notes: Note[];
  selectedNote: Note | null;
  isWorkflowBusy: boolean;
  reviewingNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onReview: (status: ReviewStatus) => void;
  onSaveExplanation: (explanation: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [noteExplanationDraft, setNoteExplanationDraft] = useState(selectedNote?.explanation ?? "");
  const [noteEditMessage, setNoteEditMessage] = useState<string | null>(null);
  const counts = useMemo(() => ({
    all: notes.length,
    pending: notes.filter((note) => note.status === "draft" || note.status === "under_review").length,
    contested: notes.filter((note) => note.status === "contested").length,
    rejected: notes.filter((note) => note.status === "rejected").length,
    deferred: notes.filter((note) => note.status === "deferred").length,
    escalated: notes.filter((note) => note.status === "escalated").length,
    approved: notes.filter((note) => note.status === "approved").length
  }), [notes]);
  const filteredNotes = useMemo(() => {
    if (filter === "all") return notes;
    if (filter === "pending") return notes.filter((note) => note.status === "draft" || note.status === "under_review");
    return notes.filter((note) => note.status === filter);
  }, [filter, notes]);
  useEffect(() => {
    setNoteExplanationDraft(selectedNote?.explanation ?? "");
    setNoteEditMessage(null);
  }, [selectedNote?.id, selectedNote?.explanation]);
  const trimmedDraft = noteExplanationDraft.trim();
  const canSaveExplanation = selectedNote !== null
    && trimmedDraft.length > 0
    && trimmedDraft !== selectedNote.explanation
    && reviewingNoteId === null
    && !isWorkflowBusy;

  async function handleSaveExplanation(event: FormEvent) {
    event.preventDefault();
    if (!canSaveExplanation) return;
    await onSaveExplanation(trimmedDraft);
    setNoteEditMessage("Note explanation updated.");
  }

  return (
    <div className="review-workbench">
      <section className="triage-panel" aria-label="Review queue">
        <div className="filter-strip" aria-label="Review filters">
          {(["all", "pending", "contested", "rejected", "deferred", "escalated", "approved"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              <span>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</span>
              <strong aria-hidden="true">{counts[item]}</strong>
            </button>
          ))}
        </div>

        <div className="note-table-head" aria-hidden="true">
          <span>Topic</span>
          <span>Status</span>
          <span>Evidence</span>
        </div>

        <div className="note-table-body">
          {filteredNotes.length === 0 ? (
            <p className="empty-state">No notes in this filter.</p>
          ) : (
            filteredNotes.map((note) => (
              <button
                type="button"
                key={note.id}
                className={`note-row${selectedNote?.id === note.id ? " active" : ""}`}
                aria-pressed={selectedNote?.id === note.id}
                disabled={isWorkflowBusy}
                onClick={() => onSelectNote(note.id)}
              >
                <span className="note-topic">
                  <strong>{note.topic}</strong>
                  <small>{note.confidence} confidence</small>
                </span>
                <StatusBadge status={note.status} />
                <span className="note-evidence">{formatEvidenceLabel(note.evidenceCount)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="detail-panel note-detail-panel" aria-label="Note detail panel">
        {selectedNote ? (
          <article className="record-card" aria-label="Selected note detail">
            <div className="record-topline">
              <div>
                <span className="detail-label">Selected note</span>
                <h2>{selectedNote.topic}</h2>
              </div>
              <div className="pill-row">
                <StatusBadge status={selectedNote.status} />
                <ConfidenceBadge confidence={selectedNote.confidence} />
              </div>
            </div>

            <p className="explanation">{selectedNote.explanation}</p>
            <form className="note-edit-form" onSubmit={handleSaveExplanation}>
              <div className="form-group">
                <label htmlFor="note-explanation-draft">Revised note explanation</label>
                <textarea
                  id="note-explanation-draft"
                  value={noteExplanationDraft}
                  onChange={(event) => {
                    setNoteExplanationDraft(event.target.value);
                    setNoteEditMessage(null);
                  }}
                />
              </div>
              <button type="submit" className="secondary" disabled={!canSaveExplanation}>
                {reviewingNoteId === selectedNote.id ? "Saving..." : "Save note explanation"}
              </button>
              {noteEditMessage && (
                <p className="result-notice" role="status" aria-live="polite">
                  {noteEditMessage}
                </p>
              )}
            </form>
            <dl className="detail-grid">
              <div>
                <dt>Evidence</dt>
                <dd>{formatEvidenceLabel(selectedNote.evidenceCount)}</dd>
              </div>
              <div>
                <dt>Dialect scope</dt>
                <dd>{selectedNote.dialectScope}</dd>
              </div>
              <div>
                <dt>Last reviewed by</dt>
                <dd>{selectedNote.reviewer.lastReviewedBy ?? "Unreviewed"}</dd>
              </div>
              <div>
                <dt>Last reviewed at</dt>
                <dd>{selectedNote.reviewer.lastReviewedAt ?? "Unreviewed"}</dd>
              </div>
            </dl>

            <DetailBlock title="Evidence Citations">
              <div className="pill-row">
                {selectedNote.evidencePassageIds.map((passageId) => (
                  <span key={passageId} className="pill">
                    {passageId}
                  </span>
                ))}
              </div>
            </DetailBlock>

            <DetailBlock title="Examples">
              {selectedNote.examples.length === 0 ? (
                <p className="inline-empty">No examples supplied.</p>
              ) : (
                <div className="detail-list">
                  {selectedNote.examples.map((example) => (
                    <div key={example.passageId} className="detail-row example-row">
                      <code>{example.target}</code>
                      <span>{example.translation}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            <DetailBlock title="Reviewer comments">
              {selectedNote.reviewer.comments.length === 0 ? (
                <p className="inline-empty">No reviewer comments.</p>
              ) : (
                <div className="detail-list">
                  {selectedNote.reviewer.comments.map((comment) => (
                    <p key={comment} className="detail-row">
                      {comment}
                    </p>
                  ))}
                </div>
              )}
            </DetailBlock>

            <DetailBlock title="Edit history">
              {selectedNote.editHistory.length === 0 ? (
                <p className="inline-empty">No edit history.</p>
              ) : (
                <div className="detail-list">
                  {selectedNote.editHistory.map((entry) => (
                    <div key={`${entry.at}-${entry.action}-${entry.summary}`} className="detail-row">
                      <strong>{entry.action}</strong>
                      <span>{entry.summary}</span>
                      <span className="muted">{entry.by}</span>
                      <span className="muted">{entry.at}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailBlock>

            <div className="review-bar">
              <button
                type="button"
                className="approve"
                aria-label={`Approve ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("approved")}
              >
                Approve
              </button>
              <button
                type="button"
                className="contest"
                aria-label={`Contest ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("contested")}
              >
                Contest
              </button>
              <button
                type="button"
                className="reject"
                aria-label={`Reject ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("rejected")}
              >
                Reject
              </button>
              <button
                type="button"
                className="defer"
                aria-label={`Defer ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("deferred")}
              >
                Defer
              </button>
              <button
                type="button"
                className="escalate"
                aria-label={`Escalate ${selectedNote.topic}`}
                disabled={reviewingNoteId !== null}
                onClick={() => onReview("escalated")}
              >
                Escalate
              </button>
            </div>
          </article>
        ) : (
          <p className="empty-state">No notes for this language.</p>
        )}
      </section>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-block">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function EvaluationView({
  evaluations,
  languages,
  selectedLanguageId,
  isWorkflowBusy,
  artifactDownload,
  artifactError,
  isExportingArtifact,
  onExportArtifact
}: {
  evaluations: EvaluationRun[];
  languages: Language[];
  selectedLanguageId: string | null;
  isWorkflowBusy: boolean;
  artifactDownload: SnapshotDownload | null;
  artifactError: string | null;
  isExportingArtifact: boolean;
  onExportArtifact: () => void;
}) {
  const [activeLanguageId, setActiveLanguageId] = useState<string | null>(selectedLanguageId);
  useEffect(() => {
    setActiveLanguageId(selectedLanguageId);
  }, [selectedLanguageId]);

  const latestByLanguage = useMemo(() => latestRunsByLanguage(evaluations), [evaluations]);
  const trends = useMemo(() => evaluationTrendsForRuns(evaluations), [evaluations]);
  const comparableTrends = trends.filter((trend) => trend.previousRunId !== null);
  const activeRun = (activeLanguageId ? latestByLanguage[activeLanguageId] : undefined) ?? evaluations[0] ?? null;
  const activeLanguage = languages.find((language) => language.id === (activeRun?.languageId ?? activeLanguageId));

  if (evaluations.length === 0) {
    return <p className="empty-state panel-card">No evaluation runs yet.</p>;
  }

  return (
    <div className="evaluation-view">
      <div className="eval-language-grid">
        {languages.map((language) => {
          const latest = latestByLanguage[language.id];
          const score = latest ? averageScore(latest.scores) : 0;
          const isActive = (activeRun?.languageId ?? activeLanguageId) === language.id;
          return (
            <button
              type="button"
              key={language.id}
              aria-label={`${language.name} evaluation score`}
              className={`eval-language-card ${scoreTone(score)}${isActive ? " active" : ""}`}
              onClick={() => setActiveLanguageId(language.id)}
            >
              <div>
                <strong>{language.name}</strong>
                <span>{language.typology}</span>
              </div>
              <ScoreRing score={score} />
            </button>
          );
        })}
      </div>

      <section className="panel-card evaluation-export-card" aria-label="Evaluation artifact export">
        <div>
          <span className="detail-label">Evaluation export</span>
          <h2>Portable quality artifact</h2>
        </div>
        <div className="snapshot-actions">
          <button type="button" onClick={onExportArtifact} disabled={isWorkflowBusy || isExportingArtifact}>
            {isExportingArtifact ? "Exporting..." : "Export evaluation artifact"}
          </button>
          {artifactDownload && (
            <a className="download-link" href={artifactDownload.href} download={artifactDownload.fileName}>
              Download evaluation artifact JSON
            </a>
          )}
        </div>
        {artifactDownload && (
          <p className="result-notice">
            {artifactDownload.summary}
          </p>
        )}
        {artifactError && <p className="result-notice error">{artifactError}</p>}
      </section>

      <section className="panel-card evaluation-trend-card" aria-label="Evaluation trends">
        <div>
          <span className="detail-label">Regression watch</span>
          <h2>{formatCount(comparableTrends.length, "comparison")}</h2>
        </div>
        {comparableTrends.length === 0 ? (
          <p className="empty-state">Run evaluations more than once to show score movement.</p>
        ) : (
          <div className="trend-grid">
            {comparableTrends.map((trend) => {
              const language = languages.find((item) => item.id === trend.languageId);
              const languageName = language?.name ?? trend.languageId;
              return (
                <article className={`trend-card ${trend.status}`} key={trend.languageId}>
                  <p>{languageName} {trendVerb(trend.status)} by {formatTrendPoints(trend.averageDelta)} since previous run.</p>
                  <div className="pill-row">
                    {Object.entries(trend.categoryDeltas)
                      .filter(([, delta]) => delta.delta !== null)
                      .map(([category, delta]) => (
                        <span className="pill trend-pill" key={`${trend.languageId}-${category}`}>
                          {category} {formatSignedTrendPoints(delta.delta)}
                        </span>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {activeRun && (
        <article className="panel-card eval-breakdown">
          <div className="record-topline">
            <div>
              <span className="detail-label">Latest run</span>
              <h2>{activeLanguage?.name ?? activeRun.languageId} score breakdown</h2>
            </div>
            <span className="id-badge">{new Date(activeRun.createdAt).toLocaleString()}</span>
          </div>
          <p className="eval-summary">{activeRun.summary}</p>
          <div className="score-bars">
            {Object.entries(activeRun.scores).map(([metric, score]) => (
              <ScoreBar key={metric} metric={metric} score={score} />
            ))}
          </div>
          {activeRun.failures.length > 0 && (
            <div className="failure-list">
              {activeRun.failures.map((failure) => (
                <p key={`${failure.category}-${failure.itemId}`}>
                  <strong>{failure.category}</strong> {failure.itemId}: {failure.message}
                </p>
              ))}
            </div>
          )}
        </article>
      )}
    </div>
  );
}

function LearnerView({
  exercises,
  selectedExercise,
  selectedExerciseId,
  isWorkflowBusy,
  exerciseAnswer,
  isGrading,
  exerciseResult,
  isLoadingSubmissions,
  submissionHistory,
  onSelectExercise,
  onAnswerChange,
  onGrade,
  onCreateExercise
}: {
  exercises: PublicExercise[];
  selectedExercise: PublicExercise | null;
  selectedExerciseId: string | null;
  isWorkflowBusy: boolean;
  exerciseAnswer: string;
  isGrading: boolean;
  exerciseResult: string | null;
  isLoadingSubmissions: boolean;
  submissionHistory: PublicExerciseSubmission[];
  onSelectExercise: (exerciseId: string) => void;
  onAnswerChange: (answer: string) => void;
  onGrade: () => void;
  onCreateExercise: (payload: ExerciseAuthoringPayload) => Promise<void>;
}) {
  const [authoringType, setAuthoringType] = useState<PublicExercise["type"]>("translate_to_target");
  const [authoringPrompt, setAuthoringPrompt] = useState("");
  const [authoringVocabulary, setAuthoringVocabulary] = useState("");
  const [authoringRules, setAuthoringRules] = useState("");
  const [authoringAnswers, setAuthoringAnswers] = useState("");
  const [authoringAdversarialAnswerOne, setAuthoringAdversarialAnswerOne] = useState("");
  const [authoringAdversarialReasonOne, setAuthoringAdversarialReasonOne] = useState("");
  const [authoringAdversarialAnswerTwo, setAuthoringAdversarialAnswerTwo] = useState("");
  const [authoringAdversarialReasonTwo, setAuthoringAdversarialReasonTwo] = useState("");
  const [authoringExplanation, setAuthoringExplanation] = useState("");
  const [authoringMessage, setAuthoringMessage] = useState<string | null>(null);
  const [authoringError, setAuthoringError] = useState<string | null>(null);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const hasTwoAdversarialProbes = authoringAdversarialAnswerOne.trim().length > 0
    && authoringAdversarialReasonOne.trim().length > 0
    && authoringAdversarialAnswerTwo.trim().length > 0
    && authoringAdversarialReasonTwo.trim().length > 0;
  const canCreateExercise = authoringPrompt.trim().length > 0
    && authoringVocabulary.trim().length > 0
    && authoringRules.trim().length > 0
    && authoringAnswers.trim().length > 0
    && hasTwoAdversarialProbes
    && authoringExplanation.trim().length > 0
    && !isWorkflowBusy
    && !isCreatingExercise;

  function clearAuthoringNotice() {
    setAuthoringMessage(null);
    setAuthoringError(null);
  }

  async function handleCreateExercise(event: FormEvent) {
    event.preventDefault();
    if (!canCreateExercise) return;

    const adversarialAnswers = [
      { answer: authoringAdversarialAnswerOne.trim(), reason: authoringAdversarialReasonOne.trim() },
      { answer: authoringAdversarialAnswerTwo.trim(), reason: authoringAdversarialReasonTwo.trim() }
    ];

    setIsCreatingExercise(true);
    setAuthoringMessage(null);
    setAuthoringError(null);
    try {
      await onCreateExercise({
        type: authoringType,
        prompt: authoringPrompt.trim(),
        allowedVocabulary: parseAuthoringList(authoringVocabulary),
        allowedRuleIds: parseAuthoringList(authoringRules),
        expectedAnswers: parseAuthoringList(authoringAnswers),
        adversarialAnswers,
        gradingExplanation: authoringExplanation.trim()
      });
      setAuthoringMessage("Exercise authored.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exercise authoring failed";
      setAuthoringError(message);
    } finally {
      setIsCreatingExercise(false);
    }
  }

  return (
    <div className="exercise-workbench">
      <section className="exercise-list" aria-label="Exercise selector">
        <div className="panel-heading">{exercises.length} exercises</div>
        {exercises.length === 0 ? (
          <p className="empty-state">No exercises available.</p>
        ) : (
          exercises.map((exercise) => (
            <button
              type="button"
              key={exercise.id}
              className={`exercise-item${(selectedExerciseId ?? selectedExercise?.id) === exercise.id ? " active" : ""}`}
              aria-pressed={(selectedExerciseId ?? selectedExercise?.id) === exercise.id}
              disabled={isWorkflowBusy}
              onClick={() => onSelectExercise(exercise.id)}
            >
              <span>{exercise.prompt}</span>
              <small>{EXERCISE_TYPE_LABELS[exercise.type]}</small>
            </button>
          ))
        )}
      </section>

      <section className="detail-panel exercise-detail" aria-label="Exercise detail panel">
        {selectedExercise ? (
          <article className="record-card" aria-label="Selected exercise detail">
            <span className="pill">{EXERCISE_TYPE_LABELS[selectedExercise.type]}</span>
            <h2>{selectedExercise.prompt}</h2>
            <dl className="detail-grid exercise-context">
              <div>
                <dt>Allowed vocabulary</dt>
                <dd className="token-list">
                  {selectedExercise.allowedVocabulary.map((token) => (
                    <code key={token}>{token}</code>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Rules</dt>
                <dd className="token-list">
                  {selectedExercise.allowedRuleIds.map((rule) => (
                    <span className="pill" key={rule}>{rule}</span>
                  ))}
                </dd>
              </div>
            </dl>

            <label className="field-label" htmlFor="exercise-answer">
              Exercise answer
            </label>
            <textarea
              id="exercise-answer"
              value={exerciseAnswer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="Type your answer here"
            />
            <button type="button" className="full-width" onClick={onGrade} disabled={isGrading || exerciseAnswer.trim().length === 0}>
              {isGrading ? "Grading..." : "Grade"}
            </button>
            {exerciseResult && (
              <p className="result-notice" role="status" aria-live="polite">
                {exerciseResult}
              </p>
            )}

            <section className="submission-history" aria-label="Exercise submission history">
              <h3>Submission History</h3>
              {isLoadingSubmissions ? (
                <p className="inline-empty" role="status" aria-live="polite">
                  Loading submissions.
                </p>
              ) : submissionHistory.length === 0 ? (
                <p className="inline-empty">No submissions yet.</p>
              ) : (
                <div className="detail-list">
                  {submissionHistory.map((submission) => (
                    <div key={submission.id} className="detail-row">
                      <strong>{formatSubmissionStatus(submission)}</strong>
                      <span>{submission.explanation}</span>
                      <span className="muted">{submission.submittedAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </article>
        ) : (
          <p className="empty-state">No exercises available.</p>
        )}

        <form className="record-card form-panel compact exercise-authoring-form" aria-label="Exercise authoring" onSubmit={handleCreateExercise}>
          <div>
            <span className="detail-label">Exercise authoring</span>
            <h3>Create learner task</h3>
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-type">Exercise type</label>
            <select
              id="exercise-author-type"
              value={authoringType}
              onChange={(event) => {
                setAuthoringType(event.target.value as PublicExercise["type"]);
                clearAuthoringNotice();
              }}
            >
              {Object.entries(EXERCISE_TYPE_LABELS).map(([type, label]) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-prompt">Exercise prompt</label>
            <textarea
              id="exercise-author-prompt"
              value={authoringPrompt}
              onChange={(event) => {
                setAuthoringPrompt(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-vocabulary">Allowed vocabulary</label>
            <input
              id="exercise-author-vocabulary"
              value={authoringVocabulary}
              onChange={(event) => {
                setAuthoringVocabulary(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-rules">Allowed rule IDs</label>
            <input
              id="exercise-author-rules"
              value={authoringRules}
              onChange={(event) => {
                setAuthoringRules(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-answers">Expected answers</label>
            <textarea
              id="exercise-author-answers"
              value={authoringAnswers}
              onChange={(event) => {
                setAuthoringAnswers(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-answer-one">Adversarial answer 1</label>
            <input
              id="exercise-author-adversarial-answer-one"
              value={authoringAdversarialAnswerOne}
              onChange={(event) => {
                setAuthoringAdversarialAnswerOne(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-reason-one">Adversarial reason 1</label>
            <input
              id="exercise-author-adversarial-reason-one"
              value={authoringAdversarialReasonOne}
              onChange={(event) => {
                setAuthoringAdversarialReasonOne(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-answer-two">Adversarial answer 2</label>
            <input
              id="exercise-author-adversarial-answer-two"
              value={authoringAdversarialAnswerTwo}
              onChange={(event) => {
                setAuthoringAdversarialAnswerTwo(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-adversarial-reason-two">Adversarial reason 2</label>
            <input
              id="exercise-author-adversarial-reason-two"
              value={authoringAdversarialReasonTwo}
              onChange={(event) => {
                setAuthoringAdversarialReasonTwo(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exercise-author-explanation">Grading explanation</label>
            <textarea
              id="exercise-author-explanation"
              value={authoringExplanation}
              onChange={(event) => {
                setAuthoringExplanation(event.target.value);
                clearAuthoringNotice();
              }}
            />
          </div>
          <button type="submit" className="secondary" disabled={!canCreateExercise}>
            {isCreatingExercise ? "Creating..." : "Create exercise"}
          </button>
          {authoringMessage && <p className="result-notice" role="status" aria-live="polite">{authoringMessage}</p>}
          {authoringError && <p className="result-notice error" role="alert">{authoringError}</p>}
        </form>
      </section>
    </div>
  );
}

function GovernanceView({
  selectedLanguageId,
  governanceState,
  auditEventState,
  policyType,
  policyEffectiveDate,
  policyContent,
  governanceSuccess,
  governanceError,
  isSubmittingGovernance,
  reviewPolicyState,
  reviewPolicyReviewerIds,
  reviewPolicyApprovalThreshold,
  reviewPolicyRequiresAssigned,
  reviewPolicySuccess,
  reviewPolicyError,
  isSubmittingReviewPolicy,
  reviewDispositionState,
  reviewDispositionDrafts,
  reviewDispositionSuccess,
  reviewDispositionError,
  resolvingReviewDispositionId,
  snapshotDownload,
  snapshotError,
  isExportingSnapshot,
  onPolicyTypeChange,
  onEffectiveDateChange,
  onContentChange,
  onSubmit,
  onReviewPolicyReviewerIdsChange,
  onReviewPolicyApprovalThresholdChange,
  onReviewPolicyRequiresAssignedChange,
  onReviewPolicySubmit,
  onReviewDispositionDraftChange,
  onResolveReviewDisposition,
  onExportSnapshot
}: {
  selectedLanguageId: string;
  governanceState: AsyncState<GovernanceRecord[]>;
  auditEventState: AsyncState<AuditEvent[]>;
  policyType: GovernanceRecord["policyType"];
  policyEffectiveDate: string;
  policyContent: string;
  governanceSuccess: string | null;
  governanceError: string | null;
  isSubmittingGovernance: boolean;
  reviewPolicyState: AsyncState<ReviewPolicy>;
  reviewPolicyReviewerIds: string;
  reviewPolicyApprovalThreshold: string;
  reviewPolicyRequiresAssigned: boolean;
  reviewPolicySuccess: string | null;
  reviewPolicyError: string | null;
  isSubmittingReviewPolicy: boolean;
  reviewDispositionState: AsyncState<ReviewDisposition[]>;
  reviewDispositionDrafts: Record<string, string>;
  reviewDispositionSuccess: string | null;
  reviewDispositionError: string | null;
  resolvingReviewDispositionId: string | null;
  snapshotDownload: SnapshotDownload | null;
  snapshotError: string | null;
  isExportingSnapshot: boolean;
  onPolicyTypeChange: (value: GovernanceRecord["policyType"]) => void;
  onEffectiveDateChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onReviewPolicyReviewerIdsChange: (value: string) => void;
  onReviewPolicyApprovalThresholdChange: (value: string) => void;
  onReviewPolicyRequiresAssignedChange: (value: boolean) => void;
  onReviewPolicySubmit: (event: FormEvent) => void;
  onReviewDispositionDraftChange: (dispositionId: string, summary: string) => void;
  onResolveReviewDisposition: (dispositionId: string) => void;
  onExportSnapshot: () => void;
}) {
  const records = governanceState.status === "ready"
    ? governanceState.data.filter((record) => record.languageId === selectedLanguageId)
    : [];
  const reviewDispositions = reviewDispositionState.status === "ready"
    ? reviewDispositionState.data.filter((disposition) => disposition.languageId === selectedLanguageId)
    : [];
  const auditEvents = auditEventState.status === "ready"
    ? auditEventState.data.filter((event) => event.languageId === selectedLanguageId)
    : [];
  const loadedReviewPolicy = reviewPolicyState.status === "ready" ? reviewPolicyState.data : null;
  const reviewPolicySummary = loadedReviewPolicy ? `${loadedReviewPolicy.approvalThreshold} approvals required` : null;

  return (
    <div className="governance-view">
      <section className="policy-card">
        <p className="eyebrow">Deployment policy</p>
        <h2>Data Stewardship Policy</h2>
        <p>
          This platform operates under a <strong>Local Data Stewardship Policy</strong>. Every source is ingested with
          provenance and consent records, processing happens on this machine, and all model outputs must remain
          reviewable by authorized local users before teaching content is promoted.
        </p>
      </section>

      <section className="policy-card">
        <form className="form-panel compact" onSubmit={onSubmit}>
          <p className="eyebrow">Policy authoring</p>
          <h2>Create policy record</h2>

          {governanceSuccess && <p className="result-notice">{governanceSuccess}</p>}
          {governanceError && <p className="result-notice error">{governanceError}</p>}

          <div className="form-group">
            <label htmlFor="policy-type">Policy type</label>
            <select
              id="policy-type"
              value={policyType}
              onChange={(event) => onPolicyTypeChange(event.target.value as GovernanceRecord["policyType"])}
            >
              <option value="generation">Generation</option>
              <option value="access">Access</option>
              <option value="consent">Consent</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="policy-effective-date">Effective date</label>
            <input
              id="policy-effective-date"
              type="text"
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              value={policyEffectiveDate}
              onChange={(event) => onEffectiveDateChange(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="policy-content">Policy content</label>
            <textarea
              id="policy-content"
              value={policyContent}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder="Write a consent, access, or generation rule"
            />
          </div>

          <button type="submit" disabled={isSubmittingGovernance}>
            {isSubmittingGovernance ? "Recording..." : "Create policy record"}
          </button>
        </form>
      </section>

      <section className="policy-card">
        <form className="form-panel compact" onSubmit={onReviewPolicySubmit}>
          <p className="eyebrow">Review routing</p>
          <h2>Review policy</h2>

          {reviewPolicySuccess && <p className="result-notice">{reviewPolicySuccess}</p>}
          {reviewPolicyError && <p className="result-notice error">{reviewPolicyError}</p>}
          {reviewPolicyState.status === "loading" && (
            <p className="inline-empty" role="status" aria-live="polite">
              Loading review policy.
            </p>
          )}
          {reviewPolicyState.status === "error" && (
            <p className="inline-empty error" role="alert">
              {reviewPolicyState.message}
            </p>
          )}
          {reviewPolicySummary && (
            <p className="review-policy-summary">
              <strong>{reviewPolicySummary}</strong>
              <span>
                {loadedReviewPolicy?.requiresAssignedReviewer ? "assigned reviewers only" : "authorized reviewers"}
              </span>
            </p>
          )}

          <div className="form-group">
            <label htmlFor="review-policy-reviewers">Assigned reviewer IDs</label>
            <input
              id="review-policy-reviewers"
              type="text"
              value={reviewPolicyReviewerIds}
              onChange={(event) => onReviewPolicyReviewerIdsChange(event.target.value)}
              placeholder="reviewer-1, elder-1"
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-policy-threshold">Approval threshold</label>
            <input
              id="review-policy-threshold"
              type="number"
              min="1"
              inputMode="numeric"
              value={reviewPolicyApprovalThreshold}
              onChange={(event) => onReviewPolicyApprovalThresholdChange(event.target.value)}
            />
          </div>

          <label className="checkbox-row" htmlFor="review-policy-requires-assigned">
            <input
              id="review-policy-requires-assigned"
              type="checkbox"
              checked={reviewPolicyRequiresAssigned}
              onChange={(event) => onReviewPolicyRequiresAssignedChange(event.target.checked)}
            />
            <span>Require assigned reviewer</span>
          </label>

          <button type="submit" disabled={isSubmittingReviewPolicy}>
            {isSubmittingReviewPolicy ? "Updating..." : "Update review policy"}
          </button>
        </form>
      </section>

      <section className="policy-card disposition-ledger" aria-label="Review disposition work">
        <p className="eyebrow">Resolution workflow</p>
        <h2>Review disposition work</h2>

        {reviewDispositionSuccess && <p className="result-notice" role="status">{reviewDispositionSuccess}</p>}
        {reviewDispositionError && <p className="result-notice error">{reviewDispositionError}</p>}

        {reviewDispositionState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            Loading review disposition work.
          </p>
        )}

        {reviewDispositionState.status === "error" && (
          <p className="inline-empty error" role="alert">
            {reviewDispositionState.message}
          </p>
        )}

        {reviewDispositionState.status === "ready" && reviewDispositions.length === 0 && (
          <p className="inline-empty">No review disposition work for this language.</p>
        )}

        {reviewDispositions.length > 0 && (
          <div className="disposition-list">
            {reviewDispositions.map((disposition) => {
              const resolutionInputId = `resolution-${safeDomId(disposition.id)}`;
              const resolutionDraft = reviewDispositionDrafts[disposition.id] ?? "";
              const isResolving = resolvingReviewDispositionId === disposition.id;
              return (
                <article key={disposition.id} className="disposition-card">
                  <div className="record-topline">
                    <div>
                      <span className="detail-label">{disposition.id}</span>
                      <h3>{REVIEW_DISPOSITION_LABELS[disposition.disposition]}</h3>
                    </div>
                    <span className={`status-badge ${disposition.status}`}>{formatStatus(disposition.status)}</span>
                  </div>
                  <p>{disposition.reason}</p>
                  <div className="pill-row">
                    <span className="pill">Note: {disposition.noteId}</span>
                    <span className="pill">Assigned to {disposition.assignedTo}</span>
                    {disposition.dueAt && <span className="pill">Due {disposition.dueAt}</span>}
                    <span className="pill">Opened by {disposition.openedBy}</span>
                  </div>

                  {disposition.status === "resolved" ? (
                    <div className="resolution-summary">
                      {disposition.resolvedBy && <strong>Resolved by {disposition.resolvedBy}</strong>}
                      {disposition.resolutionSummary && <p>{disposition.resolutionSummary}</p>}
                    </div>
                  ) : (
                    <div className="resolution-form">
                      <div className="form-group">
                        <label htmlFor={resolutionInputId}>Resolution summary for {disposition.id}</label>
                        <textarea
                          id={resolutionInputId}
                          value={resolutionDraft}
                          onChange={(event) => onReviewDispositionDraftChange(disposition.id, event.target.value)}
                          placeholder="Record the review decision, correction, or follow-up evidence."
                        />
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        disabled={isResolving || resolutionDraft.trim().length === 0}
                        onClick={() => onResolveReviewDisposition(disposition.id)}
                      >
                        {isResolving ? `Resolving ${disposition.id}...` : `Resolve ${disposition.id}`}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="policy-card audit-ledger" aria-label="Audit event ledger">
        <p className="eyebrow">Mutation trace</p>
        <h2>Audit event ledger</h2>

        {auditEventState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            Loading audit events.
          </p>
        )}

        {auditEventState.status === "error" && (
          <p className="inline-empty error" role="alert">
            {auditEventState.message}
          </p>
        )}

        {auditEventState.status === "ready" && auditEvents.length === 0 && (
          <p className="inline-empty">No audit events for this language yet.</p>
        )}

        {auditEvents.length > 0 && (
          <div className="audit-event-list">
            {auditEvents.slice().reverse().slice(0, 12).map((event) => (
              <article key={event.id} className="audit-event-card">
                <div className="record-topline">
                  <div>
                    <span className="detail-label">{event.at}</span>
                    <h3>{event.action}</h3>
                  </div>
                  <span className="status-badge under_review">{event.actorRole}</span>
                </div>
                <p>{event.summary}</p>
                <div className="pill-row">
                  <span className="pill">{event.actorId}</span>
                  <span className="pill">{event.entityType} / {event.entityId}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="policy-card snapshot-card">
        <p className="eyebrow">Review export</p>
        <h2>Language snapshot</h2>
        <p>
          Build a sanitized JSON packet for this language with corpus, public notes, public exercises, governance records,
          and evaluation summaries. Answer keys and learner submissions stay out of the export.
        </p>
        <div className="snapshot-actions">
          <button type="button" className="secondary" disabled={isExportingSnapshot} onClick={onExportSnapshot}>
            {isExportingSnapshot ? "Exporting..." : "Export review snapshot"}
          </button>
          {snapshotDownload && (
            <a className="download-link" href={snapshotDownload.href} download={snapshotDownload.fileName}>
              Download snapshot JSON
            </a>
          )}
        </div>
        {snapshotDownload && (
          <p className="result-notice" role="status">
            {snapshotDownload.summary}
          </p>
        )}
        {snapshotError && <p className="result-notice error">{snapshotError}</p>}
      </section>

      <div className="table-card">
        <h2>Policy Records</h2>

        {governanceState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">
            Loading governance records.
          </p>
        )}

        {governanceState.status === "error" && (
          <p className="inline-empty error" role="alert">
            {governanceState.message}
          </p>
        )}

        {governanceState.status === "ready" && records.length === 0 && (
          <p className="inline-empty">No governance policy records for this language yet.</p>
        )}

        {records.length > 0 && (
          <table className="data-table governance-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Policy</th>
                <th>Effective</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{POLICY_TYPE_LABELS[record.policyType]}</td>
                  <td>{record.content}</td>
                  <td>{record.effectiveDate}</td>
                  <td>{record.approvedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ModelSetupView({
  llmState,
  observabilityState,
  isTestingModel,
  modelTestResult,
  modelTestIsPlaceholder,
  onSmokeTest,
  isCheckingReachability,
  reachabilityResult,
  reachabilityError,
  onTestConnection
}: {
  llmState: AsyncState<LlmStatus>;
  observabilityState: AsyncState<ObservabilityData>;
  isTestingModel: boolean;
  modelTestResult: string | null;
  modelTestIsPlaceholder: boolean;
  onSmokeTest: () => void;
  isCheckingReachability: boolean;
  reachabilityResult: LlmReachability | null;
  reachabilityError: string | null;
  onTestConnection: () => void;
}) {
  if (llmState.status === "loading" || llmState.status === "idle") {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Checking model provider configuration...
      </div>
    );
  }

  if (llmState.status === "error") {
    return (
      <div className="panel-card error" role="alert">
        {llmState.message}
      </div>
    );
  }

  const status = llmState.data;
  const observability = observabilityState.status === "ready" ? observabilityState.data : null;
  const recentSessions = observability?.sessions.slice(0, 5) ?? [];
  return (
    <div className="model-grid">
      <section className="panel-card model-status" aria-label="LLM provider readiness">
        <div className="record-topline">
          <div>
            <span className="detail-label">Provider readiness</span>
            <h2>{status.configured ? "Ready" : "Needs configuration"}</h2>
          </div>
          <span className={`status-badge ${status.configured ? "approved" : "under_review"}`}>
            {status.configured ? "Configured" : "Incomplete"}
          </span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Mode</dt>
            <dd>{formatMode(status.mode)}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{status.provider}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{status.model ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd>{status.baseUrl ?? "Not set"}</dd>
          </div>
          <div>
            <dt>API key</dt>
            <dd>{status.apiKey.configured ? "Configured server-side" : status.apiKey.required ? "Required" : "Optional / not set"}</dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{status.timeoutMs}ms</dd>
          </div>
        </dl>
        <p className="privacy-note">
          API keys are never entered in the browser or returned by the status endpoint. Configure keys only in the API server
          environment.
        </p>
        {status.warnings.length > 0 && (
          <div className="warning-list">
            {status.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <div className="model-actions">
          <button type="button" onClick={onSmokeTest} disabled={isTestingModel}>
            {isTestingModel ? "Testing provider..." : "Run provider smoke test"}
          </button>
          <button type="button" className="secondary" onClick={onTestConnection} disabled={isCheckingReachability}>
            {isCheckingReachability ? "Testing…" : "Test connection"}
          </button>
        </div>
        {modelTestResult && (
          <>
            {modelTestIsPlaceholder && (
              <p className="result-notice warning" role="status" aria-live="polite">
                Offline placeholder — no model is configured, so this is a canned response, not a real model reply.
                Configure a provider in the variables below and restart the API.
              </p>
            )}
            <p className="result-notice" role="status" aria-live="polite">
              {modelTestResult}
            </p>
          </>
        )}
        {reachabilityError && (
          <p className="result-notice error" role="alert">
            {reachabilityError}
          </p>
        )}
        {reachabilityResult && (
          <p className="result-notice" role="status" aria-live="polite">
            {formatReachability(reachabilityResult)}
          </p>
        )}
      </section>

      <section className="panel-card model-observability" aria-label="Model session observability">
        <div className="record-topline">
          <div>
            <span className="detail-label">Session observability</span>
            <h2>{observability ? `${observability.totals.sessions} sessions` : "Loading sessions"}</h2>
          </div>
          {observability && (
            <span className={`status-badge ${countFailedSessions(observability) > 0 ? "contested" : "approved"}`}>
              {countFailedSessions(observability)} failed
            </span>
          )}
        </div>
        {observabilityState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">Loading AI session observability...</p>
        )}
        {observabilityState.status === "error" && (
          <p className="inline-error" role="alert">{observabilityState.message}</p>
        )}
        {observability && (
          <>
            <dl className="detail-grid">
              <div>
                <dt>Active</dt>
                <dd>{observability.totals.activeSessions}</dd>
              </div>
              <div>
                <dt>Failed</dt>
                <dd>{countFailedSessions(observability)}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{observability.totals.messages}</dd>
              </div>
              <div>
                <dt>Elder corrections</dt>
                <dd>{observability.totals.elderCorrections}</dd>
              </div>
            </dl>
            {recentSessions.length === 0 ? (
              <p className="inline-empty">No AI sessions recorded.</p>
            ) : (
              <div className="detail-list session-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="detail-row session-row">
                    <StatusBadge status={session.status} />
                    <strong>{formatStatus(session.mode)}</strong>
                    <span>{session.languageId}</span>
                    <span>{formatCount(session.messageCount, "message")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel-card setup-card" aria-label="Local LLM setup instructions">
        <span className="detail-label">Local OpenAI-compatible endpoints</span>
        <h2>Ollama, LM Studio, or llama.cpp</h2>
        <p>Start a local server that exposes <code>/v1/chat/completions</code>, then set the API process environment:</p>
        <div className="command-list">
          {status.setup.localExamples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </section>

      <section className="panel-card setup-card" aria-label="Remote API setup instructions">
        <span className="detail-label">Remote API key integration</span>
        <h2>Server-side keys only</h2>
        <p>For hosted OpenAI-compatible APIs, keep the key in the API process and let the backend proxy safe requests.</p>
        <div className="command-list">
          {status.setup.remoteExamples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </section>
    </div>
  );
}

function ElderWorkspace({
  data,
  elderContext,
  isLoadingElder,
  formNoteId,
  formPassageId,
  formSeverity,
  formCorrection,
  formRationale,
  formContextText,
  correctionSuccess,
  correctionError,
  isWorkflowBusy,
  isSubmittingCorrection,
  reviewingCorrectionId,
  applyingCorrectionId,
  correctionApplyDrafts,
  onSubmit,
  onNoteChange,
  onPassageChange,
  onSeverityChange,
  onCorrectionChange,
  onRationaleChange,
  onContextChange,
  onReviewCorrection,
  onApplyDraftChange,
  onApplyCorrection
}: {
  data: DashboardData;
  elderContext: ElderContext | null;
  isLoadingElder: boolean;
  formNoteId: string;
  formPassageId: string;
  formSeverity: ElderCorrection["severity"];
  formCorrection: string;
  formRationale: string;
  formContextText: string;
  correctionSuccess: string | null;
  correctionError: string | null;
  isWorkflowBusy: boolean;
  isSubmittingCorrection: boolean;
  reviewingCorrectionId: string | null;
  applyingCorrectionId: string | null;
  correctionApplyDrafts: Record<string, string>;
  onSubmit: (event: FormEvent) => void;
  onNoteChange: (value: string) => void;
  onPassageChange: (value: string) => void;
  onSeverityChange: (value: ElderCorrection["severity"]) => void;
  onCorrectionChange: (value: string) => void;
  onRationaleChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onReviewCorrection: (correctionId: string, status: ElderCorrectionReviewStatus) => void;
  onApplyDraftChange: (correctionId: string, explanation: string) => void;
  onApplyCorrection: (correctionId: string, explanation: string) => void;
}) {
  if (isLoadingElder) {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        Loading elder workspace...
      </div>
    );
  }

  return (
    <div className="elder-layout">
      <section className="detail-panel" aria-label="Submit Correction">
        <form onSubmit={onSubmit} className="form-panel">
          <span className="detail-label">Community review</span>
          <h2>Propose correction</h2>

          {correctionSuccess && <p className="result-notice">{correctionSuccess}</p>}
          {correctionError && <p className="result-notice error">{correctionError}</p>}

          <div className="form-group">
            <label htmlFor="form-severity">Severity Rating</label>
            <select id="form-severity" value={formSeverity} onChange={(event) => onSeverityChange(event.target.value as ElderCorrection["severity"])}>
              <option value="minor">Minor - wording or typo</option>
              <option value="major">Major - grammar or paradigm drift</option>
              <option value="safety">Safety - policy or community drift</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-note">Link to Note (Optional)</label>
            <select id="form-note" value={formNoteId} onChange={(event) => onNoteChange(event.target.value)}>
              <option value="">No note linked</option>
              {data.notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.topic} ({note.status})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-passage">Link to Passage (Optional)</label>
            <select id="form-passage" value={formPassageId} onChange={(event) => onPassageChange(event.target.value)}>
              <option value="">No passage linked</option>
              {data.corpus.map((passage) => (
                <option key={passage.id} value={passage.id}>
                  {passage.id} - {passage.textTarget}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-context">Context Snippet (Optional)</label>
            <input
              id="form-context"
              type="text"
              value={formContextText}
              onChange={(event) => onContextChange(event.target.value)}
              placeholder="Paste the relevant source text"
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-correction">Correction Instruction</label>
            <textarea
              id="form-correction"
              value={formCorrection}
              onChange={(event) => onCorrectionChange(event.target.value)}
              placeholder="Describe the correction to apply"
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-rationale">Linguistic Rationale</label>
            <textarea
              id="form-rationale"
              value={formRationale}
              onChange={(event) => onRationaleChange(event.target.value)}
              placeholder="Explain the linguistic rationale"
            />
          </div>

          <button type="submit" className="full-width" disabled={isWorkflowBusy || !formCorrection.trim() || !formRationale.trim()}>
            {isSubmittingCorrection ? "Submitting..." : "Submit correction"}
          </button>
        </form>
      </section>

      <section className="detail-panel" aria-label="Elder corrections list">
        <span className="detail-label">Submitted corrections</span>
        <h2>Correction ledger</h2>
        {!elderContext || elderContext.corrections.length === 0 ? (
          <p className="empty-state">No corrections submitted for this language.</p>
        ) : (
          <div className="corrections-list">
            {elderContext.corrections.slice().reverse().map((correction) => {
              const linkedNote = correction.noteId
                ? elderContext.notes.find((note) => note.id === correction.noteId)
                : undefined;
              const applyDraft = correctionApplyDrafts[correction.id] ?? linkedNote?.explanation ?? "";
              const applyInputId = `apply-${correction.id}`;

              return (
                <article key={correction.id} className="correction-card">
                  <div className="correction-header">
                    <h3>{correction.id}</h3>
                    <span className={`severity-tag ${correction.severity}`}>{correction.severity}</span>
                  </div>
                  <p>
                    <strong>Correction:</strong> {correction.correction}
                  </p>
                  <p>
                    <strong>Rationale:</strong> {correction.rationale}
                  </p>
                  <div className="pill-row">
                    <span className="pill">Status: {correction.status}</span>
                    {correction.noteId && <span className="pill">Note: {correction.noteId}</span>}
                    {correction.passageId && <span className="pill">Passage: {correction.passageId}</span>}
                    {correction.reviewedBy && <span className="pill">Reviewed by {correction.reviewedBy}</span>}
                  </div>
                  {correction.status === "pending_review" && (
                    <div className="correction-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={isWorkflowBusy || reviewingCorrectionId === correction.id}
                        onClick={() => onReviewCorrection(correction.id, "accepted")}
                      >
                        {reviewingCorrectionId === correction.id ? "Reviewing..." : `Accept correction ${correction.id}`}
                      </button>
                      <button
                        type="button"
                        className="contest"
                        disabled={isWorkflowBusy || reviewingCorrectionId === correction.id}
                        onClick={() => onReviewCorrection(correction.id, "rejected")}
                      >
                        Reject correction {correction.id}
                      </button>
                    </div>
                  )}
                  {correction.status === "accepted" && correction.noteId && (
                    <div className="correction-apply">
                      <label htmlFor={applyInputId}>Revised explanation for {correction.id}</label>
                      <textarea
                        id={applyInputId}
                        value={applyDraft}
                        onChange={(event) => onApplyDraftChange(correction.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary"
                        disabled={isWorkflowBusy || applyingCorrectionId === correction.id || !applyDraft.trim()}
                        onClick={() => onApplyCorrection(correction.id, applyDraft)}
                      >
                        {applyingCorrectionId === correction.id ? "Applying..." : `Apply correction ${correction.id}`}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
