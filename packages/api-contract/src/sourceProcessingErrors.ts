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

  if (/Configured OCR model could not read/i.test(normalized) || /OCR model request failed/i.test(normalized)) {
    return { i18nKey: "ingest.ocrModelFailed" };
  }

  if (/OCR is not supported yet/i.test(normalized) && /no extractable text/i.test(normalized)) {
    return { i18nKey: "ingest.ocrDocxUnsupported" };
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

  return undefined;
}
