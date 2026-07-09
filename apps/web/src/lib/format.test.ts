import { describe, expect, it } from "vitest";
import type { AiSession } from "@assini/db";
import type { LanguageSnapshot, LlmReachability } from "../api";
import { ApiError } from "./apiClient";
import {
  buildEvaluationArtifactDownload,
  buildSnapshotDownload,
  extractionDraftSummary,
  formatIntegrityLabel,
  formatMetric,
  formatMode,
  formatOrthographyMeta,
  formatReachability,
  formatSignedTrendPoints,
  formatSnapshotReviewAccountability,
  formatStatus,
  formatSubmissionStatus,
  formatTrendPoints,
  formatTypology,
  latestAssistantMessage,
  localizeApiError,
  localizeSourceProcessingError,
  localizeSourceProcessingWarning,
  localizeVaultImportError,
  trendVerb
} from "./format";
import { en } from "../i18n/en";
import { createTranslator, type Translate } from "../i18n";
import type { EvaluationArtifact, ExtractionDraft, PublicExerciseSubmission } from "../api";

const t: Translate = (key, vars) => {
  let message: string = en[key];
  if (!vars) return message;
  for (const [name, value] of Object.entries(vars)) {
    message = message.replace(`{${name}}`, String(value));
  }
  return message;
};

const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
] as const;

function createSnapshot(notes: LanguageSnapshot["notes"]): LanguageSnapshot {
  return {
    exportVersion: "language-snapshot-v2",
    exportedAt: "2026-06-06T00:00:00.000Z",
    integrity: {
      algorithm: "sha256",
      contentHash: "0123456789abcdef",
      generatedBy: "assini-local-export-v1",
      redactionPolicy: [...EXPORT_REDACTION_POLICY]
    },
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Agglutinative test language.",
      orthography: "Latin",
      status: "active"
    },
    linguisticProfile: {
      phonology: null,
      vocabulary: [],
      morphemeInventory: [],
      grammarRules: [],
      stats: {
        vocabularyItems: 0,
        grammarRules: 0,
        corpusPassages: 0,
        notes: notes.length,
        exercises: 0,
        sourceAssets: 0,
        pendingExtractionDrafts: 0,
        exerciseTypes: {}
      }
    },
    corpus: [],
    notes,
    exercises: [],
    governance: [],
    evaluations: []
  };
}

describe("formatSnapshotReviewAccountability", () => {
  it("returns undefined when every note is approved", () => {
    expect(formatSnapshotReviewAccountability([
      {
        id: "note-1",
        languageId: "avenik",
        topic: "verb chains",
        explanation: "Approved note.",
        examples: [],
        evidencePassageIds: [],
        evidenceCount: 0,
        confidence: "high",
        status: "approved",
        reviewer: { lastReviewedBy: "reviewer-1", lastReviewedAt: "2026-06-01T00:00:00.000Z", comments: [] },
        dialectScope: "baseline",
        editHistory: []
      }
    ])).toBeUndefined();
  });

  it("counts notes that still need review accountability", () => {
    expect(formatSnapshotReviewAccountability([
      {
        id: "note-1",
        languageId: "avenik",
        topic: "verb chains",
        explanation: "Draft note.",
        examples: [],
        evidencePassageIds: [],
        evidenceCount: 0,
        confidence: "medium",
        status: "draft",
        reviewer: { lastReviewedBy: null, lastReviewedAt: null, comments: [] },
        dialectScope: "baseline",
        editHistory: []
      },
      {
        id: "note-2",
        languageId: "avenik",
        topic: "case particles",
        explanation: "Under review note.",
        examples: [],
        evidencePassageIds: [],
        evidenceCount: 0,
        confidence: "medium",
        status: "under_review",
        reviewer: { lastReviewedBy: null, lastReviewedAt: null, comments: [] },
        dialectScope: "baseline",
        editHistory: []
      }
    ], t)).toBe("2 notes still need review");
  });
});

describe("buildSnapshotDownload", () => {
  it("includes review accountability in the export summary when notes are not all approved", () => {
    const download = buildSnapshotDownload(createSnapshot([
      {
        id: "note-1",
        languageId: "avenik",
        topic: "verb chains",
        explanation: "Draft note.",
        examples: [],
        evidencePassageIds: [],
        evidenceCount: 0,
        confidence: "medium",
        status: "draft",
        reviewer: { lastReviewedBy: null, lastReviewedAt: null, comments: [] },
        dialectScope: "baseline",
        editHistory: []
      }
    ]), t);

    expect(download.summary).toContain("1 note still needs review");
    expect(download.summary).toContain("integrity sha256:0123456789ab");
  });
});

