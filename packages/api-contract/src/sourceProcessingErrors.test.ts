import { describe, expect, it } from "vitest";
import { sourceProcessingErrorI18n } from "./sourceProcessingErrors.js";

describe("sourceProcessingErrorI18n", () => {
  it("classifies OCR-not-configured guidance", () => {
    expect(sourceProcessingErrorI18n(
      "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs (page 1 only)."
    )).toEqual({ i18nKey: "ingest.ocrNotConfigured" });
  });

  it("classifies unreadable OCR output", () => {
    expect(sourceProcessingErrorI18n("OCR found no readable text in the image."))
      .toEqual({ i18nKey: "ingest.ocrNoReadableText" });
  });

  it("classifies scanned PDFs without an embeddable page image", () => {
    expect(sourceProcessingErrorI18n(
      "The PDF has no embedded page image to OCR. Export page 1 as an image and upload it, or OCR the document externally."
    )).toEqual({ i18nKey: "ingest.ocrPdfNoImage" });
  });

  it("classifies configured OCR model failures", () => {
    expect(sourceProcessingErrorI18n(
      "Configured OCR model could not read the scanned PDF: OCR model request failed with status 503."
    )).toEqual({ i18nKey: "ingest.ocrModelFailed" });
  });

  it("returns undefined for unrelated processing errors", () => {
    expect(sourceProcessingErrorI18n("Remote failure [redacted-secret]")).toBeUndefined();
  });
});
