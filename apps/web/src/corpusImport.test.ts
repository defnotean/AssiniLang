import { describe, expect, it } from "vitest";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  EMPTY_CORPUS_IMPORT_DRAFT,
  parseCorpusMorphemeDraft
} from "./corpusImport";

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
      source: "  synthetic-import  ",
      author: "  Local Reviewer  ",
      year: "2026",
      license: "  synthetic-only  ",
      consentRecord: "  local synthetic import consent  ",
      tags: "motion, place\nimported",
      morphemes: [
        "mira | mira | river | noun",
        "lumo-ke | lumo | practice-mat.locative | noun, case-loc",
        "talo-mi-na | talo | walk.present.1sg | verb, present, 1sg"
      ].join("\n"),
      restrictions: "local prototype import, synthetic-only"
    };

    expect(canSubmitCorpusImportDraft(draft)).toBe(true);
    expect(buildCorpusImportPayload(draft)).toEqual({
      ok: true,
      payload: {
        source: "synthetic-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "synthetic-only",
          consentRecord: "local synthetic import consent"
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
          use: "synthetic-testing-only",
          restrictions: ["local prototype import", "synthetic-only"]
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
      ...EMPTY_CORPUS_IMPORT_DRAFT,
      target: "mira talo-mi-na",
      translation: "I walk by the river.",
      source: "synthetic-import",
      author: "Local Reviewer",
      year: "2026",
      license: "synthetic-only",
      consentRecord: "local synthetic import consent",
      tags: "motion",
      morphemes: "mira | mira | river | noun",
      ...overrides
    });

    expect(result).toEqual({
      ok: false,
      error: "Please complete target text, translation, provenance, tags, and morphemes."
    });
  });
});
