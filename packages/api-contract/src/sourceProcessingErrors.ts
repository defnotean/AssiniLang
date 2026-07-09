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

  return undefined;
}
