import { afterEach, describe, expect, it } from "vitest";
import { censorLogSecret, redactConfiguredSecrets, redactErrorSecrets } from "./secretRedaction.js";

const ORIGINAL_ENV = {
  ASSINI_LLM_API_KEY: process.env.ASSINI_LLM_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ASSINI_TRANSCRIBE_API_KEY: process.env.ASSINI_TRANSCRIBE_API_KEY,
  ASSINI_OCR_API_KEY: process.env.ASSINI_OCR_API_KEY
};

afterEach(() => {
  process.env.ASSINI_LLM_API_KEY = ORIGINAL_ENV.ASSINI_LLM_API_KEY;
  process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
  process.env.ASSINI_TRANSCRIBE_API_KEY = ORIGINAL_ENV.ASSINI_TRANSCRIBE_API_KEY;
  process.env.ASSINI_OCR_API_KEY = ORIGINAL_ENV.ASSINI_OCR_API_KEY;
});

describe("secret redaction", () => {
  it("redacts configured long secret values", () => {
    process.env.ASSINI_LLM_API_KEY = "configured-secret";

    expect(redactConfiguredSecrets("failed with configured-secret")).toBe("failed with [redacted-secret]");
  });

  it("does not redact very short configured values", () => {
    process.env.OPENAI_API_KEY = "short";

    expect(redactConfiguredSecrets("failed with short")).toBe("failed with short");
  });

  it("redacts transcription API keys from configured env", () => {
    process.env.ASSINI_TRANSCRIBE_API_KEY = "transcribe-secret-value";

    expect(redactConfiguredSecrets("failed with transcribe-secret-value")).toBe("failed with [redacted-secret]");
  });

  it("redacts OCR API keys from configured env", () => {
    process.env.ASSINI_OCR_API_KEY = "ocr-secret-value";

    expect(redactConfiguredSecrets("failed with ocr-secret-value")).toBe("failed with [redacted-secret]");
  });

  it("redacts common API key and bearer token shapes", () => {
    const redacted = redactErrorSecrets(
      "sk-live-value ASSINI_LLM_API_KEY=abc123 ASSINI_TRANSCRIBE_API_KEY=xyz ASSINI_OCR_API_KEY=ocr Bearer clear-token"
    );

    expect(redacted).toBe("[redacted-secret] [redacted-secret] [redacted-secret] [redacted-secret] [redacted-secret]");
  });

  it("redacts api_key query params and x-api-key header shapes from provider errors", () => {
    const redacted = redactErrorSecrets(
      "fetch failed https://api.example/v1/models?api_key=query-secret-value&limit=1 x-api-key: header-secret-value access_token=oauth-secret"
    );

    expect(redacted).toBe(
      "fetch failed https://api.example/v1/models?[redacted-secret]&limit=1 [redacted-secret] [redacted-secret]"
    );
    expect(redacted).not.toContain("query-secret-value");
    expect(redacted).not.toContain("header-secret-value");
    expect(redacted).not.toContain("oauth-secret");
  });

  it("redacts URL userinfo credentials embedded in error text", () => {
    const redacted = redactErrorSecrets(
      "URL is not valid: https://user:url-pass-secret@api.example/v1?api_key=query-secret"
    );

    expect(redacted).toBe("URL is not valid: https://[redacted-secret]@api.example/v1?[redacted-secret]");
    expect(redacted).not.toContain("url-pass-secret");
    expect(redacted).not.toContain("query-secret");
  });

  it("censors credential log fields while scrubbing err.message in place", () => {
    expect(censorLogSecret("plain-provider-secret", ["body", "apiKey"])).toBe("[REDACTED]");
    expect(censorLogSecret("failed with Bearer sk-live-token", ["err", "message"])).toBe(
      "failed with [redacted-secret]"
    );
  });
});
