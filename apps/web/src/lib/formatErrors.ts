import {
  sourceProcessingErrorI18n,
  sourceProcessingWarningI18n,
  vaultImportSkipReasonI18n
} from "@assini/api-contract/sourceProcessingErrors";
import type { ExtractionDraft } from "../api";
import type { MessageKey, Translate } from "../i18n";
import { ApiError } from "./apiClient";

export function localizeExtractionDraftFailure(error: string | undefined, t: Translate): string {
  if (!error?.trim()) return t("ingest.unknownFailure");
  const mapped = operatorApiErrorI18n(error);
  if (mapped) return t(mapped.i18nKey, mapped.i18nParams);
  return error;
}

export function extractionDraftSummary(draft: ExtractionDraft, t?: Translate): string {
  const pair = (left: string, right: string) =>
    t ? t("ingest.draftSummaryPair", { left, right }) : `${left} — ${right}`;
  const missing = (key: MessageKey, fallback: string) => (t ? t(key) : fallback);

  if (draft.kind === "lexeme") {
    return pair(
      draft.payload.form ?? missing("ingest.draftSummary.noForm", "(no form)"),
      draft.payload.gloss ?? missing("ingest.draftSummary.noGloss", "(no gloss)")
    );
  }
  if (draft.kind === "corpus_passage") {
    return pair(
      draft.payload.textTarget ?? missing("ingest.draftSummary.noTargetText", "(no target text)"),
      draft.payload.textTranslation ?? missing("ingest.draftSummary.noTranslation", "(no translation)")
    );
  }
  return pair(
    draft.payload.topic ?? missing("ingest.draftSummary.noTopic", "(no topic)"),
    draft.payload.explanation ?? missing("ingest.draftSummary.noExplanation", "(no explanation)")
  );
}

