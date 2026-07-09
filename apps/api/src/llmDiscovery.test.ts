import { describe, expect, it } from "vitest";
import {
  DISCOVERY_SCAN_CONCURRENCY,
  discoverLlmModels,
  LlmDiscoveryInputLimitError,
  MAX_EXTRA_DISCOVERY_BASE_URLS
} from "./llmDiscovery.js";

describe("LLM model discovery", () => {
  it("rejects excessive unique requested endpoints before network work", async () => {
    let fetchCalls = 0;
    let lookupCalls = 0;

    await expect(discoverLlmModels({
      env: {},
      fetchFn: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
      extraBaseUrls: Array.from(
        { length: MAX_EXTRA_DISCOVERY_BASE_URLS + 1 },
        (_, index) => `https://models-${index}.example/v1`
      ),
      includeCommonTargets: false,
      lookupFn: async () => {
        lookupCalls += 1;
        return { address: "93.184.216.34", family: 4 };
      }
    })).rejects.toBeInstanceOf(LlmDiscoveryInputLimitError);

    expect(fetchCalls).toBe(0);
    expect(lookupCalls).toBe(0);
  });

  it("discovers OpenAI-compatible and Ollama native model lists", async () => {
    const seenUrls: string[] = [];
    const fetchStub: typeof fetch = async (input) => {
      const url = input.toString();
      seenUrls.push(url);
      if (url === "http://irene-box:8080/v1/models") {
        return new Response(JSON.stringify({
          data: [{ id: "irene-fusion" }, { id: "irene-lite" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "http://127.0.0.1:11434/api/tags") {
        return new Response(JSON.stringify({
          models: [{ name: "llama3.1:8b" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("missing", { status: 404 });
    };

    const result = await discoverLlmModels({
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn: fetchStub,
      extraBaseUrls: ["http://irene-box:8080", "http://127.0.0.1:11434"],
      includeCommonTargets: false,
      timeoutMs: 500
    });

    expect(seenUrls).toContain("http://irene-box:8080/v1/models");
    expect(seenUrls).toContain("http://127.0.0.1:11434/api/tags");
    expect(result.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "openai-compatible",
        baseUrl: "http://irene-box:8080/v1",
        model: "irene-fusion"
      }),
      expect.objectContaining({
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1:8b"
      })
    ]));
    expect(result.endpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        baseUrl: "http://irene-box:8080/v1",
        connected: true,
        modelCount: 2
      }),
      expect.objectContaining({
        baseUrl: "http://127.0.0.1:11434/v1",
        connected: true,
        modelCount: 1
      })
    ]));
  });

  it("uses a configured root API key for its normalized /v1 discovery target", async () => {
    const fetchStub: typeof fetch = async (input, init) => {
      expect(input.toString()).toBe("http://model-host:9000/v1/models");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer local-secret");
      return new Response(JSON.stringify({
        data: [{ id: "configured-model" }]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await discoverLlmModels({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://model-host:9000",
        ASSINI_LLM_API_KEY: "local-secret"
      },
      fetchFn: fetchStub,
      includeCommonTargets: false,
      timeoutMs: 500,
      lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
    });

    expect(result.models[0]).toMatchObject({
      baseUrl: "http://model-host:9000/v1",
      model: "configured-model"
    });
    expect(JSON.stringify(result)).not.toContain("local-secret");
  });

  it("uses LM Studio native loaded instances instead of stale OpenAI-visible models", async () => {
    const seenUrls: string[] = [];
    const fetchStub: typeof fetch = async (input) => {
      const url = input.toString();
      seenUrls.push(url);
      if (url === "http://127.0.0.1:1234/api/v1/models") {
        return new Response(JSON.stringify({
          models: [
            {
              type: "llm",
              key: "downloaded-old-model",
              display_name: "Downloaded Old Model",
              loaded_instances: []
            },
            {
              type: "llm",
              key: "new-loaded-model",
              display_name: "New Loaded Model",
              loaded_instances: [{ id: "new-loaded-model" }]
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "http://127.0.0.1:1234/v1/models") {
        return new Response(JSON.stringify({
          data: [{ id: "downloaded-old-model" }, { id: "new-loaded-model" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("missing", { status: 404 });
    };

    const result = await discoverLlmModels({
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn: fetchStub,
      extraBaseUrls: ["http://127.0.0.1:1234/v1"],
      includeCommonTargets: false,
      timeoutMs: 500
    });

    expect(seenUrls).toContain("http://127.0.0.1:1234/api/v1/models");
    expect(seenUrls).toContain("http://127.0.0.1:1234/v1/models");
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toMatchObject({
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "new-loaded-model"
    });
    expect(result.models.map((model) => model.model)).not.toContain("downloaded-old-model");
    expect(result.endpoints).toEqual([
      expect.objectContaining({
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        connected: true,
        modelCount: 1
      })
    ]);
  });

  it("blocks SSRF-protected extra base URLs unless private URLs are allowed", async () => {
    const fetchStub: typeof fetch = async () => new Response("blocked", { status: 200 });
    const blocked = await discoverLlmModels({
      env: {},
      fetchFn: fetchStub,
      extraBaseUrls: ["http://127.0.0.1:11434"],
      includeCommonTargets: false,
      timeoutMs: 500
    });

    expect(blocked.models).toEqual([]);
    expect(blocked.errors).toEqual([
      expect.objectContaining({
        source: "Requested endpoint",
        baseUrl: "http://127.0.0.1:11434",
        detail: expect.stringMatching(/private or local network/)
      })
    ]);

    const allowed = await discoverLlmModels({
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn: async (input) => {
        if (input.toString().endsWith("/api/tags")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
      extraBaseUrls: ["http://127.0.0.1:11434"],
      includeCommonTargets: false,
      timeoutMs: 500
    });

    expect(allowed.errors).toEqual([]);
  });

  it("blocks configured and common local discovery targets when private URLs are disallowed", async () => {
    const seenUrls: string[] = [];
    const fetchStub: typeof fetch = async (input) => {
      seenUrls.push(input.toString());
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };

    const result = await discoverLlmModels({
      env: {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_BASE_URL: "http://127.0.0.1:9000/v1",
        ASSINI_LLM_DISCOVERY_BASE_URLS: "http://10.0.0.8:8080/v1"
      },
      fetchFn: fetchStub,
      includeCommonTargets: true,
      timeoutMs: 500
    });

    expect(seenUrls).toEqual([]);
    expect(result.models).toEqual([]);
    expect(result.endpoints).toEqual([]);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "Configured endpoint",
        baseUrl: "http://127.0.0.1:9000/v1",
        detail: expect.stringMatching(/private or local network/)
      }),
      expect.objectContaining({
        source: "Discovery endpoint",
        baseUrl: "http://10.0.0.8:8080/v1",
        detail: expect.stringMatching(/private or local network/)
      })
    ]));
    // Common localhost targets are skipped silently (reportErrors: false).
    expect(result.errors.every((error) => !/Ollama local|LM Studio local|llama\.cpp local|Local model server/.test(error.source))).toBe(true);
  });

  it("scans common localhost targets only when ASSINI_ALLOW_PRIVATE_URLS is on", async () => {
    const seenUrls: string[] = [];
    const fetchStub: typeof fetch = async (input) => {
      seenUrls.push(input.toString());
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    await discoverLlmModels({
      env: {},
      fetchFn: fetchStub,
      includeCommonTargets: true,
      timeoutMs: 500
    });
    expect(seenUrls.some((url) => url.includes("127.0.0.1") || url.includes("localhost"))).toBe(false);

    seenUrls.length = 0;
    await discoverLlmModels({
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn: fetchStub,
      includeCommonTargets: true,
      timeoutMs: 500
    });
    expect(seenUrls.some((url) => url.includes("127.0.0.1") || url.includes("localhost"))).toBe(true);
  });

  it("reports unreachable requested endpoints without leaking raw fetch errors", async () => {
    const result = await discoverLlmModels({
      env: {},
      fetchFn: async () => {
        throw new TypeError("fetch failed");
      },
      extraBaseUrls: ["http://offline-box:8080/v1"],
      includeCommonTargets: false,
      timeoutMs: 500,
      lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
    });

    expect(result.models).toEqual([]);
    expect(result.endpoints).toEqual([
      expect.objectContaining({
        baseUrl: "http://offline-box:8080/v1",
        connected: false,
        detail: expect.stringContaining("Could not connect")
      })
    ]);
    expect(result.errors[0].detail).toContain("Could not connect");
    expect(result.errors[0].detail).not.toBe("fetch failed");
  });

  it("redacts bearer tokens and URL credentials from discovery failure details", async () => {
    const result = await discoverLlmModels({
      env: {
        ASSINI_LLM_API_KEY: "plain-discovery-secret"
      },
      fetchFn: async () => {
        throw new Error("upstream rejected Bearer plain-discovery-secret api_key=query-leak");
      },
      extraBaseUrls: ["https://user:url-pass-secret@models.example/v1"],
      includeCommonTargets: false,
      timeoutMs: 500,
      lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("plain-discovery-secret");
    expect(serialized).not.toContain("url-pass-secret");
    expect(serialized).not.toContain("query-leak");
    expect(result.errors.some((entry) => entry.detail.includes("[redacted-secret]"))).toBe(true);
  });

  it("deduplicates localhost and 127.0.0.1 aliases for the same local model", async () => {
    const seenUrls: string[] = [];
    const result = await discoverLlmModels({
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn: async (input) => {
        seenUrls.push(input.toString());
        return new Response(JSON.stringify({
          data: [{ id: "Irene" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      },
      extraBaseUrls: [
        "http://127.0.0.1:12345",
        "http://localhost:12345/v1/",
        "http://127.0.0.1:12345/v1?refresh=true"
      ],
      includeCommonTargets: false,
      timeoutMs: 500
    });

    expect(seenUrls).toEqual(["http://127.0.0.1:12345/v1/models"]);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toMatchObject({
      baseUrl: "http://127.0.0.1:12345/v1",
      model: "Irene"
    });
    expect(result.endpoints).toHaveLength(1);
  });

  it("keeps discovery fetches within the configured concurrency bound", async () => {
    const targetCount = DISCOVERY_SCAN_CONCURRENCY + 2;
    let active = 0;
    let maxActive = 0;
    let started = 0;
    let releaseFetches!: () => void;
    let resolveSaturated!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetches = resolve;
    });
    const saturated = new Promise<void>((resolve) => {
      resolveSaturated = resolve;
    });

    const discovery = discoverLlmModels({
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn: async () => {
        started += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (active === DISCOVERY_SCAN_CONCURRENCY) resolveSaturated();
        await fetchGate;
        active -= 1;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
      extraBaseUrls: Array.from(
        { length: targetCount },
        (_, index) => `http://127.0.0.1:${9_000 + index}/v1`
      ),
      includeCommonTargets: false,
      timeoutMs: 5_000
    });

    await saturated;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const startedBeforeRelease = started;
    releaseFetches();
    const result = await discovery;

    expect(startedBeforeRelease).toBe(DISCOVERY_SCAN_CONCURRENCY);
    expect(maxActive).toBe(DISCOVERY_SCAN_CONCURRENCY);
    expect(started).toBe(targetCount);
    expect(result.endpoints).toHaveLength(targetCount);
  });
});
