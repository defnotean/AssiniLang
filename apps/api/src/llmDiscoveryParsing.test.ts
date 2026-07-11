import { describe, expect, it } from "vitest";
import { parseDiscoveryModelIds } from "./llmDiscoveryParsing.js";

describe("discovery response parsing", () => {
  it("accepts OpenAI data and models variants while dropping blank or invalid entries", () => {
    expect(
      parseDiscoveryModelIds("openai-models", {
        data: [" direct ", { id: " id " }, { model: "model" }, { key: "key" }, { selected_variant: "variant" }, {}, 4]
      })
    ).toEqual(["direct", "id", "model", "key", "variant"]);
    expect(parseDiscoveryModelIds("openai-models", { models: [{ name: "fallback" }] })).toEqual(["fallback"]);
    expect(parseDiscoveryModelIds("openai-models", null)).toEqual([]);
    expect(parseDiscoveryModelIds("openai-models", { data: "not-an-array" })).toEqual([]);
  });

  it("parses Ollama model objects and fails closed for malformed payloads", () => {
    expect(parseDiscoveryModelIds("ollama-tags", { models: [{ name: "qwen" }, { model: "llama" }] })).toEqual([
      "qwen",
      "llama"
    ]);
    expect(parseDiscoveryModelIds("ollama-tags", { models: {} })).toEqual([]);
    expect(parseDiscoveryModelIds("ollama-tags", "invalid")).toEqual([]);
  });

  it("returns only loaded non-embedding LM Studio v1 instances and uses the model fallback", () => {
    expect(
      parseDiscoveryModelIds("lm-studio-native-v1", {
        models: [
          { id: "embedding", type: "Embeddings", loaded_instances: [{ id: "hidden" }] },
          { id: "unloaded", loaded_instances: [] },
          { id: "fallback", loaded_instances: [{}] },
          { id: "base", loaded_instances: [{ id: "instance-a" }, { model: "instance-b" }] },
          null
        ]
      })
    ).toEqual(["fallback", "instance-a", "instance-b"]);
    expect(
      parseDiscoveryModelIds("lm-studio-native-v1", { data: [{ id: "from-data", loaded_instances: [{}] }] })
    ).toEqual(["from-data"]);
  });

  it("returns only loaded non-embedding LM Studio v0 models", () => {
    expect(
      parseDiscoveryModelIds("lm-studio-native-v0", {
        data: [
          { id: "loaded", state: "loaded" },
          { model: "ready", state: "READY" },
          { name: "memory", state: "loaded-in-memory" },
          { id: "loading", state: "loading" },
          { id: "embedding", type: "embedding", state: "loaded" },
          { id: "missing-state" },
          7
        ]
      })
    ).toEqual(["loaded", "ready", "memory"]);
    expect(parseDiscoveryModelIds("lm-studio-native-v0", {})).toEqual([]);
  });
});