function retryAfterSecondsFromMessage(message: string): number | undefined {
  const match = message.match(/Retry after (\d+) second/);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function vaultImportErrorI18n(error: string): { i18nKey: MessageKey } | undefined {
  const normalized = error.trim();
  if (!normalized) return undefined;

  if (/ASSINI_OBSIDIAN_VAULT_ROOTS is set/i.test(normalized) && /disabled until/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultRootsUnset" };
  }
  if (/must be absolute directory paths/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultRootsMustBeAbsolute" };
  }
  if (/outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultOutsideAllowlist" };
  }
  if (/vault path is not a directory/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultNotDirectory" };
  }
  if (/vault path could not be read/i.test(normalized)) {
    return { i18nKey: "ingest.errorVaultUnreadable" };
  }

  return undefined;
}

/** Maps known elder/export/auth/study-loop API English errors when response metadata is absent. */
function operatorApiErrorI18n(
  error: string
): { i18nKey: MessageKey; i18nParams?: Record<string, string | number> } | undefined {
  const normalized = error.trim();
  if (!normalized) return undefined;

  if (/Prototype auth is disabled/i.test(normalized)) {
    return { i18nKey: "errors.prototypeAuthDisabled" };
  }
  if (/Invalid prototype session body/i.test(normalized)) {
    return { i18nKey: "errors.invalidPrototypeSessionBody" };
  }
  if (/Invalid AI session body/i.test(normalized)) {
    return { i18nKey: "errors.invalidAiSessionBody" };
  }
  if (/Invalid AI message body/i.test(normalized)) {
    return { i18nKey: "errors.invalidAiMessageBody" };
  }
  if (/^AI session not found:/i.test(normalized)) {
    return { i18nKey: "errors.aiSessionNotFound" };
  }
  if (/^Context note not found for language:/i.test(normalized)) {
    return { i18nKey: "errors.aiSessionContextNoteNotFound" };
  }
  if (/^Context passage not found for language:/i.test(normalized)) {
    return { i18nKey: "errors.aiSessionContextPassageNotFound" };
  }
  if (/^LLM generation failed/i.test(normalized)) {
    return { i18nKey: "errors.llmGenerationFailed" };
  }
  if (/Invalid review body/i.test(normalized)) {
    return { i18nKey: "errors.invalidReviewBody" };
  }
  if (/Review dispositions require reviewerComment/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionRequiresComment" };
  }
  if (/Note explanation edits require a substantive explanation/i.test(normalized)) {
    return { i18nKey: "errors.noteExplanationTooShort" };
  }
  if (/Note example passage is not in language:/i.test(normalized)) {
    return { i18nKey: "errors.noteExamplePassageInvalid" };
  }
  if (/Note example text must match corpus passage:/i.test(normalized)) {
    return { i18nKey: "errors.noteExampleTextMismatch" };
  }
  if (/^Note not found:/i.test(normalized)) {
    return { i18nKey: "errors.noteNotFound" };
  }
  if (/Reviewer is not assigned to approve notes for language:/i.test(normalized)) {
    return { i18nKey: "errors.reviewerNotAssigned" };
  }
  if (/Review disposition assignee is not assignable:/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionAssigneeInvalid" };
  }
  if (/Review disposition due date must be parseable/i.test(normalized)) {
    return { i18nKey: "errors.reviewDispositionDueAtInvalid" };
  }
  if (/A configured model is required to generate drafts/i.test(normalized)) {
    return { i18nKey: "errors.modelRequired" };
  }
  if (/Invalid language body/i.test(normalized)) {
    return { i18nKey: "errors.invalidLanguageBody" };
  }
  if (/Invalid language patch body/i.test(normalized)) {
    return { i18nKey: "errors.invalidLanguagePatchBody" };
  }
  if (/Language could not be created/i.test(normalized)) {
    return { i18nKey: "errors.languageCreateFailed" };
  }
  if (/Language could not be updated/i.test(normalized)) {
    return { i18nKey: "errors.languageUpdateFailed" };
  }
  if (/Invalid exercise authoring body/i.test(normalized)) {
    return { i18nKey: "errors.invalidExerciseAuthoringBody" };
  }
  if (
    /Exercise references unknown (?:rule|vocabulary form):/i.test(normalized) ||
    /Exercise (?:allowed rule|allowed vocabulary|expected answer|adversarial answer|prompt|grading explanation)/i.test(
      normalized
    ) ||
    /Exercise authoring (?:language not found|requires at least two adversarial probes)/i.test(normalized) ||
    /Exercise adversarial answer duplicates an expected answer:/i.test(normalized) ||
    /Translate-to-target expected answer is not present in corpus:/i.test(normalized) ||
    /Choose-particle expected answer is not allowed vocabulary:/i.test(normalized)
  ) {
    return { i18nKey: "errors.exerciseAuthoringValidationFailed" };
  }
  if (/Invalid exercise submission body/i.test(normalized)) {
    return { i18nKey: "errors.invalidExerciseSubmissionBody" };
  }
  if (
    /Exercise generation failed/i.test(normalized) ||
    /did not return valid JSON for exercise generation/i.test(normalized) ||
    /did not match the expected exercise shape/i.test(normalized) ||
    /only reasoning_content for exercise generation/i.test(normalized) ||
    /no draft exercise was created/i.test(normalized)
  ) {
    return { i18nKey: "errors.exerciseGenerationFailed" };
  }
  if (/Invalid corpus import body/i.test(normalized)) {
    return { i18nKey: "errors.invalidCorpusImportBody" };
  }
  if (/Corpus passage could not be imported/i.test(normalized)) {
    return { i18nKey: "errors.corpusImportFailed" };
  }
  if (
    /Corpus (passage already exists|segmentation|topic tag|morpheme|target text|import language not found)/i.test(
      normalized
    )
  ) {
    return { i18nKey: "errors.corpusImportValidationFailed" };
  }
  if (/Invalid source body/i.test(normalized)) {
    return { i18nKey: "errors.invalidSourceBody" };
  }
  if (/Source could not be registered/i.test(normalized)) {
    return { i18nKey: "errors.sourceRegisterFailed" };
  }
  if (/Invalid Obsidian vault import body/i.test(normalized)) {
    return { i18nKey: "errors.invalidObsidianVaultImportBody" };
  }
  if (/Upload requires a multipart file field/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadRequiresFile" };
  }
  if (/Uploaded file is empty/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadEmpty" };
  }
  if (/Upload title field is too large/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadTitleTooLarge" };
  }
  if (/Upload title field is invalid/i.test(normalized)) {
    return { i18nKey: "errors.sourceUploadTitleInvalid" };
  }
  if (/Source could not be stored/i.test(normalized)) {
    return { i18nKey: "errors.sourceStoreFailed" };
  }
  if (/^Source not found:/i.test(normalized)) {
    return { i18nKey: "errors.sourceNotFound" };
  }
  if (/Source could not be processed/i.test(normalized)) {
    return { i18nKey: "errors.sourceProcessFailed" };
  }
  if (/Extraction draft not found:/i.test(normalized)) {
    return { i18nKey: "errors.extractionDraftNotFound" };
  }
  if (/Extraction draft could not be accepted/i.test(normalized)) {
    return { i18nKey: "errors.extractionDraftAcceptFailed" };
  }
  if (/Extraction draft could not be rejected/i.test(normalized)) {
    return { i18nKey: "errors.extractionDraftRejectFailed" };
  }
  {
    const alreadyMatch = normalized.match(/^Extraction draft is already (\w+)\.?$/i);
    if (alreadyMatch?.[1]) {
      const status = alreadyMatch[1].toLowerCase();
      if (status === "accepted") {
        return { i18nKey: "errors.extractionDraftAlreadyAccepted" };
      }
      if (status === "rejected") {
        return { i18nKey: "errors.extractionDraftAlreadyRejected" };
      }
      if (status === "proposed") {
        return { i18nKey: "errors.extractionDraftAlreadyProposed" };
      }
      return {
        i18nKey: "errors.extractionDraftAlreadyStatus",
        i18nParams: { status }
      };
    }
  }
  if (/Exercise not found:/i.test(normalized)) {
    return { i18nKey: "errors.exerciseNotFound" };
  }
  if (/Exercise could not be created/i.test(normalized)) {
    return { i18nKey: "errors.exerciseCreateFailed" };
  }
  if (/Exercise submission could not be created/i.test(normalized)) {
    return { i18nKey: "errors.exerciseSubmissionCreateFailed" };
  }
  if (/Body must include action: "accept" or "reject"/i.test(normalized)) {
    return { i18nKey: "errors.bulkReviewInvalidAction" };
  }
  if (/Body must include draftIds:/i.test(normalized)) {
    return { i18nKey: "errors.bulkReviewInvalidDraftIds" };
  }
  if (/Too many draftIds:/i.test(normalized)) {
    const maxMatch = normalized.match(/at most (\d+)/i);
    return {
      i18nKey: "errors.bulkReviewTooManyDraftIds",
      ...(maxMatch?.[1] ? { i18nParams: { max: Number(maxMatch[1]) } } : {})
    };
  }
  if (/Missing languageId/i.test(normalized)) {
    return { i18nKey: "errors.missingLanguageId" };
  }
  if (/^Language not found:/i.test(normalized)) {
    return { i18nKey: "errors.languageNotFound" };
  }
  if (/^Elder correction not found:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionNotFound" };
  }
  if (/Elder correction is no longer pending review:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionNotPending" };
  }
  if (/Elder correction must be accepted before apply:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionMustBeAccepted" };
  }
  if (/Elder correction is not linked to a note:/i.test(normalized)) {
    return { i18nKey: "elderWs.errCorrectionNotLinkedToNote" };
  }
  if (/^Note not found for correction:/i.test(normalized)) {
    return { i18nKey: "elderWs.errNoteNotFoundForCorrection" };
  }
  if (/^Note not found for language:/i.test(normalized)) {
    return { i18nKey: "elderWs.errNoteNotFoundForLanguage" };
  }
  if (/^Passage not found for language:/i.test(normalized)) {
    return { i18nKey: "elderWs.errPassageNotFoundForLanguage" };
  }
  if (/Invalid elder correction apply body/i.test(normalized)) {
    return { i18nKey: "elderWs.errInvalidApplyBody" };
  }
  if (/Invalid elder correction review body/i.test(normalized)) {
    return { i18nKey: "elderWs.errInvalidReviewBody" };
  }
  if (/Invalid elder correction body/i.test(normalized)) {
    return { i18nKey: "elderWs.errInvalidCorrectionBody" };
  }
  if (/Payload too large/i.test(normalized)) {
    return { i18nKey: "errors.payloadTooLarge" };
  }
  if (/^Review disposition not found:/i.test(normalized)) {
    return { i18nKey: "governance.errDispositionNotFound" };
  }
  if (/Review disposition is already resolved/i.test(normalized)) {
    return { i18nKey: "governance.errDispositionAlreadyResolved" };
  }

  return undefined;
}

/** Localizes Obsidian vault import failures for operator-facing UI. */
export function localizeVaultImportError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (error instanceof ApiError) {
    if (error.i18nKey) {
      return t(error.i18nKey as MessageKey, error.i18nParams);
    }
    const vaultI18n = vaultImportErrorI18n(error.message);
    if (vaultI18n) return t(vaultI18n.i18nKey);
    return localizeApiError(error, t, fallback);
  }

  if (error instanceof Error) {
    const vaultI18n = vaultImportErrorI18n(error.message);
    if (vaultI18n) return t(vaultI18n.i18nKey);
    return error.message;
  }

  return t(fallback);
}

