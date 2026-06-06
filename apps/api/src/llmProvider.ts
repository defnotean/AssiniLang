import type { AiMessage, AiSessionMode, AppState, CorpusPassage, Language, Note } from "@assini/db";

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

type ChatRole = "system" | "user" | "assistant";

export type LlmContextLanguage = {
  id: string;
  name: string;
  typology: Language["typology"];
  description: string;
  orthography: string;
  status: Language["status"];
};

export type LlmContextNote = {
  id: string;
  topic: string;
  explanation: string;
  evidencePassageIds: string[];
  confidence: Note["confidence"];
  status: Note["status"];
  dialectScope: string;
  examples: Array<{
    passageId: string;
    target: string;
    translation: string;
  }>;
};

export type LlmContextPassage = {
  id: string;
  source: string;
  textTarget: string;
  textTranslation: string;
  topicTags: string[];
};

export type LlmConversationMessage = {
  role: ChatRole;
  content: string;
};

export type LlmGenerationInput = {
  languageId: string;
  language?: LlmContextLanguage;
  mode: AiSessionMode;
  prompt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
  notes: LlmContextNote[];
  corpus: LlmContextPassage[];
  previousMessages: LlmConversationMessage[];
};

export type LlmGenerationResult = {
  content: string;
  warnings: string[];
};

export type LlmProvider = {
  name: string;
  generateAssistantMessage(input: LlmGenerationInput): Promise<LlmGenerationResult>;
};

export type OpenAiCompatibleConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
};

