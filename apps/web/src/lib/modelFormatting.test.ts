import { describe, expect, it } from "vitest";
import {
  compactMiddle,
  discoveredModelLabel,
  modelDisplayName,
  normalizeModelBaseUrl,
  sameModelBaseUrl
} from "./modelFormatting";

describe("modelFormatting", () => {
  it("keeps short model names unchanged", () => {
    expect(modelDisplayName("irene-fusion")).toBe("irene-fusion");
  });

  it("summarizes Hugging Face cache paths with repo and file names", () => {
    expect(modelDisplayName("/cache/models--huihui-ai--Irene/snapshots/abc/Q4_K_M.gguf"))
      .toBe("huihui-ai/Irene / Q4_K_M.gguf");
  });

  it("uses the file name for ordinary local model paths", () => {
    expect(modelDisplayName("C:\\models\\irene\\fusion.gguf")).toBe("fusion.gguf");
  });

  it("compacts long labels from the middle", () => {
    const compacted = compactMiddle("abcdefghijklmnopqrstuvwxyz", 11);
    expect(compacted).toBe("abcd...wxyz");
  });

  it("combines compact model names with provider labels", () => {
    expect(discoveredModelLabel({
      model: "C:\\models\\irene\\fusion.gguf",
      providerLabel: "LM Studio"
    })).toBe("fusion.gguf | LM Studio");
  });

  it("normalizes localhost model endpoints", () => {
    expect(normalizeModelBaseUrl("http://localhost:1234/v1/")).toBe("http://127.0.0.1:1234/v1");
    expect(sameModelBaseUrl("http://localhost:1234/v1/", "http://127.0.0.1:1234/v1")).toBe(true);
  });
});
