import { describe, expect, it } from "vitest";
import {
  aiMessagePayloadSchema,
  apiErrorEnvelopeSchema,
  BULK_REVIEW_MAX_DRAFT_IDS,
  bulkReviewPayloadSchema,
  createAiSessionPayloadSchema,
  elderCorrectionPayloadSchema,
  exerciseSubmissionPayloadSchema,
  governancePayloadSchema,
  languageCreatePayloadSchema,
  languagePatchPayloadSchema,
  obsidianVaultImportPayloadSchema,
  obsidianVaultImportResponseSchema,
  processSourceOptionsSchema,
  processSourceResponseSchema,
  prototypeSessionPayloadSchema,
  reviewDispositionResolveByIdPayloadSchema,
  reviewDispositionResolvePayloadSchema,
  reviewPolicyPayloadSchema,
  sourceRegistrationPayloadSchema,
  sourceTextRegistrationKindSchema,
  sourceUploadKindSchema
} from "./apiContract.js";
import {
  llmModelDiscoveryResponseSchema,
  llmReachabilitySchema,
  modelProfileSavePayloadSchema,
  runtimeSettingsPatchSchema,
  runtimeSettingsResponseSchema
} from "./llmContract.js";

describe("api contract schemas", () => {
  it("defaults omitted language typology to unknown", () => {
    expect(languageCreatePayloadSchema.parse({
      name: "  Bisaya  ",
      description: "  Cebuano test workspace  ",
      orthography: "  Latin  "
    })).toMatchObject({
      name: "Bisaya",
      description: "Cebuano test workspace",
      orthography: "Latin",
      typology: "unknown"
    });
  });

  it("defaults omitted AI session seed prompt to an empty string", () => {
    expect(createAiSessionPayloadSchema.parse({
      languageId: "bisaya",
      mode: "learner_practice"
    })).toMatchObject({
      languageId: "bisaya",
      mode: "learner_practice",
      seedPrompt: "",
      contextNoteIds: [],
      contextPassageIds: []
    });
  });

  it("trims language phonology payloads and rejects blank inventory values", () => {
    expect(languageCreatePayloadSchema.parse({
      name: "Avenik",
      description: "Practice language",
      orthography: "Latin",
      typology: "agglutinative",
      phonology: {
        consonants: [" m ", "n"],
        vowels: ["a", " i "],
        notes: [" no clusters "],
        syllableTemplate: " CV ",
        stress: " initial "
      }
    })).toMatchObject({
      typology: "agglutinative",
      phonology: {
        consonants: ["m", "n"],
        vowels: ["a", "i"],
        notes: ["no clusters"],
        syllableTemplate: "CV",
        stress: "initial"
      }
    });

    expect(languagePatchPayloadSchema.parse({ phonology: null })).toEqual({ phonology: undefined });
    expect(languageCreatePayloadSchema.safeParse({
      name: "A",
      description: "B",
      orthography: "C",
      phonology: { consonants: ["m"], vowels: ["a"], notes: [""] }
    }).success).toBe(false);
  });

  it("trims source titles and URLs without altering raw text bodies", () => {
    expect(sourceRegistrationPayloadSchema.parse({
      kind: "wordlist",
      title: " Field notes ",
      rawText: " mira = river \n"
    })).toEqual({
      kind: "wordlist",
      title: "Field notes",
      rawText: " mira = river \n"
    });

    expect(sourceRegistrationPayloadSchema.parse({
      kind: "url",
      title: "Word list",
      url: " https://example.org/list "
    })).toEqual({
      kind: "url",
      title: "Word list",
      url: "https://example.org/list"
    });

    expect(sourceRegistrationPayloadSchema.safeParse({
      kind: "url",
      title: "File",
      url: "file:///tmp/list.txt"
    }).success).toBe(false);
  });

  it("keeps text registration kinds separate from upload kinds", () => {
    expect(sourceTextRegistrationKindSchema.options).toEqual(["text", "wordlist", "url"]);
    expect(sourceUploadKindSchema.options).toEqual(["image", "audio", "document"]);
    expect(sourceRegistrationPayloadSchema.safeParse({
      kind: "image",
      title: "Scan",
      rawText: "unused"
    }).success).toBe(false);
  });

  it("defaults Obsidian vault import options and rejects invalid limits", () => {
    expect(obsidianVaultImportPayloadSchema.parse({
      vaultPath: "  C:/vaults/notes  "
    })).toEqual({
      vaultPath: "C:/vaults/notes",
      includeSubfolders: true,
      maxFiles: 100
    });

    expect(obsidianVaultImportPayloadSchema.safeParse({
      vaultPath: "C:/vaults/notes",
      maxFiles: 0
    }).success).toBe(false);

    expect(obsidianVaultImportPayloadSchema.safeParse({
      vaultPath: "C:/vaults/notes",
      unexpected: true
    }).success).toBe(false);
  });

  it("accepts process-source async options and rejects unknown keys", () => {
    expect(processSourceOptionsSchema.parse({})).toEqual({});
    expect(processSourceOptionsSchema.parse({ async: true })).toEqual({ async: true });
    expect(processSourceOptionsSchema.safeParse({ async: true, wait: true }).success).toBe(false);
  });

  it("trims elder correction targets and requires at least one target", () => {
    expect(elderCorrectionPayloadSchema.parse({
      languageId: " bisaya ",
      noteId: " note-1 ",
      correction: " Prefer mira. ",
      rationale: " Elder preference. ",
      severity: "minor",
      contextText: "  "
    })).toEqual({
      languageId: "bisaya",
      noteId: "note-1",
      correction: "Prefer mira.",
      rationale: "Elder preference.",
      severity: "minor",
      contextText: undefined
    });

    expect(elderCorrectionPayloadSchema.safeParse({
      languageId: "bisaya",
      correction: "Prefer mira.",
      rationale: "Elder preference.",
      severity: "minor"
    }).success).toBe(false);
  });

  it("rejects blank AI session context ids", () => {
    expect(createAiSessionPayloadSchema.safeParse({
      languageId: "bisaya",
      mode: "learner_practice",
      contextNoteIds: [" "]
    }).success).toBe(false);
  });

  it("trims exercise submission answers and rejects blanks or unknown keys", () => {
    expect(exerciseSubmissionPayloadSchema.parse({ answer: "  mira  " })).toEqual({
      answer: "mira"
    });
    expect(exerciseSubmissionPayloadSchema.safeParse({ answer: "   " }).success).toBe(false);
    expect(exerciseSubmissionPayloadSchema.safeParse({}).success).toBe(false);
    expect(exerciseSubmissionPayloadSchema.safeParse({
      answer: "mira",
      extra: true
    }).success).toBe(false);
  });

  it("accepts process-source responses with asset drafts and warnings", () => {
    const asset = {
      id: "src-1",
      languageId: "bisaya",
      kind: "text" as const,
      title: "Notes",
      status: "processed" as const,
      createdBy: "u1",
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const draft = {
      id: "draft-1",
      languageId: "bisaya",
      sourceAssetId: "src-1",
      kind: "lexeme" as const,
      payload: { tags: [], morphologicalSegmentation: [], topicTags: [] },
      confidence: "medium" as const,
      status: "proposed" as const,
      createdAt: "2026-01-01T00:00:00.000Z"
    };

    expect(processSourceResponseSchema.parse({
      asset,
      drafts: [draft],
      warnings: ["ok"]
    })).toMatchObject({
      asset: { id: "src-1" },
      drafts: [{ id: "draft-1" }],
      warnings: ["ok"]
    });

    expect(processSourceResponseSchema.safeParse({
      asset,
      drafts: [draft]
    }).success).toBe(false);
  });

  it("accepts Obsidian vault import response summaries", () => {
    expect(obsidianVaultImportResponseSchema.parse({
      imported: [],
      skipped: [{ path: "a.md", reason: "empty" }],
      warnings: ["Import stopped at the configured 100 file limit."],
      summary: { scanned: 1, imported: 0, skipped: 1 }
    })).toMatchObject({
      summary: { scanned: 1, imported: 0, skipped: 1 },
      skipped: [{ path: "a.md", reason: "empty" }]
    });
  });

  it("rejects blank language create fields and empty text registration bodies", () => {
    expect(languageCreatePayloadSchema.safeParse({
      name: " ",
      description: "desc",
      orthography: "Latin"
    }).success).toBe(false);

    expect(sourceRegistrationPayloadSchema.safeParse({
      kind: "text",
      title: "Notes",
      rawText: "   "
    }).success).toBe(false);

    expect(sourceRegistrationPayloadSchema.safeParse({
      kind: "url",
      title: "List"
    }).success).toBe(false);
  });

  it("validates AI message, prototype session, and API error envelopes", () => {
    expect(aiMessagePayloadSchema.parse({ content: "  hello  " })).toEqual({ content: "hello" });
    expect(aiMessagePayloadSchema.safeParse({ content: " " }).success).toBe(false);
    expect(aiMessagePayloadSchema.safeParse({ content: "hi", extra: 1 }).success).toBe(false);

    expect(prototypeSessionPayloadSchema.parse({ userId: " learner " })).toEqual({
      userId: "learner"
    });
    expect(prototypeSessionPayloadSchema.safeParse({}).success).toBe(false);

    expect(apiErrorEnvelopeSchema.parse({
      error: "Language not found: x",
      i18nKey: "errors.languageNotFound"
    })).toEqual({
      error: "Language not found: x",
      i18nKey: "errors.languageNotFound"
    });

    expect(apiErrorEnvelopeSchema.parse({
      error: "Too many draftIds",
      i18nKey: "errors.bulkReviewTooManyDraftIds",
      i18nParams: { max: BULK_REVIEW_MAX_DRAFT_IDS },
      requestId: "req-1"
    })).toMatchObject({
      i18nParams: { max: 50 },
      requestId: "req-1"
    });

    expect(apiErrorEnvelopeSchema.safeParse({ i18nKey: "errors.languageNotFound" }).success)
      .toBe(false);
  });

  it("dedupes bulk-review draft ids and enforces the max batch size", () => {
    expect(bulkReviewPayloadSchema.parse({
      action: "accept",
      draftIds: [" d1 ", "d1", "d2"]
    })).toEqual({
      action: "accept",
      draftIds: ["d1", "d2"]
    });

    expect(bulkReviewPayloadSchema.safeParse({
      action: "noop",
      draftIds: ["d1"]
    }).success).toBe(false);

    expect(bulkReviewPayloadSchema.safeParse({
      action: "reject",
      draftIds: []
    }).success).toBe(false);

    expect(bulkReviewPayloadSchema.safeParse({
      action: "reject",
      draftIds: Array.from({ length: BULK_REVIEW_MAX_DRAFT_IDS + 1 }, (_, i) => `d${i}`)
    }).success).toBe(false);
  });

  it("validates governance and review-policy payloads", () => {
    expect(governancePayloadSchema.parse({
      languageId: " bisaya ",
      policyType: "consent",
      content: " Community approved. ",
      effectiveDate: "2026-01-01"
    })).toEqual({
      languageId: "bisaya",
      policyType: "consent",
      content: "Community approved.",
      effectiveDate: "2026-01-01"
    });

    expect(governancePayloadSchema.safeParse({
      languageId: "bisaya",
      policyType: "consent",
      content: "ok",
      effectiveDate: "not-a-date"
    }).success).toBe(false);

    expect(reviewPolicyPayloadSchema.parse({
      assignedReviewerIds: [" r1 "],
      approvalThreshold: 1
    })).toEqual({
      assignedReviewerIds: ["r1"],
      approvalThreshold: 1,
      requiresAssignedReviewer: true
    });

    expect(reviewDispositionResolvePayloadSchema.parse({
      resolutionSummary: " Done. "
    })).toEqual({ resolutionSummary: "Done." });

    expect(reviewDispositionResolveByIdPayloadSchema.parse({
      dispositionId: " disp-1 ",
      resolutionSummary: "Done."
    })).toEqual({
      dispositionId: "disp-1",
      resolutionSummary: "Done."
    });
  });
});

describe("llm contract schemas", () => {
  it("requires a profile name and accepts optional activation", () => {
    expect(modelProfileSavePayloadSchema.parse({
      name: " Local Ollama ",
      provider: "ollama",
      activate: true
    })).toMatchObject({
      name: "Local Ollama",
      provider: "ollama",
      activate: true
    });

    expect(modelProfileSavePayloadSchema.safeParse({
      provider: "ollama"
    }).success).toBe(false);
  });

  it("keeps runtime settings patches strict and write-only for secrets", () => {
    expect(runtimeSettingsPatchSchema.parse({
      provider: "openai-compatible",
      apiKey: "secret",
      clearApiKey: false,
      embeddingApiKey: "embedding-secret",
      clearEmbeddingApiKey: false
    })).toEqual({
      provider: "openai-compatible",
      apiKey: "secret",
      clearApiKey: false,
      embeddingApiKey: "embedding-secret",
      clearEmbeddingApiKey: false
    });

    expect(runtimeSettingsPatchSchema.safeParse({
      provider: "openai-compatible",
      unknown: true
    }).success).toBe(false);
  });

  it("defaults missing profile lists on runtime settings responses", () => {
    const status = {
      provider: "deterministic",
      mode: "deterministic" as const,
      configured: true,
      activeProviderName: "deterministic",
      timeoutMs: 30_000,
      apiKey: {
        required: false,
        configured: false,
        acceptedVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"]
      },
      environment: {
        providerVariable: "ASSINI_LLM_PROVIDER",
        baseUrlVariable: "ASSINI_LLM_BASE_URL",
        modelVariable: "ASSINI_LLM_MODEL",
        apiKeyVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"],
        timeoutVariable: "ASSINI_LLM_TIMEOUT_MS"
      },
      transcription: {
        configured: false,
        baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
        modelVariable: "ASSINI_TRANSCRIBE_MODEL"
      },
      ocr: {
        configured: false,
        baseUrlVariable: "ASSINI_OCR_BASE_URL",
        modelVariable: "ASSINI_OCR_MODEL"
      },
      setup: {
        localExamples: [],
        remoteExamples: []
      },
      warnings: []
    };

    const parsed = runtimeSettingsResponseSchema.parse({
      settings: {
        provider: "deterministic",
        baseUrl: "",
        model: "",
        apiKeyConfigured: false,
        timeoutMs: 30_000,
        maxTokens: 1024,
        jsonMode: false,
        embeddingBaseUrl: "",
        embeddingModel: "",
        embeddingApiKeyConfigured: false,
        embeddingTimeoutMs: 30_000,
        transcriptionBaseUrl: "",
        transcriptionModel: "whisper-1",
        transcriptionApiKeyConfigured: false,
        ocrBaseUrl: "",
        ocrModel: "llava",
        ocrApiKeyConfigured: false,
        ocrLang: "eng",
        allowPrivateUrls: false
      },
      status,
      persisted: true
    });

    expect(parsed.profiles).toEqual([]);
    expect(parsed.activeProfileId).toBeUndefined();
  });

  it("accepts LLM reachability and discovery response shapes", () => {
    expect(llmReachabilitySchema.parse({
      reachable: true,
      checked: true,
      mode: "local-openai-compatible",
      status: 200,
      latencyMs: 12
    })).toMatchObject({
      reachable: true,
      checked: true,
      status: 200
    });

    expect(llmReachabilitySchema.safeParse({
      reachable: true,
      mode: "local"
    }).success).toBe(false);

    expect(llmModelDiscoveryResponseSchema.parse({
      scannedAt: "2026-01-01T00:00:00.000Z",
      models: [{
        id: "ollama:llama3",
        provider: "ollama",
        providerLabel: "Ollama",
        source: "local",
        baseUrl: "http://127.0.0.1:11434",
        model: "llama3",
        requiresApiKey: false
      }],
      endpoints: [{
        source: "local",
        baseUrl: "http://127.0.0.1:11434",
        provider: "ollama",
        providerLabel: "Ollama",
        connected: true,
        modelCount: 1
      }],
      errors: []
    })).toMatchObject({
      models: [{ model: "llama3" }],
      endpoints: [{ connected: true }],
      errors: []
    });
  });
});
