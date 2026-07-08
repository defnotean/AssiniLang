import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import {
  buildLlmGenerationInputFromState,
  createDeterministicLlmProvider,
  createLlmProviderFromEnv,
  createOpenAiCompatibleLlmProvider,
  describeLlmProviderFromEnv,
  probeLlmProviderReachability
} from "./llmProvider.js";

describe("llm provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function captureFetch(responseContent = "Model response") {
    const calls: Array<{ url: string; init: Parameters<typeof fetch>[1] }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: responseContent } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };
    return { calls, fetchFn };
  }

  it("builds OpenAI-compatible requests for local endpoints without requiring an API key", async () => {
    const { calls, fetchFn } = captureFetch("Local model response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1/",
      ASSINI_LLM_MODEL: "llama3.1"
    }, fetchFn);

    const input = buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Help me practice suffix order.",
      contextNoteIds: ["testlang-note-basic-order"],
      contextPassageIds: ["testlang-c001"]
    });
    const result = await provider.generateAssistantMessage(input);

    expect(result.content).toBe("Local model response");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toMatchObject({ model: "llama3.1", temperature: 0.2, stream: false });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("You are AssiniLang's server-side language-learning assistant.");
    expect(JSON.stringify(body)).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(body)).not.toContain("expectedAnswers");
    expect(JSON.stringify(body)).not.toContain("gradingExplanation");
  });

  it("sends remote API keys only in authorization headers and never in prompt bodies", async () => {
    const { calls, fetchFn } = captureFetch("Remote model response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-secret",
      ASSINI_LLM_MODEL: "gpt-test"
    }, fetchFn);

    const input = buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "programmer_debug",
      prompt: "Summarize safe context.",
      contextNoteIds: [],
      contextPassageIds: []
    });
    const result = await provider.generateAssistantMessage(input);

    expect(result.content).toBe("Remote model response");
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test-secret");
    expect(calls[0].init?.body as string).not.toContain("sk-test-secret");
  });

  it("returns deterministic offline responses without exposing an extraction chat surface", async () => {
    const provider = createDeterministicLlmProvider();
    expect(provider.name).toBe("deterministic");
    expect(provider.completeChat).toBeUndefined();

    const input = buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: ["testlang-note-basic-order"],
      contextPassageIds: ["testlang-c001"]
    });
    const result = await provider.generateAssistantMessage(input);

    expect(result.content).toBe(
      "Deterministic offline response for Testlang: Subjects precede verbs in simple clauses, and person suffixes close the verb form."
    );
    expect(result.warnings).toContain("deterministic-fallback");
  });

  it("exposes completeChat on OpenAI-compatible providers for extraction with a low temperature", async () => {
    const { calls, fetchFn } = captureFetch('{"summary":"extracted"}');
    const provider = createOpenAiCompatibleLlmProvider({
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1"
    }, fetchFn);

    const content = await provider.completeChat?.([
      { role: "system", content: "Extract structured data." },
      { role: "user", content: "mira = river" }
    ]);

    expect(content).toBe('{"summary":"extracted"}');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toMatchObject({ model: "llama3.1", temperature: 0.1, stream: false });
    expect(body.messages).toEqual([
      { role: "system", content: "Extract structured data." },
      { role: "user", content: "mira = river" }
    ]);
  });

  it("fails fast for incomplete OpenAI-compatible construction config", () => {
    expect(() => createOpenAiCompatibleLlmProvider({ baseUrl: "http://127.0.0.1:1234/v1", model: " " })).toThrow(
      "ASSINI_LLM_MODEL"
    );
  });

  it("never throws on misconfiguration: remote provider without an API key degrades to deterministic", () => {
    const provider = createLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "openai" });
    expect(provider.name).toBe("deterministic");
    expect(provider.completeChat).toBeUndefined();

    const status = describeLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "openai" });
    expect(status.mode).toBe("remote-api");
    expect(status.configured).toBe(false);
    expect(status.warnings).toContain(
      "Remote API mode requires ASSINI_LLM_API_KEY or OPENAI_API_KEY on the API server."
    );
  });

  it("never throws on misconfiguration: local provider without base URL/model degrades to deterministic", () => {
    const provider = createLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "openai-compatible" });
    expect(provider.name).toBe("deterministic");
    expect(provider.completeChat).toBeUndefined();

    const status = describeLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "openai-compatible" });
    expect(status.mode).toBe("local-openai-compatible");
    expect(status.configured).toBe(false);
    expect(status.warnings).toContain("Local/OpenAI-compatible mode requires ASSINI_LLM_BASE_URL.");
    expect(status.warnings).toContain("Local/OpenAI-compatible mode requires ASSINI_LLM_MODEL.");
  });

  it("never throws on misconfiguration: unknown provider value degrades to deterministic and reports invalid mode", () => {
    const provider = createLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "totally-made-up" });
    expect(provider.name).toBe("deterministic");
    expect(provider.completeChat).toBeUndefined();

    const status = describeLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "totally-made-up" });
    expect(status.mode).toBe("invalid");
    expect(status.configured).toBe(false);
    expect(status.warnings).toContain("Unknown ASSINI_LLM_PROVIDER: totally-made-up");
  });

  it("describes LLM readiness without exposing API key values", () => {
    const status = describeLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai",
      ASSINI_LLM_API_KEY: "super-secret-key",
      ASSINI_LLM_MODEL: "gpt-test"
    });

    expect(status).toMatchObject({
      provider: "openai",
      mode: "remote-api",
      configured: true,
      model: "gpt-test",
      apiKey: { required: true, configured: true }
    });
    expect(JSON.stringify(status)).not.toContain("super-secret-key");
  });

  it("sanitizes configured LLM and transcription base URLs in readiness output", () => {
    const status = describeLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: " http://user:password@127.0.0.1:11434/v1?api_key=secret#fragment ",
      ASSINI_LLM_MODEL: "irene-fusion",
      ASSINI_TRANSCRIBE_BASE_URL: "https://token:secret@transcribe.example.test/v1?api_key=hidden#fragment",
      ASSINI_TRANSCRIBE_MODEL: "whisper-local"
    });

    expect(status.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(status.transcription.baseUrl).toBe("https://transcribe.example.test/v1");
    expect(JSON.stringify(status)).not.toContain("password");
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain("api_key");
  });

  it("reports invalid local LLM base URLs without marking the provider configured", () => {
    const status = describeLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "file:///tmp/model",
      ASSINI_LLM_MODEL: "irene-fusion"
    });

    expect(status.mode).toBe("local-openai-compatible");
    expect(status.configured).toBe(false);
    expect(status.baseUrl).toBe("[configured but not a valid http(s) URL]");
    expect(status.warnings).toContain("Configured LLM base URL must be a valid http(s) URL.");
  });

  it("describes transcription readiness from the ASSINI_TRANSCRIBE_* environment variables", () => {
    const unconfigured = describeLlmProviderFromEnv({});
    expect(unconfigured.transcription).toMatchObject({
      configured: false,
      baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
      modelVariable: "ASSINI_TRANSCRIBE_MODEL"
    });
    expect(unconfigured.transcription.baseUrl).toBeUndefined();

    const configured = describeLlmProviderFromEnv({
      ASSINI_TRANSCRIBE_BASE_URL: "http://127.0.0.1:9000/",
      ASSINI_TRANSCRIBE_MODEL: "whisper-large"
    });
    expect(configured.transcription).toMatchObject({
      configured: true,
      baseUrl: "http://127.0.0.1:9000",
      model: "whisper-large",
      baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
      modelVariable: "ASSINI_TRANSCRIBE_MODEL"
    });

    const invalid = describeLlmProviderFromEnv({
      ASSINI_TRANSCRIBE_BASE_URL: "not-a-url"
    });
    expect(invalid.transcription.configured).toBe(false);
    expect(invalid.transcription.baseUrl).toBe("[configured but not a valid http(s) URL]");
  });

  it("warns when timeout environment values are invalid", () => {
    const status = describeLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      ASSINI_LLM_TIMEOUT_MS: "-10"
    });

    expect(status.timeoutMs).toBe(180_000);
    expect(status.warnings).toContain("ASSINI_LLM_TIMEOUT_MS must be a positive integer; using 180000.");
  });

  it("turns provider request timeouts into actionable errors", async () => {
    vi.useFakeTimers();
    const fetchFn: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const provider = createOpenAiCompatibleLlmProvider({
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1",
      timeoutMs: 25
    }, fetchFn);

    const result = provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));
    const assertion = expect(result).rejects.toThrow("LLM provider request timed out after 25ms");
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });

  it("includes sanitized provider error details for non-OK responses", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({
        error: {
          message: "Rate limit exceeded for sk-provider-secret"
        }
      }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });

    const provider = createOpenAiCompatibleLlmProvider({
      baseUrl: "https://api.example.invalid/v1",
      model: "gpt-test",
      apiKey: "sk-provider-secret"
    }, fetchFn);
    const result = provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "programmer_debug",
      prompt: "Summarize safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    await expect(result).rejects.toThrow(
      "LLM provider request failed with status 429: Rate limit exceeded for [redacted-secret]"
    );
    await expect(result).rejects.not.toThrow("sk-provider-secret");
  });

  it("sends a default max_tokens on every request and never a response_format on the chat path", async () => {
    const { calls, fetchFn } = captureFetch("Chat response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      ASSINI_LLM_JSON_MODE: "true"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.max_tokens).toBe(4096);
    expect(body.response_format).toBeUndefined();
  });

  it("honors ASSINI_LLM_MAX_TOKENS and sends json mode only on the extraction path", async () => {
    const { calls, fetchFn } = captureFetch('{"ok":true}');
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      ASSINI_LLM_MAX_TOKENS: "256",
      ASSINI_LLM_JSON_MODE: "1"
    }, fetchFn);

    await provider.completeChat?.([{ role: "user", content: "mira = river" }]);

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0.1);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("ignores invalid ASSINI_LLM_MAX_TOKENS and falls back to the default", async () => {
    const { calls, fetchFn } = captureFetch("Chat response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      ASSINI_LLM_MAX_TOKENS: "not-a-number"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.max_tokens).toBe(4096);
  });

  it("does NOT send json mode on completeChat unless ASSINI_LLM_JSON_MODE is enabled", async () => {
    const { calls, fetchFn } = captureFetch('{"ok":true}');
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1"
    }, fetchFn);

    await provider.completeChat?.([{ role: "user", content: "extract" }]);

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.response_format).toBeUndefined();
  });

  it("normalizes a bare ollama base URL to include /v1 before posting", async () => {
    const { calls, fetchFn } = captureFetch("Ollama response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "ollama",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434",
      ASSINI_LLM_MODEL: "llama3.1"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    expect(calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });

  it("does not double-append /v1 when an ollama base URL already includes it", async () => {
    const { calls, fetchFn } = captureFetch("Ollama response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "ollama",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    expect(calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });

  it("does not forward the OPENAI_API_KEY fallback to a local endpoint", async () => {
    const { calls, fetchFn } = captureFetch("Local response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "ollama",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      OPENAI_API_KEY: "sk-remote-secret"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("forwards an explicit ASSINI_LLM_API_KEY to a local endpoint", async () => {
    const { calls, fetchFn } = captureFetch("Local response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      ASSINI_LLM_API_KEY: "explicit-local-key"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer explicit-local-key");
  });

  it("still forwards the OPENAI_API_KEY fallback to a remote endpoint", async () => {
    const { calls, fetchFn } = captureFetch("Remote response");
    const provider = createLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai",
      ASSINI_LLM_MODEL: "gpt-test",
      OPENAI_API_KEY: "sk-remote-secret"
    }, fetchFn);

    await provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildTestWorkspaceState(), {
      languageId: TEST_LANGUAGE_ID,
      mode: "learner_practice",
      prompt: "Practice safely.",
      contextNoteIds: [],
      contextPassageIds: []
    }));

    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-remote-secret");
  });

  it("reports reachability as unchecked for the deterministic fallback without any network call", async () => {
    let called = false;
    const fetchFn: typeof fetch = async () => {
      called = true;
      return new Response("", { status: 200 });
    };

    const result = await probeLlmProviderReachability({ env: {}, fetchFn });

    expect(called).toBe(false);
    expect(result).toMatchObject({
      checked: false,
      reachable: false,
      mode: "deterministic",
      detail: "No external provider is configured."
    });
  });

  it("reports a configured provider as reachable when a tiny chat completion returns 200", async () => {
    const calls: Array<{ url: string; method?: string; body?: Record<string, unknown> }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      calls.push({ url, method: init?.method, body });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
        ASSINI_LLM_MODEL: "llama3.1"
      },
      fetchFn
    });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:11434/v1/chat/completions",
        method: "POST",
        body: expect.objectContaining({
          model: "llama3.1",
          max_tokens: 256,
          stream: false
        })
      }
    ]);
    expect(result).toMatchObject({
      checked: true,
      reachable: true,
      mode: "local-openai-compatible",
      status: 200
    });
    expect(typeof result.latencyMs).toBe("number");
  });

  it("reports a provider as unreachable when chat completions fails even if the model server is up", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, method: init?.method });
      return new Response("<urlopen error [Errno 111] Connection refused>", { status: 503 });
    };

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
        ASSINI_LLM_MODEL: "local-model"
      },
      fetchFn
    });

    expect(calls).toEqual([
      { url: "http://127.0.0.1:1234/v1/chat/completions", method: "POST" }
    ]);
    expect(result).toMatchObject({
      checked: true,
      reachable: false,
      status: 503,
      detail: "Chat completions failed with status 503: <urlopen error [Errno 111] Connection refused>"
    });
  });

  it("uses ASSINI_LLM_TIMEOUT_MS for reachability probes instead of a short fixed default", async () => {
    const scheduledTimeouts: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, timeout, ...args) => {
      if (typeof timeout === "number") scheduledTimeouts.push(timeout);
      return originalSetTimeout(handler, timeout, ...args);
    });

    const fetchFn: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

    await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
        ASSINI_LLM_MODEL: "llama3.1",
        ASSINI_LLM_TIMEOUT_MS: "120"
      },
      fetchFn
    });

    expect(scheduledTimeouts).toContain(120);
  });

  it("reports a provider as unreachable when chat completions returns no assistant text", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
        ASSINI_LLM_MODEL: "local-model"
      },
      fetchFn
    });

    expect(result).toMatchObject({
      checked: true,
      reachable: false,
      status: 200,
      detail: "Chat completions returned an empty assistant message."
    });
  });

  it("reports reasoning-only local model responses without exposing reasoning content", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: "", reasoning_content: "private internal reasoning" } }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
        ASSINI_LLM_MODEL: "local-model"
      },
      fetchFn
    });

    expect(result).toMatchObject({
      checked: true,
      reachable: false,
      status: 200,
      detail: "LLM provider returned only reasoning_content without visible assistant content. Increase max tokens or choose a model that emits final content."
    });
    expect(JSON.stringify(result)).not.toContain("private internal reasoning");
  });

  it("reports a provider as unreachable when chat completions returns thinking-only placeholder text", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "[THINK]" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
        ASSINI_LLM_MODEL: "local-model"
      },
      fetchFn
    });

    expect(result).toMatchObject({
      checked: true,
      reachable: false,
      status: 200,
      detail: "Chat completions returned an empty assistant message."
    });
  });

  it("accepts array-shaped assistant content from OpenAI-compatible providers", async () => {
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: [{ type: "text", text: "ok from parts" }] } }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:1234/v1",
        ASSINI_LLM_MODEL: "local-model"
      },
      fetchFn
    });

    expect(result).toMatchObject({ checked: true, reachable: true, status: 200 });
  });

  it("reports a configured provider as unreachable when the network throws", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    };

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
        ASSINI_LLM_MODEL: "llama3.1"
      },
      fetchFn
    });

    expect(result).toMatchObject({ checked: true, reachable: false, mode: "local-openai-compatible" });
    expect(result.detail).toContain("ECONNREFUSED");
  });

  it("redacts secrets from reachability failure detail", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new Error("auth failed using sk-super-secret-token");
    };

    const result = await probeLlmProviderReachability({
      env: {
        ASSINI_LLM_PROVIDER: "openai",
        ASSINI_LLM_MODEL: "gpt-test",
        ASSINI_LLM_API_KEY: "sk-super-secret-token"
      },
      fetchFn
    });

    expect(result.reachable).toBe(false);
    expect(result.detail).not.toContain("sk-super-secret-token");
    expect(result.detail).toContain("[redacted-secret]");
  });
});
