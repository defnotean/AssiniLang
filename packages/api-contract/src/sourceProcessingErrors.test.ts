import { describe, expect, it } from "vitest";
import { sourceProcessingErrorI18n, sourceProcessingWarningI18n } from "./sourceProcessingErrors.js";

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

  it("classifies empty DOCX text layers where OCR is unsupported", () => {
    expect(sourceProcessingErrorI18n(
      "The document contains no extractable text — it may be a scanned image; OCR is not supported yet."
    )).toEqual({ i18nKey: "ingest.ocrDocxUnsupported" });
  });

  it("classifies already-processing conflicts", () => {
    expect(sourceProcessingErrorI18n("Source is already processing: src-1"))
      .toEqual({ i18nKey: "ingest.sourceAlreadyProcessing" });
  });

  it("classifies restart-recovery interruptions", () => {
    expect(sourceProcessingErrorI18n(
      "Processing interrupted by a server restart. Re-run processing."
    )).toEqual({ i18nKey: "ingest.processingInterruptedByRestart" });
  });

  it("classifies missing transcription endpoint guidance", () => {
    expect(sourceProcessingErrorI18n(
      "Audio sources need a transcription endpoint. Set ASSINI_TRANSCRIBE_BASE_URL to an OpenAI-compatible /audio/transcriptions server (for example a local whisper server)."
    )).toEqual({ i18nKey: "ingest.transcribeNotConfigured" });
  });

  it("classifies transcription endpoint failures", () => {
    expect(sourceProcessingErrorI18n("Transcription request failed with status 502."))
      .toEqual({ i18nKey: "ingest.transcribeFailed" });
    expect(sourceProcessingErrorI18n("Transcription endpoint returned no text."))
      .toEqual({ i18nKey: "ingest.transcribeFailed" });
  });

  it("returns undefined for unrelated processing errors", () => {
    expect(sourceProcessingErrorI18n("Remote failure [redacted-secret]")).toBeUndefined();
  });
});

describe("sourceProcessingWarningI18n", () => {
  it("classifies multi-page PDF OCR limits", () => {
    expect(sourceProcessingWarningI18n(
      "PDF has 4 pages; only page 1 was OCR'd. Split remaining pages into separate sources if you need them."
    )).toEqual({
      i18nKey: "ingest.ocrPdfMultiPageWarning",
      i18nParams: { pages: 4 }
    });
  });

  it("classifies page-1 scanned PDF OCR success notices", () => {
    expect(sourceProcessingWarningI18n("Used configured OCR model to read scanned document (page 1)."))
      .toEqual({ i18nKey: "ingest.ocrPdfPage1Used" });
  });

  it("classifies image OCR success notices", () => {
    expect(sourceProcessingWarningI18n("Used configured OCR model to read the image."))
      .toEqual({ i18nKey: "ingest.ocrImageUsed" });
  });

  it("classifies deterministic offline-heuristic notices", () => {
    expect(sourceProcessingWarningI18n(
      "No model configured (deterministic mode); used offline heuristic parsing."
    )).toEqual({ i18nKey: "ingest.warningDeterministicHeuristic" });
  });

  it("classifies model JSON fallback notices", () => {
    expect(sourceProcessingWarningI18n(
      "Model output was not valid extraction JSON; fell back to offline heuristics."
    )).toEqual({ i18nKey: "ingest.warningOfflineHeuristicFallback" });
  });

  it("classifies local tesseract fallback notices", () => {
    expect(sourceProcessingWarningI18n(
      "No vision model configured; used local OCR (tesseract.js) to read the image."
    )).toEqual({ i18nKey: "ingest.warningLocalOcrUsed" });
  });

  it("classifies per-chunk parse skips with part counts", () => {
    expect(sourceProcessingWarningI18n(
      "Model output for part 2 of 5 was not valid extraction JSON; that part was skipped."
    )).toEqual({
      i18nKey: "ingest.warningChunkParseSkipped",
      i18nParams: { part: 2, total: 5 }
    });
  });

  it("classifies chunk-cap skip notices with counts", () => {
    expect(sourceProcessingWarningI18n(
      "Source text is very long; only the first 8 parts were processed and 12000 characters were skipped."
    )).toEqual({
      i18nKey: "ingest.warningChunkCapSkipped",
      i18nParams: { parts: 8, skipped: 12000 }
    });
  });

  it("returns undefined for unrelated warnings", () => {
    expect(sourceProcessingWarningI18n("Custom operator note from a plugin")).toBeUndefined();
  });
});
