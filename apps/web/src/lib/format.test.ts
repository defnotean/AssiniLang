import { describe, expect, it } from "vitest";
import type { LanguageSnapshot } from "../api";
import { ApiError } from "./apiClient";
import { buildSnapshotDownload, formatSnapshotReviewAccountability, localizeApiError, localizeSourceProcessingError, localizeVaultImportError } from "./format";
import { en } from "../i18n/en";
import type { Translate } from "../i18n";

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
    ])).toBe("2 notes still need review");
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
    ]));

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
});
