import type { CorpusImportPayload } from "./api";

export type CorpusImportDraft = {
  target: string;
  translation: string;
  source: string;
  author: string;
  year: string;
  license: string;
  consentRecord: string;
  tags: string;
  morphemes: string;
  restrictions: string;
};

type CorpusImportBuildResult =
  | { ok: true; payload: CorpusImportPayload }
  | { ok: false; error: string };

const INCOMPLETE_IMPORT_ERROR = "Please complete target text, translation, provenance, tags, and morphemes.";

export const EMPTY_CORPUS_IMPORT_DRAFT: CorpusImportDraft = {
  target: "",
  translation: "",
  source: "",
  author: "",
  year: "",
  license: "",
  consentRecord: "",
  tags: "",
  morphemes: "",
  restrictions: ""
};

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
        use: "synthetic-testing-only",
        restrictions: parseDraftList(draft.restrictions)
      }
    }
  };
}

export function canSubmitCorpusImportDraft(draft: CorpusImportDraft): boolean {
  return buildCorpusImportPayload(draft).ok;
}