describe("formatIntegrityLabel and evaluation artifact summaries", () => {
  it("localizes integrity labels and evaluation artifact ready summaries", () => {
    expect(formatIntegrityLabel({
      algorithm: "sha256",
      contentHash: "fedcba9876543210",
      generatedBy: "assini-local-export-v1",
      redactionPolicy: [...EXPORT_REDACTION_POLICY]
    }, t)).toBe("integrity sha256:fedcba987654");

    const artifact = {
      exportVersion: "evaluation-artifact-v2",
      exportedAt: "2026-06-06T00:00:00.000Z",
      integrity: {
        algorithm: "sha256",
        contentHash: "fedcba9876543210",
        generatedBy: "assini-local-export-v1",
        redactionPolicy: [...EXPORT_REDACTION_POLICY]
      },
      summary: {
        languages: 1,
        totalRuns: 1,
        latestRuns: 1,
        failedLatestRuns: 0,
        regressedLatestRuns: 0,
        improvedLatestRuns: 0,
        stableLatestRuns: 0,
        singleRunLanguages: 1,
        averageLatestScore: 0.85,
        passed: true,
        failureCount: 0
      },
      latestRuns: [],
      runsByLanguage: {},
      trends: [],
      failureLines: []
    } as EvaluationArtifact;

    expect(buildEvaluationArtifactDownload(artifact, t).summary).toBe(
      "Evaluation artifact ready: 1 latest run, 0 failed latest runs, 0 regressed latest runs, 0 failure lines, 85% average latest score, integrity sha256:fedcba987654."
    );
  });
});

describe("extractionDraftSummary", () => {
  it("localizes missing payload placeholders for each draft kind", () => {
    const base = {
      id: "draft-1",
      languageId: "avenik",
      sourceAssetId: "src-1",
      confidence: "medium" as const,
      status: "proposed" as const,
      createdAt: "2026-06-06T00:00:00.000Z",
      payload: {
        tags: [],
        morphologicalSegmentation: [],
        topicTags: []
      }
    };

    expect(extractionDraftSummary({
      ...base,
      kind: "lexeme",
      payload: { ...base.payload }
    } as ExtractionDraft, t)).toBe("(no form) — (no gloss)");

    expect(extractionDraftSummary({
      ...base,
      kind: "corpus_passage",
      payload: { ...base.payload, textTarget: "mira talo" }
    } as ExtractionDraft, t)).toBe("mira talo — (no translation)");

    expect(extractionDraftSummary({
      ...base,
      kind: "grammar_note",
      payload: { ...base.payload, topic: "verb chains", explanation: "Suffix chains." }
    } as ExtractionDraft, t)).toBe("verb chains — Suffix chains.");
  });
});

