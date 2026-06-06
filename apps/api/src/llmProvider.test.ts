import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSeedState } from "@assini/synthetic-langs";
import {
  buildLlmGenerationInputFromState,
  createLlmProviderFromEnv,
  createOpenAiCompatibleLlmProvider,
  describeLlmProviderFromEnv
} from "./llmProvider";

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

    const input = buildLlmGenerationInputFromState(buildSeedState(), {
      languageId: "avenik",
      mode: "learner_practice",
      prompt: "Help me practice verb chains.",
      contextNoteIds: ["avn-rule-verb-chain-note"],
      contextPassageIds: ["avn-c001"]
    });
    const result = await provider.generateAssistantMessage(input);

    expect(result.content).toBe("Local model response");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();

    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toMatchObject({ model: "llama3.1", temperature: 0.2, stream: false });
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

    const input = buildLlmGenerationInputFromState(buildSeedState(), {
      languageId: "avenik",
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

  it("fails fast for incomplete OpenAI-compatible configuration", () => {
    expect(() => createOpenAiCompatibleLlmProvider({ baseUrl: "http://127.0.0.1:1234/v1", model: " " })).toThrow(
      "ASSINI_LLM_MODEL"
    );
    expect(() => createLlmProviderFromEnv({ ASSINI_LLM_PROVIDER: "openai" })).toThrow("OPENAI_API_KEY");
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

  it("warns when timeout environment values are invalid", () => {
    const status = describeLlmProviderFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "llama3.1",
      ASSINI_LLM_TIMEOUT_MS: "-10"
    });

    expect(status.timeoutMs).toBe(30_000);
    expect(status.warnings).toContain("ASSINI_LLM_TIMEOUT_MS must be a positive integer; using 30000.");
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

    const result = provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildSeedState(), {
      languageId: "avenik",
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
    const result = provider.generateAssistantMessage(buildLlmGenerationInputFromState(buildSeedState(), {
      languageId: "avenik",
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
});
