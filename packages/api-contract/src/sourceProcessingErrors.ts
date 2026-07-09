export type SourceProcessingErrorI18n = {
  i18nKey: string;
  i18nParams?: Record<string, string | number>;
};

/**
 * Maps persisted or redacted source-processing error text to a stable i18n key
 * the web client can localize without storing metadata on the asset record.
 */
export function sourceProcessingErrorI18n(error: string): SourceProcessingErrorI18n | undefined {
  const normalized = error.trim();
  if (!normalized) return undefined;

  if (
    /ASSINI_OCR_BASE_URL/i.test(normalized)
    && /not configured|Configure ASSINI_OCR/i.test(normalized)
  ) {
    return { i18nKey: "ingest.ocrNotConfigured" };
  }

  if (/OCR found no readable text/i.test(normalized)) {
    return { i18nKey: "ingest.ocrNoReadableText" };
  }

  if (/no embedded page image to OCR/i.test(normalized)) {
    return { i18nKey: "ingest.ocrPdfNoImage" };
  }

  if (
    /Configured OCR model could not read/i.test(normalized)
    || /OCR model request failed/i.test(normalized)
    || /OCR model endpoint returned (invalid JSON|no choices|no text)/i.test(normalized)
  ) {
    return { i18nKey: "ingest.ocrModelFailed" };
  }

  if (/OCR is not supported yet/i.test(normalized) && /no extractable text/i.test(normalized)) {
    return { i18nKey: "ingest.ocrDocxUnsupported" };
  }

  if (
    /may not be vision-capable/i.test(normalized)
    && /no usable result for this image/i.test(normalized)
  ) {
    return { i18nKey: "ingest.visionModelRequired" };
  }

  if (/Source contains no readable text/i.test(normalized)) {
    return { i18nKey: "ingest.sourceNoReadableText" };
  }

  if (/Source is already processing/i.test(normalized)) {
    return { i18nKey: "ingest.sourceAlreadyProcessing" };
  }

  if (/Processing interrupted by a server restart/i.test(normalized)) {
    return { i18nKey: "ingest.processingInterruptedByRestart" };
  }

  if (
    /ASSINI_TRANSCRIBE_BASE_URL/i.test(normalized)
    && /Audio sources need a transcription endpoint|Set ASSINI_TRANSCRIBE/i.test(normalized)
  ) {
    return { i18nKey: "ingest.transcribeNotConfigured" };
  }

  if (
    /Transcription request failed/i.test(normalized)
    || /Transcription endpoint returned no text/i.test(normalized)
  ) {
    return { i18nKey: "ingest.transcribeFailed" };
  }

  return undefined;
}

/**
 * Maps known processing warning text (e.g. multi-page PDF OCR limits) to i18n keys.
 * Unknown warnings are left as raw operator-facing English from the API.
 */
export function sourceProcessingWarningI18n(warning: string): SourceProcessingErrorI18n | undefined {
  const normalized = warning.trim();
  if (!normalized) return undefined;

  const multiPage = normalized.match(/PDF has (\d+) pages;\s*only page 1 was OCR'?d/i);
  if (multiPage) {
    return {
      i18nKey: "ingest.ocrPdfMultiPageWarning",
      i18nParams: { pages: Number(multiPage[1]) }
    };
  }

  if (/Used configured OCR model to read scanned document \(page 1\)/i.test(normalized)) {
    return { i18nKey: "ingest.ocrPdfPage1Used" };
  }

  if (/Used configured OCR model to read the image/i.test(normalized)) {
    return { i18nKey: "ingest.ocrImageUsed" };
  }

  if (/No model configured \(deterministic mode\);\s*used offline heuristic parsing/i.test(normalized)) {
    return { i18nKey: "ingest.warningDeterministicHeuristic" };
  }

  if (/Model output was not valid extraction JSON;\s*fell back to offline heuristics/i.test(normalized)) {
    return { i18nKey: "ingest.warningOfflineHeuristicFallback" };
  }

  if (/No vision model configured;\s*used local OCR \(tesseract\.js\)/i.test(normalized)) {
    return { i18nKey: "ingest.warningLocalOcrUsed" };
  }

  const chunkSkipped = normalized.match(
    /Model output for part (\d+) of (\d+) was not valid extraction JSON;\s*that part was skipped/i
  );
  if (chunkSkipped) {
    return {
      i18nKey: "ingest.warningChunkParseSkipped",
      i18nParams: { part: Number(chunkSkipped[1]), total: Number(chunkSkipped[2]) }
    };
  }

  const chunkCap = normalized.match(
    /Source text is very long;\s*only the first (\d+) parts were processed and (\d+) characters were skipped/i
  );
  if (chunkCap) {
    return {
      i18nKey: "ingest.warningChunkCapSkipped",
      i18nParams: { parts: Number(chunkCap[1]), skipped: Number(chunkCap[2]) }
    };
  }

  const extractionFailed = normalized.match(
    /Model extraction failed for part (\d+) of (\d+):\s*.*fell back to offline heuristics/i
  );
  if (extractionFailed) {
    return {
      i18nKey: "ingest.warningModelExtractionFailed",
      i18nParams: { part: Number(extractionFailed[1]), total: Number(extractionFailed[2]) }
    };
  }

  return undefined;
}