describe("localizeApiError", () => {
  it("localizes rate-limited API failures with retry guidance", () => {
    const message = localizeApiError(
      new ApiError("Request failed: /dashboard (429): Rate limit exceeded Retry after 9 seconds.", { status: 429 }),
      t,
      "app.workspaceUnavailable"
    );

    expect(message).toBe("Too many requests. Wait 9 seconds, then retry.");
  });

  it("localizes offline provider failures", () => {
    const message = localizeApiError(
      new ApiError("Request failed: /llm/status (503): LLM provider is offline", { status: 503 }),
      t,
      "app.workspaceUnavailable"
    );

    expect(message).toBe("The configured model provider is offline. Check Runtime settings or try again later.");
  });

  it("localizes expired prototype sessions with recovery guidance", () => {
    const message = localizeApiError(
      new ApiError("Request failed: /dashboard (401): Unauthorized", { status: 401 }),
      t,
      "app.workspaceUnavailable"
    );

    expect(message).toBe(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
  });

  it("localizes vault allowlist failures with operator guidance", () => {
    const message = localizeVaultImportError(
      new Error(
        "Obsidian vault import failed (400): Obsidian vault path is outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist."
      ),
      t,
      "ingest.vaultImportFailed"
    );

    expect(message).toBe(
      "That folder is outside the allowed vault roots. Update ASSINI_OBSIDIAN_VAULT_ROOTS or choose a folder under an allowed root."
    );
  });

  it("localizes unreadable vault paths", () => {
    const message = localizeVaultImportError(
      new Error("Obsidian vault import failed (400): Obsidian vault path could not be read."),
      t,
      "ingest.vaultImportFailed"
    );

    expect(message).toBe(
      "That folder could not be read. Check the path exists and AssiniLang can access it."
    );
  });

  it("localizes OCR setup failures from persisted source errors", () => {
    const message = localizeSourceProcessingError(
      "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs (page 1 only).",
      t,
      "ingest.sourceProcessingFailed"
    );

    expect(message).toBe(
      "This document needs OCR. Set an OCR base URL in Runtime settings (Model tab), then process again."
    );
  });

  it("passes fallback params when a processing error is empty", () => {
    const message = localizeSourceProcessingError(
      "   ",
      t,
      "ingest.processingFailed",
      { title: "River notes" }
    );

    expect(message).toBe("Processing River notes failed.");
  });

  it("localizes multi-page PDF OCR warnings", () => {
    const message = localizeSourceProcessingWarning(
      "PDF has 4 pages; only page 1 was OCR'd. Split remaining pages into separate sources if you need them.",
      t
    );

    expect(message).toBe(
      "PDF has 4 pages; only page 1 was OCR'd. Split remaining pages into separate sources if you need them."
    );
  });

  it("localizes empty DOCX OCR-unsupported failures from persisted source errors", () => {
    const message = localizeSourceProcessingError(
      "The document contains no extractable text — it may be a scanned image; OCR is not supported yet.",
      t,
      "ingest.sourceProcessingFailed"
    );

    expect(message).toBe(
      "This document has no extractable text, and DOCX OCR is not supported yet. Export pages as images or paste the text, then process again."
    );
  });
});

describe("formatReachability", () => {
  it("localizes unchecked, reachable, and unreachable connection results", () => {
    const unchecked: LlmReachability = {
      checked: false,
      reachable: false,
      mode: "deterministic"
    };
    expect(formatReachability(unchecked, t)).toBe("No external provider configured.");

    const reachable: LlmReachability = {
      checked: true,
      reachable: true,
      mode: "local-openai-compatible",
      latencyMs: 42
    };
    expect(formatReachability(reachable, t)).toBe("Reachable (local openai compatible, 42 ms)");
    expect(formatReachability(reachable, createTranslator("ar"))).toBe(
      "قابل للوصول (محلي متوافق مع OpenAI، 42 مللي ثانية)"
    );

    const unreachable: LlmReachability = {
      checked: true,
      reachable: false,
      mode: "remote-api",
      detail: "connection refused"
    };
    expect(formatReachability(unreachable, t)).toBe("Unreachable: connection refused");
  });
});

describe("formatSubmissionStatus", () => {
  it("localizes accepted and needs-review submission labels", () => {
    const accepted = { accepted: true } as PublicExerciseSubmission;
    const needsReview = { accepted: false } as PublicExerciseSubmission;
    expect(formatSubmissionStatus(accepted, t)).toBe("Accepted");
    expect(formatSubmissionStatus(needsReview, t)).toBe("Needs review");
    expect(formatSubmissionStatus(accepted)).toBe("Accepted");
  });
});

describe("formatOrthographyMeta", () => {
  it("localizes default, named, and truncated orthography labels", () => {
    expect(formatOrthographyMeta(undefined, t)).toBe("Latin orthography");
    expect(formatOrthographyMeta("Latin", t)).toBe("Latin orthography");
    expect(formatOrthographyMeta("x".repeat(35), t)).toBe("Latin morphology hyphenation");
  });
});

describe("latestAssistantMessage", () => {
  it("returns assistant content when present and a localized empty-session fallback otherwise", () => {
    const withReply = {
      messages: [{ role: "assistant", content: "Practice with verb chains." }]
    } as unknown as AiSession;
    expect(latestAssistantMessage(withReply, t)).toBe("Practice with verb chains.");

    const empty = { messages: [] } as unknown as AiSession;
    expect(latestAssistantMessage(empty, t)).toBe(
      "Session created, but no assistant message was returned."
    );
  });
});

describe("formatMode", () => {
  it("localizes known provider modes and falls back to hyphen-stripped labels", () => {
    expect(formatMode("local-openai-compatible", t)).toBe("local openai compatible");
    expect(formatMode("remote-api", t)).toBe("remote api");
    expect(formatMode("deterministic")).toBe("deterministic");
    expect(formatMode("invalid", t)).toBe("invalid");
  });
});

describe("formatMetric", () => {
  it("localizes known evaluation metrics and title-cases unknown keys", () => {
    expect(formatMetric("noteCoverage", t)).toBe("Note coverage");
    expect(formatMetric("corpusCoverage", t)).toBe("Corpus coverage");
    expect(formatMetric("customScore", t)).toBe("Custom Score");
    expect(formatMetric("note_quality")).toBe("Note quality");
  });
});

describe("formatTrendPoints", () => {
  it("localizes absolute, signed, and new trend point labels", () => {
    expect(formatTrendPoints(0.1, t)).toBe("10 pts");
    expect(formatTrendPoints(null, t)).toBe("0 pts");
    expect(formatSignedTrendPoints(-0.1, t)).toBe("-10 pts");
    expect(formatSignedTrendPoints(0.05, t)).toBe("+5 pts");
    expect(formatSignedTrendPoints(null, t)).toBe("new");
    expect(formatTrendPoints(0.1)).toBe("10 pts");
  });
});

describe("formatStatus and trendVerb", () => {
  it("localizes note, source, session, and disposition statuses", () => {
    expect(formatStatus("open", t)).toBe("open");
    expect(formatStatus("resolved", t)).toBe("resolved");
    expect(formatStatus("under_review", t)).toBe("under review");
    expect(formatStatus("approved", t)).toBe("approved");
    expect(formatStatus("processing", t)).toBe("processing");
    expect(formatStatus("learner_practice", t)).toBe("learner practice");
    expect(formatStatus("under_review")).toBe("under review");
    expect(trendVerb("improved", t)).toBe("improved");
    expect(trendVerb("regressed", t)).toBe("regressed");
    expect(trendVerb("stable", t)).toBe("held steady");
  });
});

describe("formatTypology", () => {
  it("localizes typology labels and falls back for unknown values", () => {
    expect(formatTypology("agglutinative", t)).toBe("agglutinative");
    expect(formatTypology("polysynthetic-lite", t)).toBe("polysynthetic-lite");
    expect(formatTypology(undefined, t)).toBe("unknown");
    expect(formatTypology("agglutinative")).toBe("agglutinative");
  });
});
