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
  formatSubmissionExplanation,
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

  it("localizes payload-too-large responses via status and i18nKey", () => {
    expect(
      localizeApiError(
        new ApiError("Request failed: /languages (413): Payload too large", {
          status: 413,
          i18nKey: "errors.payloadTooLarge"
        }),
        t,
        "errors.draftGenerationFailed"
      )
    ).toBe("That request is too large. Shrink the payload or upload a smaller file, then retry.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /languages (413): Payload too large", { status: 413 }),
        t,
        "errors.draftGenerationFailed"
      )
    ).toBe("That request is too large. Shrink the payload or upload a smaller file, then retry.");
  });

  it("localizes invalid prototype session bodies via i18nKey or English message", () => {
    expect(
      localizeApiError(
        new ApiError("Request failed: /auth/prototype-session (400): Invalid prototype session body", {
          status: 400,
          i18nKey: "errors.invalidPrototypeSessionBody"
        }),
        t,
        "learner.errSubmissionFailed"
      )
    ).toBe("Choose a valid local prototype user before signing in.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /auth/prototype-session (400): Invalid prototype session body", {
          status: 400
        }),
        t,
        "learner.errSubmissionFailed"
      )
    ).toBe("Choose a valid local prototype user before signing in.");
  });

  it("localizes AI session and review validation errors via i18nKey or English message", () => {
    expect(
      localizeApiError(
        new ApiError("Invalid AI session body", {
          status: 400,
          i18nKey: "errors.invalidAiSessionBody"
        }),
        t,
        "assistant.errSessionCreateFailed"
      )
    ).toBe("Provide a valid chat session: language, mode, and seed prompt.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /ai/sessions (400): Invalid AI session body", { status: 400 }),
        t,
        "assistant.errSessionCreateFailed"
      )
    ).toBe("Provide a valid chat session: language, mode, and seed prompt.");

    expect(
      localizeApiError(
        new ApiError("Invalid AI message body", {
          status: 400,
          i18nKey: "errors.invalidAiMessageBody"
        }),
        t,
        "assistant.errSessionMessageFailed"
      )
    ).toBe("Enter a non-empty message before sending.");

    expect(
      localizeApiError(
        new ApiError("AI session not found: missing-session", {
          status: 404,
          i18nKey: "errors.aiSessionNotFound"
        }),
        t,
        "assistant.errSessionMessageFailed"
      )
    ).toBe("That chat session was not found. Start a new conversation.");

    expect(
      localizeApiError(
        new ApiError("Invalid review body", {
          status: 400,
          i18nKey: "errors.invalidReviewBody"
        }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("Choose a valid review status before saving.");

    expect(
      localizeApiError(
        new ApiError("Review dispositions require reviewerComment", { status: 400 }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("Add a reviewer comment before recording this disposition.");

    expect(
      localizeApiError(
        new ApiError("Note explanation edits require a substantive explanation.", {
          status: 400,
          i18nKey: "errors.noteExplanationTooShort"
        }),
        t,
        "errors.noteExplanationUpdateFailed"
      )
    ).toBe("Write a longer note explanation (at least a short paragraph) before saving.");

    expect(
      localizeApiError(
        new ApiError("Note explanation edits require a substantive explanation.", { status: 400 }),
        t,
        "errors.noteExplanationUpdateFailed"
      )
    ).toBe("Write a longer note explanation (at least a short paragraph) before saving.");

    expect(
      localizeApiError(
        new ApiError("Note not found: missing-note", {
          status: 404,
          i18nKey: "errors.noteNotFound"
        }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("That note was not found. Select another note from the review queue.");

    expect(
      localizeApiError(
        new ApiError("Reviewer is not assigned to approve notes for language: testlang", { status: 403 }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("You are not assigned to approve notes for this language. Ask a lead to update the review policy.");

    expect(
      localizeApiError(
        new ApiError("Review disposition assignee is not assignable: learner-1", { status: 400 }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("Choose an assignable reviewer, lead, admin, or elder for this disposition.");

    expect(
      localizeApiError(
        new ApiError("Review disposition due date must be parseable", { status: 400 }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("Enter a valid due date for this disposition.");

    expect(
      localizeApiError(
        new ApiError(
          "A configured model is required to generate drafts. Set ASSINI_LLM_* (see the configuration reference) and retry.",
          { status: 400, i18nKey: "errors.modelRequired" }
        ),
        t,
        "errors.modelDraftGenerationFailed"
      )
    ).toBe(
      "A configured model is required to generate drafts. Set ASSINI_LLM_* (see the configuration reference) and retry."
    );
  });

  it("localizes language create/patch and bulk-review validation errors", () => {
    expect(
      localizeApiError(
        new ApiError("Invalid language body: name, description, and orthography are required", {
          status: 400,
          i18nKey: "errors.invalidLanguageBody"
        }),
        t,
        "createLang.creationFailed"
      )
    ).toBe("Name, description, and orthography are required to create a language.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /languages (400): Invalid language patch body", { status: 400 }),
        t,
        "createLang.creationFailed"
      )
    ).toBe("Provide at least one valid language field to update.");

    expect(
      localizeApiError(
        new ApiError("Body must include action: \"accept\" or \"reject\".", {
          status: 400,
          i18nKey: "errors.bulkReviewInvalidAction"
        }),
        t,
        "ingest.bulkReviewFailed"
      )
    ).toBe("Choose accept or reject for bulk draft review.");

    expect(
      localizeApiError(
        new ApiError("Too many draftIds: at most 50 per request.", {
          status: 400,
          i18nKey: "errors.bulkReviewTooManyDraftIds",
          i18nParams: { max: 50 }
        }),
        t,
        "ingest.bulkReviewFailed"
      )
    ).toBe("Too many drafts selected. Review at most 50 at a time.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /bulk-review (400): Too many draftIds: at most 50 per request.", {
          status: 400
        }),
        t,
        "ingest.bulkReviewFailed"
      )
    ).toBe("Too many drafts selected. Review at most 50 at a time.");
  });

  it("prefers rate-limit i18nParams seconds over Retry-After message parsing", () => {
    expect(
      localizeApiError(
        new ApiError("Request failed: /dashboard (429): Rate limit exceeded", {
          status: 429,
          i18nKey: "app.rateLimitExceeded",
          i18nParams: { seconds: 4 }
        }),
        t,
        "errors.draftGenerationFailed"
      )
    ).toBe("Too many requests. Wait 4 seconds, then retry.");
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

  it("localizes forbidden responses without relying on English error text", () => {
    const message = localizeApiError(
      new ApiError("Request failed: /exports/evaluations/artifact (403): Forbidden", { status: 403 }),
      t,
      "app.workspaceUnavailable"
    );

    expect(message).toBe("You do not have permission for this action.");
  });

  it("prefers specific 403 i18nKey over the generic forbidden message", () => {
    expect(
      localizeApiError(
        new ApiError("Reviewer is not assigned to approve notes for language: testlang", {
          status: 403,
          i18nKey: "errors.reviewerNotAssigned"
        }),
        t,
        "errors.noteReviewFailed"
      )
    ).toBe("You are not assigned to approve notes for this language. Ask a lead to update the review policy.");
  });

  it("localizes already-processing conflicts from i18n metadata", () => {
    const message = localizeApiError(
      new ApiError("Source is already processing: src-1", {
        status: 409,
        i18nKey: "ingest.sourceAlreadyProcessing"
      }),
      t,
      "ingest.sourceProcessingFailed"
    );

    expect(message).toBe(
      "This source is already processing. Wait for the current run to finish, or recover a stuck job after restart."
    );
  });

  it("localizes empty-workspace evaluation failures from i18n metadata", () => {
    const message = localizeApiError(
      new ApiError("No languages available to evaluate", {
        status: 400,
        i18nKey: "errors.noLanguagesToEvaluate"
      }),
      t,
      "errors.evaluationRunFailed"
    );

    expect(message).toBe("No languages available to evaluate");
  });

  it("localizes unknown language snapshot exports from i18n metadata", () => {
    const message = localizeApiError(
      new ApiError("Language not found: not-a-language", {
        status: 404,
        i18nKey: "errors.languageNotFound"
      }),
      t,
      "governance.errSnapshotExportFailed"
    );

    expect(message).toBe(
      "That language was not found. Select another language or create one first."
    );
  });

  it("localizes elder apply negatives from i18n metadata", () => {
    expect(
      localizeApiError(
        new ApiError("Elder correction must be accepted before apply: corr-1", {
          status: 409,
          i18nKey: "elderWs.errCorrectionMustBeAccepted"
        }),
        t,
        "elderWs.errApplyFailed"
      )
    ).toBe("Accept the elder correction before applying it to a note.");

    expect(
      localizeApiError(
        new ApiError("Elder correction is not linked to a note: corr-2", {
          status: 400,
          i18nKey: "elderWs.errCorrectionNotLinkedToNote"
        }),
        t,
        "elderWs.errApplyFailed"
      )
    ).toBe("Only note-linked elder corrections can be applied.");
  });

  it("localizes prototype-auth and study-loop draft negatives from i18n metadata", () => {
    expect(
      localizeApiError(
        new ApiError("Prototype auth is disabled", {
          status: 404,
          i18nKey: "errors.prototypeAuthDisabled"
        }),
        t,
        "app.workspaceUnavailable"
      )
    ).toBe(
      "Local prototype sign-in is disabled on this API. Start with npm run dev, or set ASSINI_ENABLE_PROTOTYPE_AUTH=true."
    );

    expect(
      localizeApiError(
        new ApiError("Missing languageId", {
          status: 400,
          i18nKey: "errors.missingLanguageId"
        }),
        t,
        "errors.draftGenerationFailed"
      )
    ).toBe("Choose a language before generating draft notes.");
  });

  it("localizes prototype-auth and missing-languageId failures from message text when metadata is absent", () => {
    expect(
      localizeApiError(
        new ApiError("Request failed: /auth/prototype-session (404): Prototype auth is disabled", {
          status: 404
        }),
        t,
        "app.workspaceUnavailable"
      )
    ).toBe(
      "Local prototype sign-in is disabled on this API. Start with npm run dev, or set ASSINI_ENABLE_PROTOTYPE_AUTH=true."
    );

    expect(
      localizeApiError(
        new ApiError("Request failed: /study-loop/draft (400): Missing languageId", {
          status: 400
        }),
        t,
        "errors.draftGenerationFailed"
      )
    ).toBe("Choose a language before generating draft notes.");
  });

  it("localizes review-disposition resolve negatives from message text when metadata is absent", () => {
    expect(
      localizeApiError(
        new ApiError("Review disposition not found: disp-missing", { status: 404 }),
        t,
        "governance.errReviewDispositionResolutionFailed"
      )
    ).toBe("That review disposition was not found. Refresh the Checks ledger and try again.");

    expect(
      localizeApiError(
        new ApiError("Review disposition is already resolved", { status: 400 }),
        t,
        "governance.errReviewDispositionResolutionFailed"
      )
    ).toBe("That review disposition is already resolved.");

    expect(
      localizeApiError(
        new ApiError("Review disposition is already resolved", {
          status: 400,
          i18nKey: "governance.errDispositionAlreadyResolved"
        }),
        t,
        "governance.errReviewDispositionResolutionFailed"
      )
    ).toBe("That review disposition is already resolved.");
  });

  it("localizes elder review negatives from message text when metadata is absent", () => {
    const message = localizeApiError(
      new ApiError(
        "Request failed: /elder/corrections/corr-1/review (409): Elder correction is no longer pending review: corr-1",
        { status: 409 }
      ),
      t,
      "elderWs.errReviewFailed"
    );

    expect(message).toBe("That elder correction is no longer pending review.");
  });

  it("localizes invalid elder correction create bodies from i18n metadata and message text", () => {
    expect(
      localizeApiError(
        new ApiError("Invalid elder correction body", {
          status: 400,
          i18nKey: "elderWs.errInvalidCorrectionBody"
        }),
        t,
        "elderWs.errSubmitFailed"
      )
    ).toBe("Provide a valid elder correction: language, correction text, rationale, and severity.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /elder/corrections (400): Invalid elder correction body", {
          status: 400
        }),
        t,
        "elderWs.errSubmitFailed"
      )
    ).toBe("Provide a valid elder correction: language, correction text, rationale, and severity.");

    // More-specific review/apply bodies must not collapse into the create-body key.
    expect(
      localizeApiError(
        new ApiError("Request failed: /elder/corrections/corr-1/review (400): Invalid elder correction review body", {
          status: 400
        }),
        t,
        "elderWs.errReviewFailed"
      )
    ).toBe("Choose accept or reject before reviewing this correction.");
  });

  it("localizes corpus import validation errors via i18nKey or English message", () => {
    expect(
      localizeApiError(
        new ApiError("Invalid corpus import body", {
          status: 400,
          i18nKey: "errors.invalidCorpusImportBody"
        }),
        t,
        "corpus.importFailed"
      )
    ).toBe("Provide a complete corpus passage: source, texts, segmentation, tags, and consent.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /languages/avenik/corpus (400): Invalid corpus import body", {
          status: 400
        }),
        t,
        "corpus.importFailed"
      )
    ).toBe("Provide a complete corpus passage: source, texts, segmentation, tags, and consent.");

    expect(
      localizeApiError(
        new ApiError("Corpus passage could not be imported", {
          status: 500,
          i18nKey: "errors.corpusImportFailed"
        }),
        t,
        "corpus.importFailed"
      )
    ).toBe("The corpus passage could not be imported. Retry, or check the API logs.");
  });

  it("localizes extraction-draft not-found and accept failures via i18nKey or English message", () => {
    expect(
      localizeApiError(
        new ApiError("Extraction draft not found: missing-draft", {
          status: 404,
          i18nKey: "errors.extractionDraftNotFound"
        }),
        t,
        "ingest.draftReviewFailed"
      )
    ).toBe("That extraction draft was not found. Refresh Build and try again.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /extraction-drafts/missing/accept (404): Extraction draft not found: missing", {
          status: 404
        }),
        t,
        "ingest.draftReviewFailed"
      )
    ).toBe("That extraction draft was not found. Refresh Build and try again.");

    expect(
      localizeApiError(
        new ApiError("Extraction draft could not be accepted", {
          status: 500,
          i18nKey: "errors.extractionDraftAcceptFailed"
        }),
        t,
        "ingest.draftReviewFailed"
      )
    ).toBe("The extraction draft could not be accepted. Retry, or check the API logs.");
  });

  it("localizes exercise authoring and submission validation errors via i18nKey or English message", () => {
    expect(
      localizeApiError(
        new ApiError("Invalid exercise authoring body", {
          status: 400,
          i18nKey: "errors.invalidExerciseAuthoringBody"
        }),
        t,
        "learner.exerciseAuthoringFailed"
      )
    ).toBe("Fill every required exercise field before creating or validating.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /languages/avenik/exercises (400): Invalid exercise authoring body", {
          status: 400
        }),
        t,
        "learner.exerciseAuthoringFailed"
      )
    ).toBe("Fill every required exercise field before creating or validating.");

    expect(
      localizeApiError(
        new ApiError("Invalid exercise submission body", {
          status: 400,
          i18nKey: "errors.invalidExerciseSubmissionBody"
        }),
        t,
        "learner.errSubmissionFailed"
      )
    ).toBe("Enter a non-empty answer before grading.");

    expect(
      localizeApiError(
        new ApiError("Exercise not found: missing-exercise", {
          status: 404,
          i18nKey: "errors.exerciseNotFound"
        }),
        t,
        "learner.errSubmissionFailed"
      )
    ).toBe("That exercise was not found. Select another exercise or author a new one.");

    expect(
      localizeApiError(
        new ApiError("Request failed: /exercises/missing/submissions (404): Exercise not found: missing", {
          status: 404
        }),
        t,
        "learner.errSubmissionFailed"
      )
    ).toBe("That exercise was not found. Select another exercise or author a new one.");
  });

  it("localizes already-processing conflicts from message text when metadata is absent", () => {
    const message = localizeApiError(
      new ApiError("Request failed: /sources/src-1/process (409): Source is already processing: src-1", {
        status: 409
      }),
      t,
      "ingest.sourceProcessingFailed"
    );

    expect(message).toBe(
      "This source is already processing. Wait for the current run to finish, or recover a stuck job after restart."
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

  it("prefers vault i18nKey metadata over English error text", () => {
    const message = localizeVaultImportError(
      new ApiError("Obsidian vault path is outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist.", {
        status: 400,
        i18nKey: "ingest.errorVaultOutsideAllowlist"
      }),
      t,
      "ingest.vaultImportFailed"
    );

    expect(message).toBe(
      "That folder is outside the allowed vault roots. Update ASSINI_OBSIDIAN_VAULT_ROOTS or choose a folder under an allowed root."
    );
  });

  it("localizes relative vault-root configuration failures", () => {
    const message = localizeVaultImportError(
      new Error(
        "Obsidian vault import failed (400): ASSINI_OBSIDIAN_VAULT_ROOTS entries must be absolute directory paths; relative roots are ignored."
      ),
      t,
      "ingest.vaultImportFailed"
    );

    expect(message).toBe(
      "ASSINI_OBSIDIAN_VAULT_ROOTS must use absolute folder paths. Relative roots like ./vaults are ignored; set one or more absolute directories, then retry."
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

  it("localizes restart-recovery interruptions from persisted source errors", () => {
    const message = localizeSourceProcessingError(
      "Processing interrupted by a server restart. Re-run processing.",
      t,
      "ingest.sourceProcessingFailed"
    );

    expect(message).toBe(
      "Processing was interrupted by a server restart. Re-run processing on this source."
    );
  });

  it("localizes missing transcription endpoint guidance from persisted source errors", () => {
    const message = localizeSourceProcessingError(
      "Audio sources need a transcription endpoint. Set ASSINI_TRANSCRIBE_BASE_URL to an OpenAI-compatible /audio/transcriptions server (for example a local whisper server).",
      t,
      "ingest.sourceProcessingFailed"
    );

    expect(message).toBe(
      "Audio sources need a transcription endpoint. Set a transcription base URL in Runtime settings (Model tab), then process again."
    );
  });

  it("localizes offline-heuristic fallback warnings", () => {
    expect(
      localizeSourceProcessingWarning(
        "Model output was not valid extraction JSON; fell back to offline heuristics.",
        t
      )
    ).toBe("Model output was not valid extraction JSON; fell back to offline heuristics.");

    expect(
      localizeSourceProcessingWarning(
        "Model output for part 2 of 5 was not valid extraction JSON; that part was skipped.",
        createTranslator("ar")
      )
    ).toBe("لم يكن خرج النموذج للجزء 2 من 5 JSON استخلاص صالحًا؛ تم تخطي ذلك الجزء.");
  });

  it("localizes OCR endpoint empty responses and model-extraction throw fallbacks", () => {
    expect(
      localizeSourceProcessingError(
        "OCR model endpoint returned no text.",
        t,
        "ingest.sourceProcessingFailed"
      )
    ).toBe(
      "The configured OCR model could not read this document. Check the OCR endpoint in Runtime settings or try a different model."
    );

    expect(
      localizeSourceProcessingError(
        "The configured model returned no usable result for this image. It may not be vision-capable. Configure a vision model (for example llava via Ollama) in ASSINI_LLM_MODEL, or rely on the local OCR fallback by leaving the model unset.",
        createTranslator("ar"),
        "ingest.sourceProcessingFailed"
      )
    ).toBe(
      "تعذّر على النموذج المُهيّأ قراءة هذه الصورة وقد لا يدعم الرؤية. عيِّن نموذج رؤية أو رابط OCR أساسيًا في إعدادات وقت التشغيل، أو اترك كليهما فارغين لاستخدام OCR المحلي."
    );

    expect(
      localizeSourceProcessingWarning(
        "Model extraction failed for part 1 of 3: LLM provider request timed out after 25ms; fell back to offline heuristics when no usable model output remained.",
        t
      )
    ).toBe(
      "Model extraction failed for part 1 of 3; fell back to offline heuristics for that part."
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

describe("formatSubmissionExplanation", () => {
  it("localizes canned accepted and rejected submission explanations", () => {
    const accepted = { accepted: true, explanation: "Submission accepted." } as PublicExerciseSubmission;
    const rejected = {
      accepted: false,
      explanation: "Answer did not match the exercise answer key."
    } as PublicExerciseSubmission;

    expect(formatSubmissionExplanation(accepted, t)).toBe("Submission accepted.");
    expect(formatSubmissionExplanation(rejected, t)).toBe(
      "Answer did not match the exercise answer key."
    );
    expect(formatSubmissionExplanation(accepted)).toBe("Submission accepted.");
    expect(formatSubmissionExplanation(rejected)).toBe(
      "Answer did not match the exercise answer key."
    );
  });

  it("maps from accepted flag even when the API explanation string differs", () => {
    const accepted = {
      accepted: true,
      explanation: "Accepted exercise submission."
    } as PublicExerciseSubmission;
    const rejected = {
      accepted: false,
      explanation: "Answer did not match the exercise key."
    } as PublicExerciseSubmission;

    expect(formatSubmissionExplanation(accepted, t)).toBe("Submission accepted.");
    expect(formatSubmissionExplanation(rejected, t)).toBe(
      "Answer did not match the exercise answer key."
    );
  });
});

describe("formatOrthographyMeta", () => {
  it("localizes default and named orthography labels", () => {
    expect(formatOrthographyMeta(undefined, t)).toBe("Latin orthography");
    expect(formatOrthographyMeta("Latin", t)).toBe("Latin orthography");
  });

  it("truncates long orthography values instead of replacing them with placeholder copy", () => {
    const long = "Latin morphology with hyphenation rules";
    expect(formatOrthographyMeta(long, t)).toBe("Latin morphology with hyphenation… orthography");
    expect(formatOrthographyMeta(long)).toBe("Latin morphology with hyphenation… orthography");
    expect(formatOrthographyMeta("x".repeat(35), t)).toBe(`${"x".repeat(33)}… orthography`);
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
