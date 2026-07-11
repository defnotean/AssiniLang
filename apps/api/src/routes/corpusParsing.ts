import { CONSENT_USE_VALUES, type ConsentUse, type CorpusPassage } from "@assini/db";
import { parseStringArray } from "../routeHelpers.js";

export type CorpusImportBody = Omit<CorpusPassage, "id" | "languageId">;

function parseCorpusSourceMetadata(value: unknown): CorpusPassage["sourceMetadata"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const author = typeof record.author === "string" ? record.author.trim() : "";
  const license = typeof record.license === "string" ? record.license.trim() : "";
  const consentRecord = typeof record.consentRecord === "string" ? record.consentRecord.trim() : "";
  const year = typeof record.year === "number" && Number.isInteger(record.year) ? record.year : undefined;

  if (!author || !license || !consentRecord || year === undefined) return undefined;
  return { author, year, license, consentRecord };
}

function parseCorpusMorphemes(value: unknown): CorpusPassage["morphologicalSegmentation"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const morphemes: CorpusPassage["morphologicalSegmentation"] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const surface = typeof record.surface === "string" ? record.surface.trim() : "";
    const lemma = typeof record.lemma === "string" ? record.lemma.trim() : "";
    const gloss = typeof record.gloss === "string" ? record.gloss.trim() : "";
    const features = parseStringArray(record.features);
    if (!surface || !lemma || !gloss || !features) return undefined;
    morphemes.push({ surface, lemma, gloss, features });
  }

  return morphemes.length > 0 ? morphemes : undefined;
}

export function parseCorpusImportBody(input: unknown): CorpusImportBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const body = input as Record<string, unknown>;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const sourceMetadata = parseCorpusSourceMetadata(body.sourceMetadata);
  const textTarget = typeof body.textTarget === "string" ? body.textTarget.trim().replace(/\s+/g, " ") : "";
  const textTranslation =
    typeof body.textTranslation === "string" ? body.textTranslation.trim().replace(/\s+/g, " ") : "";
  const morphologicalSegmentation = parseCorpusMorphemes(body.morphologicalSegmentation);
  const topicTags = parseStringArray(body.topicTags);
  const consentStatus =
    body.consentStatus && typeof body.consentStatus === "object" && !Array.isArray(body.consentStatus)
      ? (body.consentStatus as Record<string, unknown>)
      : undefined;
  const restrictions = parseStringArray(consentStatus?.restrictions);

  if (!source || !sourceMetadata || !textTarget || !textTranslation || !morphologicalSegmentation) return undefined;
  const consentUse =
    typeof consentStatus?.use === "string" && (CONSENT_USE_VALUES as readonly string[]).includes(consentStatus.use)
      ? (consentStatus.use as ConsentUse)
      : undefined;
  if (!topicTags || topicTags.length === 0 || !restrictions || !consentUse) return undefined;

  return {
    source,
    sourceMetadata,
    textTarget,
    textTranslation,
    morphologicalSegmentation,
    topicTags,
    consentStatus: {
      use: consentUse,
      restrictions
    }
  };
}
