import { describe, expect, it } from "vitest";
import {
  sourceProcessingErrorI18n,
  sourceProcessingWarningI18n,
  vaultImportSkipReasonI18n
} from "./sourceProcessingErrors.js";

describe("sourceProcessingErrorI18n", () => {
  it("classifies OCR-not-configured guidance", () => {
    expect(sourceProcessingErrorI18n(
      "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs."
    )).toEqual({ i18nKey: "ingest.ocrNotConfigured" });
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
      "The PDF has no embedded page image to OCR. Export pages as images and upload them, or OCR the document externally."
    )).toEqual({ i18nKey: "ingest.ocrPdfNoImage" });
  });

  it("classifies configured OCR model failures", () => {
    expect(sourceProcessingErrorI18n(
      "Configured OCR model could not read the scanned PDF: OCR model request failed with status 503."
    )).toEqual({ i18nKey: "ingest.ocrModelFailed" });
    expect(sourceProcessingErrorI18n(
      "Configured OCR model could not read the image: OCR model request failed: [redacted-secret]"
    )).toEqual({ i18nKey: "ingest.ocrModelFailed" });
  });

  it("classifies OCR model endpoint empty or invalid responses", () => {
    expect(sourceProcessingErrorI18n("OCR model endpoint returned no text."))
      .toEqual({ i18nKey: "ingest.ocrModelFailed" });
    expect(sourceProcessingErrorI18n("OCR model endpoint returned invalid JSON."))
      .toEqual({ i18nKey: "ingest.ocrModelFailed" });
    expect(sourceProcessingErrorI18n("OCR model endpoint returned no choices."))
      .toEqual({ i18nKey: "ingest.ocrModelFailed" });
    expect(sourceProcessingErrorI18n("OCR model request failed with status 502."))
      .toEqual({ i18nKey: "ingest.ocrModelFailed" });
    expect(sourceProcessingErrorI18n("OCR model request failed: fetch failed"))
      .toEqual({ i18nKey: "ingest.ocrModelFailed" });
  });

  it("classifies local tesseract OCR wrapper failures", () => {
    expect(sourceProcessingErrorI18n(
      "Local OCR could not read the image: OCR found no readable text in the image. Configure a vision-capable model via ASSINI_LLM_PROVIDER (for example llava via Ollama), or provide a clearer image."
    )).toEqual({ i18nKey: "ingest.ocrNoReadableText" });
  });

  it("classifies non-vision main-LLM image failures", () => {
    expect(sourceProcessingErrorI18n(
      "The configured model returned no usable result for this image. It may not be vision-capable. Configure a vision model (for example llava via Ollama) in ASSINI_LLM_MODEL, or rely on the local OCR fallback by leaving the model unset."
    )).toEqual({ i18nKey: "ingest.visionModelRequired" });
  });

  it("classifies empty resolved source text", () => {
    expect(sourceProcessingErrorI18n("Source contains no readable text."))
      .toEqual({ i18nKey: "ingest.sourceNoReadableText" });
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

  it("classifies stale-heartbeat recovery interruptions", () => {
    expect(sourceProcessingErrorI18n(
      "Processing stalled without progress. Re-run processing."
    )).toEqual({ i18nKey: "ingest.processingStalledWithoutProgress" });

    expect(sourceProcessingErrorI18n(
      "Queued source processing was cancelled. Re-run processing when ready."
    )).toEqual({ i18nKey: "ingest.sourceProcessingCancelled" });
  });

  it("classifies source URL fetch failures with status", () => {
    expect(sourceProcessingErrorI18n("Fetching source URL failed with status 404."))
      .toEqual({ i18nKey: "ingest.urlFetchFailed", i18nParams: { status: 404 } });
  });

  it("classifies oversized or empty source URL content", () => {
    expect(sourceProcessingErrorI18n("Source URL content is too large to process locally."))
      .toEqual({ i18nKey: "ingest.urlContentTooLarge" });
    expect(sourceProcessingErrorI18n("Source URL returned no readable text content."))
      .toEqual({ i18nKey: "ingest.urlNoReadableText" });
  });

  it("classifies unsupported document extensions", () => {
    expect(sourceProcessingErrorI18n(
      "Document type .xlsx is not supported yet. Upload a PDF, DOCX, plain-text, Markdown, or CSV file, or convert it first."
    )).toEqual({
      i18nKey: "ingest.documentTypeUnsupported",
      i18nParams: { ext: "xlsx" }
    });
  });

  it("classifies OCR-not-configured when the OCR endpoint helper throws", () => {
    expect(sourceProcessingErrorI18n(
      "OCR model endpoint is not configured. Set ASSINI_OCR_BASE_URL to an OpenAI-compatible /chat/completions server (for example a local llava server)."
    )).toEqual({ i18nKey: "ingest.ocrNotConfigured" });
  });

  it("returns undefined for blank processing errors", () => {
    expect(sourceProcessingErrorI18n("")).toBeUndefined();
    expect(sourceProcessingErrorI18n("   ")).toBeUndefined();
  });

  it("classifies missing transcription endpoint guidance", () => {
    expect(sourceProcessingErrorI18n(
      "Audio sources need a transcription endpoint. Set ASSINI_TRANSCRIBE_BASE_URL to an OpenAI-compatible /audio/transcriptions server (for example a local whisper server)."
    )).toEqual({ i18nKey: "ingest.transcribeNotConfigured" });
  });

  it("classifies transcription endpoint failures", () => {
    expect(sourceProcessingErrorI18n("Transcription request failed with status 502."))
      .toEqual({ i18nKey: "ingest.transcribeFailed" });
    expect(sourceProcessingErrorI18n("Transcription request failed: [redacted-secret]"))
      .toEqual({ i18nKey: "ingest.transcribeFailed" });
    expect(sourceProcessingErrorI18n("Transcription endpoint returned no text."))
      .toEqual({ i18nKey: "ingest.transcribeFailed" });
    expect(sourceProcessingErrorI18n("Transcription endpoint returned invalid JSON."))
      .toEqual({ i18nKey: "ingest.transcribeFailed" });
  });

  it("returns undefined for unrelated processing errors", () => {
    expect(sourceProcessingErrorI18n("Remote failure [redacted-secret]")).toBeUndefined();
  });
});

