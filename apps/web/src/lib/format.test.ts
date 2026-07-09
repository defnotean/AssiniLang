import { describe, expect, it } from "vitest";
import type { AiSession } from "@assini/db";
import type { LanguageSnapshot, LlmReachability } from "../api";
import { ApiError } from "./apiClient";
import {
  buildSnapshotDownload,
  formatOrthographyMeta,
  formatReachability,
  formatSnapshotReviewAccountability,
  formatSubmissionStatus,
  latestAssistantMessage,
  localizeApiError,
  localizeSourceProcessingError,
  localizeSourceProcessingWarning,
  localizeVaultImportError
} from "./format";
import { en } from "../i18n/en";
import type { Translate } from "../i18n";
import type { PublicExerciseSubmission } from "../api";

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