function rateLimitSecondsFromApiError(error: ApiError): number | undefined {
  const raw = error.i18nParams?.seconds;
  const fromParams = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : undefined;
  if (fromParams !== undefined && Number.isFinite(fromParams) && fromParams > 0) {
    return fromParams;
  }
  return retryAfterSecondsFromMessage(error.message);
}

/** Localizes API and persisted processing errors for operator-facing UI. */
export function localizeApiError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return t("app.sessionExpired");
    }
    // Handle 429/413 before generic i18nKey lookup so a missing `{seconds}`
    // param never renders the raw placeholder from app.rateLimitExceeded.
    if (error.i18nKey === "app.rateLimitExceeded" || error.status === 429) {
      const seconds = rateLimitSecondsFromApiError(error);
      return seconds
        ? t("app.rateLimitExceeded", { ...(error.i18nParams ?? {}), seconds })
        : t("app.rateLimitExceededGeneric");
    }
    if (error.i18nKey === "errors.payloadTooLarge" || error.status === 413) {
      return t("errors.payloadTooLarge");
    }
    if (error.i18nKey) {
      return t(error.i18nKey as MessageKey, error.i18nParams);
    }
    if (error.status === 403) {
      const forbiddenI18n = operatorApiErrorI18n(error.message);
      if (forbiddenI18n) {
        return t(forbiddenI18n.i18nKey, forbiddenI18n.i18nParams);
      }
      return t("app.forbidden");
    }
    if (error.status === 503 && /offline/i.test(error.message)) {
      return t("app.providerOffline");
    }
    const sourceI18n = sourceProcessingErrorI18n(error.message);
    if (sourceI18n) {
      return t(sourceI18n.i18nKey as MessageKey, sourceI18n.i18nParams);
    }
    const operatorI18n = operatorApiErrorI18n(error.message);
    if (operatorI18n) {
      return t(operatorI18n.i18nKey, operatorI18n.i18nParams);
    }
    return error.message;
  }

  if (error instanceof Error) {
    const sourceI18n = sourceProcessingErrorI18n(error.message);
    if (sourceI18n) {
      return t(sourceI18n.i18nKey as MessageKey, sourceI18n.i18nParams);
    }
    const operatorI18n = operatorApiErrorI18n(error.message);
    if (operatorI18n) {
      return t(operatorI18n.i18nKey, operatorI18n.i18nParams);
    }
    return error.message;
  }

  return t(fallback);
}