describe("sourceProcessingWarningI18n", () => {
  it("classifies multi-page PDF OCR page-cap warnings", () => {
    expect(sourceProcessingWarningI18n(
      "PDF has 14 pages; only the first 10 pages were OCR'd. Raise ASSINI_OCR_PDF_MAX_PAGES or split remaining pages into separate sources if you need them."
    )).toEqual({
      i18nKey: "ingest.ocrPdfMultiPageWarning",
      i18nParams: { pages: 14, maxPages: 10 }
    });
  });

  it("classifies legacy page-1-only multi-page warnings", () => {
    expect(sourceProcessingWarningI18n(
      "PDF has 4 pages; only page 1 was OCR'd. Split remaining pages into separate sources if you need them."
    )).toEqual({
      i18nKey: "ingest.ocrPdfMultiPageWarning",
      i18nParams: { pages: 4, maxPages: 1 }
    });
  });

  it("classifies scanned PDF OCR success notices", () => {
    expect(sourceProcessingWarningI18n(
      "Used configured OCR model to read scanned document (3 of 3 pages)."
    )).toEqual({
      i18nKey: "ingest.ocrPdfUsed",
      i18nParams: { succeeded: 3, attempted: 3 }
    });
  });

  it("classifies legacy page-1 scanned PDF OCR success notices", () => {
    expect(sourceProcessingWarningI18n("Used configured OCR model to read scanned document (page 1)."))
      .toEqual({
        i18nKey: "ingest.ocrPdfUsed",
        i18nParams: { succeeded: 1, attempted: 1 }
      });
  });

  it("classifies per-page OCR soft-fail warnings", () => {
    expect(sourceProcessingWarningI18n(
      "OCR failed for page 2; continuing with remaining pages."
    )).toEqual({
      i18nKey: "ingest.ocrPdfPageFailed",
      i18nParams: { page: 2 }
    });
    expect(sourceProcessingWarningI18n(
      "OCR skipped page 1 (no embedded page image)."
    )).toEqual({
      i18nKey: "ingest.ocrPdfPageSkipped",
      i18nParams: { page: 1 }
    });
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

  it("classifies model-extraction throw fallbacks with part counts", () => {
    expect(sourceProcessingWarningI18n(
      "Model extraction failed for part 1 of 1: LLM provider returned only reasoning_content using [redacted-secret]; fell back to offline heuristics when no usable model output remained."
    )).toEqual({
      i18nKey: "ingest.warningModelExtractionFailed",
      i18nParams: { part: 1, total: 1 }
    });
  });

  it("classifies Obsidian vault import file-limit notices", () => {
    expect(sourceProcessingWarningI18n("Import stopped at the configured 100 file limit."))
      .toEqual({
        i18nKey: "ingest.warningVaultFileLimit",
        i18nParams: { maxFiles: 100 }
      });
  });

  it("returns undefined for unrelated warnings", () => {
    expect(sourceProcessingWarningI18n("Custom operator note from a plugin")).toBeUndefined();
  });
});

describe("vaultImportSkipReasonI18n", () => {
  it("classifies oversized and empty vault Markdown skip reasons", () => {
    expect(vaultImportSkipReasonI18n("Markdown file is larger than the 1 MB import limit."))
      .toEqual({ i18nKey: "ingest.vaultMarkdownTooLarge" });
    expect(vaultImportSkipReasonI18n("Markdown file had no importable text."))
      .toEqual({ i18nKey: "ingest.vaultMarkdownEmpty" });
    expect(vaultImportSkipReasonI18n("Directory could not be read.")).toBeUndefined();
  });
});
