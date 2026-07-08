import { afterEach, describe, expect, it } from "vitest";
import { redactConfiguredSecrets, redactErrorSecrets } from "./secretRedaction.js";

const ORIGINAL_ENV = {
  ASSINI_LLM_API_KEY: process.env.ASSINI_LLM_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
};

afterEach(() => {
  process.env.ASSINI_LLM_API_KEY = ORIGINAL_ENV.ASSINI_LLM_API_KEY;
  process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
});

describe("secret redaction", () => {
  it("redacts configured long secret values", () => {
    process.env.ASSINI_LLM_API_KEY = "configured-secret";

    expect(redactConfiguredSecrets("failed with configured-secret"))
      .toBe("failed with [redacted-secret]");
  });

  it("does not redact very short configured values", () => {
    process.env.OPENAI_API_KEY = "short";

    expect(redactConfiguredSecrets("failed with short")).toBe("failed with short");
  });

  it("redacts common API key and bearer token shapes", () => {
    const redacted = redactErrorSecrets(
      "sk-live-value ASSINI_LLM_API_KEY=abc123 Bearer clear-token"
    );

    expect(redacted).toBe("[redacted-secret] [redacted-secret] [redacted-secret]");
  });
});
