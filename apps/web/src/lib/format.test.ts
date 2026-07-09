import { describe, expect, it } from "vitest";
import type { LanguageSnapshot } from "../api";
import { buildSnapshotDownload, formatSnapshotReviewAccountability } from "./format";

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
