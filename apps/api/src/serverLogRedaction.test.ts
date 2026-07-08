import { describe, expect, it } from "vitest";
import { FASTIFY_LOGGER_REDACT_PATHS } from "./serverLogRedaction.js";

describe("Fastify logger redaction", () => {
  it("redacts LLM, transcription, and OCR API keys from request bodies", () => {
    expect(FASTIFY_LOGGER_REDACT_PATHS).toEqual(expect.arrayContaining([
      "body.apiKey",
      "body.transcriptionApiKey",
      "body.ocrApiKey"
    ]));
  });
});