export function localizeSourceProcessingError(
  error: string | undefined,
  t: Translate,
  fallback: MessageKey,
  fallbackParams?: Record<string, string | number>
): string {
  if (!error?.trim()) return t(fallback, fallbackParams);
  const sourceI18n = sourceProcessingErrorI18n(error);
  if (sourceI18n) {
    return t(sourceI18n.i18nKey as MessageKey, sourceI18n.i18nParams);
  }
  return error;
}

/** Localizes known processing warnings; leaves unrecognized API warnings unchanged. */
export function localizeSourceProcessingWarning(warning: string, t: Translate): string {
  const mapped = sourceProcessingWarningI18n(warning);
  if (mapped) {
    return t(mapped.i18nKey as MessageKey, mapped.i18nParams);
  }
  return warning;
}

/** Localizes Obsidian vault import skip reasons for operator-facing UI. */
export function localizeVaultImportSkipReason(reason: string, t: Translate): string {
  const mapped = vaultImportSkipReasonI18n(reason);
  if (mapped) {
    return t(mapped.i18nKey as MessageKey, mapped.i18nParams);
  }
  return reason;
}

const LLM_PROVIDER_OPTION_KEYS = new Set<MessageKey>([
  "model.providerOption.deterministic",
  "model.providerOption.off",
  "model.providerOption.mock",
  "model.providerOption.openai-compatible",
  "model.providerOption.local",
  "model.providerOption.ollama",
  "model.providerOption.lm-studio",
  "model.providerOption.openai",
  "model.providerOption.remote"
]);

/** Localizes LLM provider option labels shown in Settings and readiness. */
export function formatLlmProvider(provider: string, t?: Translate): string {
  const key = `model.providerOption.${provider}` as MessageKey;
  if (t && LLM_PROVIDER_OPTION_KEYS.has(key)) {
    return t(key);
  }
  return provider;
}

function llmStatusWarningI18n(
  warning: string
): { i18nKey: MessageKey; i18nParams?: Record<string, string | number> } | undefined {
  if (warning === "No LLM provider configured; using deterministic fallback for safe local development.") {
    return { i18nKey: "model.warning.noProviderConfigured" };
  }
  if (warning === "Using deterministic fallback; no external LLM calls will be made.") {
    return { i18nKey: "model.warning.deterministicFallback" };
  }
  const timeoutMatch = /^ASSINI_LLM_TIMEOUT_MS must be a positive integer; using (\d+)\.$/.exec(warning);
  if (timeoutMatch) {
    return { i18nKey: "model.warning.invalidTimeout", i18nParams: { ms: timeoutMatch[1] } };
  }
  const unknownMatch = /^Unknown ASSINI_LLM_PROVIDER: (.+)$/.exec(warning);
  if (unknownMatch) {
    return { i18nKey: "model.warning.unknownProvider", i18nParams: { provider: unknownMatch[1] } };
  }
  return undefined;
}

/** Localizes known LLM status warnings; leaves unrecognized API warnings unchanged. */
export function localizeLlmStatusWarning(warning: string, t: Translate): string {
  const mapped = llmStatusWarningI18n(warning);
  if (mapped) {
    return t(mapped.i18nKey, mapped.i18nParams);
  }
  return warning;
}
