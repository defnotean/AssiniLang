import { describe, expect, it, vi } from "vitest";

vi.mock("@assini/db", () => {
  throw new Error("browser source-processing formatting must not load @assini/db");
});

describe("browser source-processing formatting boundary", () => {
  it("loads formatter helpers without importing the database package", async () => {
    const { localizeSourceProcessingError } = await import("./format");

    const translated = localizeSourceProcessingError(
      "OCR found no readable text in the image.",
      (key) => key,
      "ingest.unknownFailure"
    );

    expect(translated).toBe("ingest.ocrNoReadableText");
  });
});
