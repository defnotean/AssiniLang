import { describe, expect, it } from "vitest";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  CORPUS_CONSENT_USE_VALUES,
  EMPTY_CORPUS_IMPORT_DRAFT,
  formatCorpusImportError,
  parseCorpusMorphemeDraft
} from "./corpusImport";
import { createTranslator } from "./i18n";

const completeDraft = {
  ...EMPTY_CORPUS_IMPORT_DRAFT,
  target: "mira talo-mi-na",
  translation: "I walk by the river.",
  source: "field-import",
  author: "Local Reviewer",
  year: "2026",
  license: "cc-by",
  consentRecord: "local import consent",
  tags: "motion",
  morphemes: "mira | mira | river | noun"
};

describe("corpus import helpers", () => {
  it("parses pipe-delimited morpheme rows with comma-delimited feature lists", () => {
    expect(parseCorpusMorphemeDraft([
      "mira | mira | river | noun",
      "lumo-ke | lumo | practice-mat.locative | noun, case-loc",
      "talo-mi-na | talo | walk.present.1sg | verb, present, 1sg"
    ].join("\n"))).toEqual([
      { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
      { surface: "lumo-ke", lemma: "lumo", gloss: "practice-mat.locative", features: ["noun", "case-loc"] },
      { surface: "talo-mi-na", lemma: "talo", gloss: "walk.present.1sg", features: ["verb", "present", "1sg"] }
    ]);
  });

  it("builds a trimmed corpus import payload from form drafts", () => {
    const draft = {
      ...EMPTY_CORPUS_IMPORT_DRAFT,
      target: "  mira lumo-ke talo-mi-na  ",
      translation: "  I walk by the river at the practice mat.  ",
      source: "  field-import  ",
      author: "  Local Reviewer  ",
      year: "2026",
      license: "  cc-by  ",
      consentRecord: "  local import consent  ",
      consentUse: " testing-only ",
      tags: "motion, place\nimported",
      morphemes: [
        "mira | mira | river | noun",
        "lumo-ke | lumo | practice-mat.locative | noun, case-loc",
        "talo-mi-na | talo | walk.present.1sg | verb, present, 1sg"
      ].join("\n"),
      restrictions: "local prototype import, internal-only"
    };

    expect(canSubmitCorpusImportDraft(draft)).toBe(true);
    expect(buildCorpusImportPayload(draft)).toEqual({
      ok: true,
      payload: {
        source: "field-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "cc-by",
          consentRecord: "local import consent"
        },
        textTarget: "mira lumo-ke talo-mi-na",
        textTranslation: "I walk by the river at the practice mat.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "lumo-ke", lemma: "lumo", gloss: "practice-mat.locative", features: ["noun", "case-loc"] },
          { surface: "talo-mi-na", lemma: "talo", gloss: "walk.present.1sg", features: ["verb", "present", "1sg"] }
        ],
        topicTags: ["motion", "place", "imported"],
        consentStatus: {
          use: "testing-only",
          restrictions: ["local prototype import", "internal-only"]
        }
      }
    });
  });

  it.each([
    ["missing topic tags", { tags: "" }],
    ["invalid year", { year: "20.5" }],
    ["incomplete morpheme", { morphemes: "mira | mira |" }]
  ])("rejects %s before payload creation", (_, overrides) => {
    const result = buildCorpusImportPayload({
      ...completeDraft,
      ...overrides
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "incomplete"
    });
  });

  it("rejects invalid consent-use values with a stable error code", () => {
    const result = buildCorpusImportPayload({
      ...completeDraft,
      consentUse: "not-a-real-consent-use"
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "invalidConsentUse"
    });
  });

  it("formats incomplete and consent-use errors through i18n catalogs", () => {
    const en = createTranslator("en");
    const ar = createTranslator("ar");

    expect(formatCorpusImportError("incomplete", en)).toBe(
      "Please complete target text, translation, provenance, tags, and morphemes."
    );
    expect(formatCorpusImportError("incomplete", ar)).toBe(
      "أكمل نص الهدف والترجمة والمصدر والوسوم والمورفيمات."
    );
    expect(formatCorpusImportError("incomplete", ar)).not.toMatch(/Please complete/);

    const allowed = CORPUS_CONSENT_USE_VALUES.join(", ");
    expect(formatCorpusImportError("invalidConsentUse", en)).toBe(
      `Consent use must be one of: ${allowed}.`
    );
    expect(formatCorpusImportError("invalidConsentUse", ar)).toBe(
      `يجب أن يكون استخدام الموافقة أحد القيم التالية: ${allowed}.`
    );
  });
});