export type LlmProviderReadiness = {
  provider: string;
  mode: "deterministic" | "local-openai-compatible" | "remote-api" | "invalid";
  configured: boolean;
  activeProviderName: string;
  baseUrl?: string;
  model?: string;
  timeoutMs: number;
  apiKey: {
    required: boolean;
    configured: boolean;
    acceptedVariables: string[];
  };
  environment: {
    providerVariable: "ASSINI_LLM_PROVIDER";
    baseUrlVariable: "ASSINI_LLM_BASE_URL";
    modelVariable: "ASSINI_LLM_MODEL";
    apiKeyVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"];
    timeoutVariable: "ASSINI_LLM_TIMEOUT_MS";
  };
  setup: {
    localExamples: string[];
    remoteExamples: string[];
  };
  warnings: string[];
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const DEFAULT_REMOTE_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_REMOTE_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_LLM_TIMEOUT_MS = 30_000;
const MAX_CONTEXT_ITEMS = 8;
const MAX_TEXT_CHARS = 1_200;
const MAX_PREVIOUS_MESSAGES = 8;

function trimValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function redactText(text: string, maxChars = MAX_TEXT_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function parsePositiveInteger(value: string | undefined, fallback: number): { value: number; warnings: string[] } {
  const trimmed = trimValue(value);
  if (!trimmed) return { value: fallback, warnings: [] };

  const parsed = Number(trimmed);
  if (Number.isInteger(parsed) && parsed > 0) {
    return { value: parsed, warnings: [] };
  }

  return {
    value: fallback,
    warnings: [`ASSINI_LLM_TIMEOUT_MS must be a positive integer; using ${fallback}.`]
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseHttpBaseUrl(baseUrl: string | undefined): URL | undefined {
  const trimmed = trimValue(baseUrl);
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeConfiguredBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = trimValue(baseUrl);
  if (!trimmed) return undefined;

  const url = parseHttpBaseUrl(trimmed);
  if (!url) return "[configured but not a valid http(s) URL]";

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return normalizeBaseUrl(url.toString());
}

function baseUrlWarnings(baseUrl: string | undefined, missingMessage: string): string[] {
  if (!baseUrl) return [missingMessage];
  return parseHttpBaseUrl(baseUrl) ? [] : ["Configured LLM base URL must be a valid http(s) URL."];
}

function completionUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function safeNote(note: Note): LlmContextNote {
  return {
    id: note.id,
    topic: note.topic,
    explanation: note.explanation,
    evidencePassageIds: [...note.evidencePassageIds],
    confidence: note.confidence,
    status: note.status,
    dialectScope: note.dialectScope,
    examples: note.examples.map((example) => ({
      passageId: example.passageId,
      target: example.target,
      translation: example.translation
    }))
  };
}

function safePassage(passage: CorpusPassage): LlmContextPassage {
  return {
    id: passage.id,
    source: passage.source,
    textTarget: passage.textTarget,
    textTranslation: passage.textTranslation,
    topicTags: [...passage.topicTags]
  };
}

function selectContext<T extends { id: string }>(items: T[], ids: string[]): T[] {
  if (ids.length === 0) return items.slice(0, MAX_CONTEXT_ITEMS);
  const selectedIds = new Set(ids);
  return items.filter((item) => selectedIds.has(item.id)).slice(0, MAX_CONTEXT_ITEMS);
}

function toConversationMessages(messages: Pick<AiMessage, "role" | "content">[] | undefined): LlmConversationMessage[] {
  if (!messages) return [];
  return messages
    .filter((message): message is Pick<AiMessage, "content"> & { role: ChatRole } => (
      message.role === "system" || message.role === "user" || message.role === "assistant"
    ))
    .slice(-MAX_PREVIOUS_MESSAGES)
    .map((message) => ({ role: message.role, content: redactText(message.content) }));
}

export function buildLlmGenerationInputFromState(
  state: AppState,
  params: {
    languageId: string;
    mode: AiSessionMode;
    prompt: string;
    contextNoteIds: string[];
    contextPassageIds: string[];
    previousMessages?: Pick<AiMessage, "role" | "content">[];
  }
): LlmGenerationInput {
  const language = state.languages.find((item) => item.id === params.languageId);
  const languageNotes = state.notes.filter((note) => note.languageId === params.languageId).map(safeNote);
  const languageCorpus = state.corpus.filter((passage) => passage.languageId === params.languageId).map(safePassage);

  return {
    languageId: params.languageId,
    language: language
      ? {
          id: language.id,
          name: language.name,
          typology: language.typology,
          description: language.description,
          orthography: language.orthography,
          status: language.status
        }
      : undefined,
    mode: params.mode,
    prompt: params.prompt,
    contextNoteIds: [...params.contextNoteIds],
    contextPassageIds: [...params.contextPassageIds],
    notes: selectContext(languageNotes, params.contextNoteIds),
    corpus: selectContext(languageCorpus, params.contextPassageIds),
    previousMessages: toConversationMessages(params.previousMessages)
  };
}

function modeInstruction(mode: AiSessionMode): string {
  if (mode === "programmer_debug") {
    return "Mode: programmer_debug. Explain observable behavior, retrieval context, and safe diagnostics only. Do not reveal hidden chain-of-thought or protected answer keys.";
  }
  if (mode === "elder_review") {
    return "Mode: elder_review. Help review synthetic draft language-learning content and surface uncertainty or governance concerns clearly.";
  }
  return "Mode: learner_practice. Help a learner practice with synthetic language data without revealing grading keys or protected internals.";
}

export function buildOpenAiCompatibleMessages(input: LlmGenerationInput): LlmConversationMessage[] {
  const contextSummary = {
    language: input.language ?? { id: input.languageId, missing: true },
    notes: input.notes.map((note) => ({
      id: note.id,
      topic: note.topic,
      status: note.status,
      confidence: note.confidence,
      dialectScope: note.dialectScope,
      explanation: redactText(note.explanation),
      evidencePassageIds: note.evidencePassageIds,
      examples: note.examples.map((example) => ({
        passageId: example.passageId,
        target: redactText(example.target, 300),
        translation: redactText(example.translation, 300)
      }))
    })),
    corpus: input.corpus.map((passage) => ({
      id: passage.id,
      source: passage.source,
      textTarget: redactText(passage.textTarget),
      textTranslation: redactText(passage.textTranslation),
      topicTags: passage.topicTags
    }))
  };

  return [
    {
      role: "system",
      content: [
        "You are AssiniLang's server-side language-learning assistant for synthetic test data.",
        "Use only the supplied public notes and corpus context. If the context is insufficient, say so.",
        "Never expose hidden chain-of-thought, API keys, environment variables, server configuration, answer keys, expected exercise answers, or learner identifiers.",
        "Keep responses concise, cite note or corpus IDs when useful, and label uncertainty."
      ].join(" ")
    },
    ...input.previousMessages,
    {
      role: "user",
      content: [
        modeInstruction(input.mode),
        `Public context JSON: ${JSON.stringify(contextSummary)}`,
        `User prompt: ${redactText(input.prompt)}`
      ].join("\n\n")
    }
  ];
}

export function createDeterministicLlmProvider(): LlmProvider {
  return {
    name: "deterministic",
    async generateAssistantMessage(input) {
      const firstNote = input.notes[0];
      const content = input.language
        ? `Synthetic AI response for ${input.language.name}: ${firstNote?.explanation ?? "No draft note is available yet."}`
        : "Synthetic AI response unavailable.";
      return { content, warnings: ["deterministic-fallback"] };
    }
  };
}

function baseReadinessFields(timeoutMs: number): Pick<LlmProviderReadiness, "apiKey" | "environment" | "setup" | "warnings" | "timeoutMs"> {
  return {
    timeoutMs,
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
    setup: {
      localExamples: [
        "ASSINI_LLM_PROVIDER=openai-compatible ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1 ASSINI_LLM_MODEL=llama3.1",
        "ASSINI_LLM_PROVIDER=lm-studio ASSINI_LLM_BASE_URL=http://127.0.0.1:1234/v1 ASSINI_LLM_MODEL=<local-model-name>"
      ],
      remoteExamples: [
        "ASSINI_LLM_PROVIDER=openai ASSINI_LLM_MODEL=gpt-4o-mini ASSINI_LLM_API_KEY=<server-side-key>",
        "ASSINI_LLM_BASE_URL=https://api.openai.com/v1 ASSINI_LLM_MODEL=gpt-4o-mini OPENAI_API_KEY=<server-side-key>"
      ]
    },
    warnings: []
  };
}

export function describeLlmProviderFromEnv(env: Env = process.env): LlmProviderReadiness {
  const provider = trimValue(env.ASSINI_LLM_PROVIDER)?.toLowerCase();
  const apiKeyConfigured = Boolean(trimValue(env.ASSINI_LLM_API_KEY) ?? trimValue(env.OPENAI_API_KEY));
  const baseUrl = trimValue(env.ASSINI_LLM_BASE_URL);
  const model = trimValue(env.ASSINI_LLM_MODEL) ?? trimValue(env.OPENAI_MODEL);
  const timeout = parsePositiveInteger(env.ASSINI_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
  const timeoutMs = timeout.value;
  const base = baseReadinessFields(timeoutMs);

  if (provider === "deterministic" || provider === "off" || provider === "mock") {
    return {
      ...base,
      provider: provider,
      mode: "deterministic",
      configured: true,
      activeProviderName: "deterministic",
      apiKey: { ...base.apiKey, configured: apiKeyConfigured },
      model,
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      warnings: [...timeout.warnings, "Using deterministic fallback; no external LLM calls will be made."]
    };
  }

  if (provider === "openai" || provider === "remote") {
    const configuredBaseUrl = baseUrl ?? DEFAULT_REMOTE_OPENAI_BASE_URL;
    const warnings = [
      ...timeout.warnings,
      ...(parseHttpBaseUrl(configuredBaseUrl) ? [] : ["Configured LLM base URL must be a valid http(s) URL."]),
      ...(apiKeyConfigured ? [] : ["Remote API mode requires ASSINI_LLM_API_KEY or OPENAI_API_KEY on the API server."])
    ];
    return {
      ...base,
      provider,
      mode: "remote-api",
      configured: warnings.length === 0,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(configuredBaseUrl),
      model: model ?? DEFAULT_REMOTE_OPENAI_MODEL,
      apiKey: { ...base.apiKey, required: true, configured: apiKeyConfigured },
      warnings
    };
  }

  if (provider === "openai-compatible" || provider === "local" || provider === "ollama" || provider === "lm-studio") {
    const warnings = [
      ...timeout.warnings,
      ...baseUrlWarnings(baseUrl, "Local/OpenAI-compatible mode requires ASSINI_LLM_BASE_URL."),
      ...(model ? [] : ["Local/OpenAI-compatible mode requires ASSINI_LLM_MODEL."])
    ];
    return {
      ...base,
      provider,
      mode: "local-openai-compatible",
      configured: warnings.length === 0,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      model,
      apiKey: { ...base.apiKey, required: false, configured: apiKeyConfigured },
      warnings
    };
  }

  if (provider) {
    return {
      ...base,
      provider,
      mode: "invalid",
      configured: false,
      activeProviderName: "none",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      model,
      apiKey: { ...base.apiKey, configured: apiKeyConfigured },
      warnings: [...timeout.warnings, `Unknown ASSINI_LLM_PROVIDER: ${provider}`]
    };
  }

  if (baseUrl && model) {
    return {
      ...base,
      provider: "openai-compatible",
      mode: "local-openai-compatible",
      configured: true,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      model,
      apiKey: { ...base.apiKey, required: false, configured: apiKeyConfigured },
      warnings: timeout.warnings
    };
  }

  if (apiKeyConfigured) {
    return {
      ...base,
      provider: "openai",
      mode: "remote-api",
      configured: true,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl ?? DEFAULT_REMOTE_OPENAI_BASE_URL),
      model: model ?? DEFAULT_REMOTE_OPENAI_MODEL,
      apiKey: { ...base.apiKey, required: true, configured: true },
      warnings: timeout.warnings
    };
  }

  return {
    ...base,
    provider: "deterministic",
    mode: "deterministic",
    configured: true,
    activeProviderName: "deterministic",
    baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
    model,
    apiKey: { ...base.apiKey, configured: false },
    warnings: [...timeout.warnings, "No LLM provider configured; using deterministic fallback for safe local development."]
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessageFromBody(body: unknown): string | undefined {
  if (typeof body === "string" && body.trim().length > 0) return body.trim();
  if (!body || typeof body !== "object") return undefined;

  const record = body as Record<string, unknown>;
  for (const key of ["message", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const error = record.error;
  if (typeof error === "string" && error.trim().length > 0) return error.trim();
  if (error && typeof error === "object") {
    return errorMessageFromBody(error);
  }

  return undefined;
}

function sanitizeProviderErrorDetail(detail: string, apiKey?: string): string {
  let sanitized = redactText(detail, 500);
  if (apiKey) {
    sanitized = sanitized.split(apiKey).join("[redacted-secret]");
  }
  return sanitized.replace(/\bsk-[A-Za-z0-9._-]+/g, "[redacted-secret]");
}

async function readProviderErrorDetail(response: Response, apiKey?: string): Promise<string | undefined> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return undefined;

  try {
    const parsed = JSON.parse(text) as unknown;
    const message = errorMessageFromBody(parsed);
    return message ? sanitizeProviderErrorDetail(message, apiKey) : undefined;
  } catch {
    return sanitizeProviderErrorDetail(text, apiKey);
  }
}

export function createOpenAiCompatibleLlmProvider(
  config: OpenAiCompatibleConfig,
  fetchFn: FetchFn = globalThis.fetch
): LlmProvider {
  const baseUrl = trimValue(config.baseUrl);
  const model = trimValue(config.model);
  if (!baseUrl) {
    throw new Error("ASSINI_LLM_BASE_URL is required for OpenAI-compatible LLM providers");
  }
  if (!model) {
    throw new Error("ASSINI_LLM_MODEL is required for OpenAI-compatible LLM providers");
  }

  const apiKey = trimValue(config.apiKey);
  const timeoutMs = Number.isInteger(config.timeoutMs) && (config.timeoutMs ?? 0) > 0
    ? config.timeoutMs as number
    : DEFAULT_LLM_TIMEOUT_MS;

  return {
    name: "openai-compatible",
    async generateAssistantMessage(input) {
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetchFn(completionUrl(baseUrl), {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: buildOpenAiCompatibleMessages(input),
            temperature: 0.2,
            stream: false
          })
        });

        if (!response.ok) {
          const detail = await readProviderErrorDetail(response, apiKey);
          throw new Error(
            detail
              ? `LLM provider request failed with status ${response.status}: ${detail}`
              : `LLM provider request failed with status ${response.status}`
          );
        }

        const payload = await response.json() as OpenAiChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new Error("LLM provider returned an empty assistant message");
        }

        return { content: content.trim(), warnings: [] };
      } catch (error) {
        if (timedOut || isAbortError(error)) {
          throw new Error(`LLM provider request timed out after ${timeoutMs}ms`, { cause: error });
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function createLlmProviderFromEnv(env: Env = process.env, fetchFn: FetchFn = globalThis.fetch): LlmProvider {
  const provider = trimValue(env.ASSINI_LLM_PROVIDER)?.toLowerCase();

  if (provider === "deterministic" || provider === "off" || provider === "mock") {
    return createDeterministicLlmProvider();
  }

  const apiKey = trimValue(env.ASSINI_LLM_API_KEY) ?? trimValue(env.OPENAI_API_KEY);
  const baseUrl = trimValue(env.ASSINI_LLM_BASE_URL);
  const model = trimValue(env.ASSINI_LLM_MODEL) ?? trimValue(env.OPENAI_MODEL);
  const timeoutMs = parsePositiveInteger(env.ASSINI_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS).value;

  if (provider === "openai" || provider === "remote") {
    if (!apiKey) {
      throw new Error("ASSINI_LLM_API_KEY or OPENAI_API_KEY is required when ASSINI_LLM_PROVIDER=openai");
    }
    return createOpenAiCompatibleLlmProvider({
      baseUrl: baseUrl ?? DEFAULT_REMOTE_OPENAI_BASE_URL,
      model: model ?? DEFAULT_REMOTE_OPENAI_MODEL,
      apiKey,
      timeoutMs
    }, fetchFn);
  }

  if (provider === "openai-compatible" || provider === "local" || provider === "ollama" || provider === "lm-studio") {
    return createOpenAiCompatibleLlmProvider({
      baseUrl: baseUrl ?? "",
      model: model ?? "",
      apiKey,
      timeoutMs
    }, fetchFn);
  }

  if (provider) {
    throw new Error(`Unknown ASSINI_LLM_PROVIDER: ${provider}`);
  }

  if (baseUrl && model) {
    return createOpenAiCompatibleLlmProvider({ baseUrl, model, apiKey, timeoutMs }, fetchFn);
  }

  if (apiKey) {
    return createOpenAiCompatibleLlmProvider({
      baseUrl: baseUrl ?? DEFAULT_REMOTE_OPENAI_BASE_URL,
      model: model ?? DEFAULT_REMOTE_OPENAI_MODEL,
      apiKey,
      timeoutMs
    }, fetchFn);
  }

  return createDeterministicLlmProvider();
}
