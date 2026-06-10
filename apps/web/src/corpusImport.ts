import type { CorpusImportPayload } from "./api";

export type CorpusConsentUse = CorpusImportPayload["consentStatus"]["use"];

/** Mirrors CONSENT_USE_VALUES from @assini/db (type-checked against the schema union). */
export const CORPUS_CONSENT_USE_VALUES: readonly CorpusConsentUse[] = [
  "testing-only",
  "community-approved",
  "personal-study",
  "research",
  "public-domain",
  "licensed",
  "pending-review"
];

export const DEFAULT_CORPUS_CONSENT_USE: CorpusConsentUse = "community-approved";

export type CorpusImportDraft = {
  target: string;
  translation: string;
  source: string;
  author: string;
  year: string;
  license: string;
  consentRecord: string;
  consentUse: string;
  tags: string;
  morphemes: string;
  restrictions: string;
};

type CorpusImportBuildResult =
  | { ok: true; payload: CorpusImportPayload }
  | { ok: false; error: string };

const INCOMPLETE_IMPORT_ERROR = "Please complete target text, translation, provenance, tags, and morphemes.";
const INVALID_CONSENT_USE_ERROR = `Consent use must be one of: ${CORPUS_CONSENT_USE_VALUES.join(", ")}.`;

export const EMPTY_CORPUS_IMPORT_DRAFT: CorpusImportDraft = {
  target: "",
  translation: "",
  source: "",
  author: "",
  year: "",
  license: "",
  consentRecord: "",
  consentUse: DEFAULT_CORPUS_CONSENT_USE,
  tags: "",
  morphemes: "",
  restrictions: ""
};

function isCorpusConsentUse(value: string): value is CorpusConsentUse {
  return (CORPUS_CONSENT_USE_VALUES as readonly string[]).includes(value);
}

function parseDraftList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCorpusMorphemeDraft(value: string): CorpusImportPayload["morphologicalSegmentation"] {
  return value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [surface = "", lemma = "", gloss = "", features = ""] = row
        .split("|")
        .map((part) => part.trim());
      return {
        surface,
        lemma,
        gloss,
        features: parseDraftList(features)
      };
    });
}

function hasCompleteCorpusMorphemes(morphemes: CorpusImportPayload["morphologicalSegmentation"]): boolean {
  return morphemes.length > 0 && morphemes.every((morpheme) => (
    morpheme.surface.length > 0
    && morpheme.lemma.length > 0
    && morpheme.gloss.length > 0
  ));
}

export function buildCorpusImportPayload(draft: CorpusImportDraft): CorpusImportBuildResult {
  const parsedYear = Number(draft.year.trim());
  const topicTags = parseDraftList(draft.tags);
  const morphologicalSegmentation = parseCorpusMorphemeDraft(draft.morphemes);
  const consentUse = draft.consentUse.trim();

  if (
    draft.target.trim().length === 0
    || draft.translation.trim().length === 0
    || draft.source.trim().length === 0
    || draft.author.trim().length === 0
    || draft.year.trim().length === 0
    || !Number.isInteger(parsedYear)
    || draft.license.trim().length === 0
    || draft.consentRecord.trim().length === 0
    || topicTags.length === 0
    || !hasCompleteCorpusMorphemes(morphologicalSegmentation)
  ) {
    return { ok: false, error: INCOMPLETE_IMPORT_ERROR };
  }

  if (!isCorpusConsentUse(consentUse)) {
    return { ok: false, error: INVALID_CONSENT_USE_ERROR };
  }

  return {
    ok: true,
    payload: {
      source: draft.source.trim(),
      sourceMetadata: {
        author: draft.author.trim(),
        year: parsedYear,
        license: draft.license.trim(),
        consentRecord: draft.consentRecord.trim()
      },
      textTarget: draft.target.trim(),
      textTranslation: draft.translation.trim(),
      morphologicalSegmentation,
      topicTags,
      consentStatus: {
        use: consentUse,
        restrictions: parseDraftList(draft.restrictions)
      }
    }
  };
}

export function canSubmitCorpusImportDraft(draft: CorpusImportDraft): boolean {
  return buildCorpusImportPayload(draft).ok;
}
