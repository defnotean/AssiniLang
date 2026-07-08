import { describe, expect, it } from "vitest";
import {
  createAiSessionPayloadSchema,
  elderCorrectionPayloadSchema,
  languageCreatePayloadSchema,
  languagePatchPayloadSchema,
  obsidianVaultImportPayloadSchema,
  processSourceOptionsSchema,
  sourceRegistrationPayloadSchema,
  sourceTextRegistrationKindSchema,
  sourceUploadKindSchema
} from "./apiContract.js";
import {
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
      clearApiKey: false
    })).toEqual({
      provider: "openai-compatible",
      apiKey: "secret",
      clearApiKey: false
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
});
