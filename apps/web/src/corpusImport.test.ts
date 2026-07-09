import { describe, expect, it } from "vitest";
import {
  buildCorpusImportPayload,
  canSubmitCorpusImportDraft,
  CORPUS_CONSENT_USE_VALUES,
  dryRunCorpusBulkImport,
  EMPTY_CORPUS_IMPORT_DRAFT,
  formatCorpusBulkDryRunReport,
  formatCorpusImportError,
  parseCorpusMorphemeDraft,
  splitCorpusBulkLine
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

const BULK_HEADER = [
  "target",
  "translation",
  "source",
  "author",
  "year",
  "license",
  "consentRecord",
  "consentUse",
  "tags",
  "morphemes"
].join("\t");

function bulkTsvRow(overrides: Partial<Record<string, string>> = {}): string {
  const values = {
    target: "mira talo-mi-na",
    translation: "I walk by the river.",
    source: "field-import",
    author: "Local Reviewer",
    year: "2026",
    license: "cc-by",
    consentRecord: "local import consent",
    consentUse: "community-approved",
    tags: "motion",
    morphemes: "mira | mira | river | noun; talo-mi-na | talo | walk.present.1sg | verb",
    ...overrides
  };
  return [
    values.target,
    values.translation,
    values.source,
    values.author,
    values.year,
    values.license,
    values.consentRecord,
    values.consentUse,
    values.tags,
    values.morphemes
  ].join("\t");
}

describe("corpus bulk TSV/CSV dry-run", () => {
  it("splits quoted CSV cells without treating commas inside quotes as delimiters", () => {
    expect(splitCorpusBulkLine('a,"b,c",d', "csv")).toEqual(["a", "b,c", "d"]);
    expect(splitCorpusBulkLine("a\tb\tc", "tsv")).toEqual(["a", "b", "c"]);
  });

  it("dry-runs a valid TSV bulk paste without persisting", () => {
    const report = dryRunCorpusBulkImport([BULK_HEADER, bulkTsvRow()].join("\n"));

    expect(report.ok).toBe(true);
    expect(report.format).toBe("tsv");
    expect(report.rowCount).toBe(1);
    expect(report.validCount).toBe(1);
    expect(report.errorCount).toBe(0);
    expect(report.rows[0]).toMatchObject({
      rowNumber: 2,
      ok: true,
      targetPreview: "mira talo-mi-na",
      payload: {
        textTarget: "mira talo-mi-na",
        topicTags: ["motion"],
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo-mi-na", lemma: "talo", gloss: "walk.present.1sg", features: ["verb"] }
        ]
      }
    });
  });

  it("dry-runs a valid CSV bulk paste with quoted fields", () => {
    const header = [
      "target",
      "translation",
      "source",
      "author",
      "year",
      "license",
      "consentRecord",
      "consentUse",
      "tags",
      "morphemes"
    ].join(",");
    const row = [
      "saku nemi-na",
      "\"The child teaches me.\"",
      "local-import",
      "Local Reviewer",
      "2026",
      "local-test-data",
      "local import consent",
      "testing-only",
      "learning",
      "\"saku | saku | child | noun; nemi-na | nemi | teach.1sg | verb\""
    ].join(",");

    const report = dryRunCorpusBulkImport([header, row].join("\n"));
    expect(report.ok).toBe(true);
    expect(report.format).toBe("csv");
    expect(report.rows[0]).toMatchObject({
      ok: true,
      payload: {
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        consentStatus: { use: "testing-only", restrictions: [] }
      }
    });
  });

  it("reports incomplete and duplicate-target row failures in the dry-run", () => {
    const report = dryRunCorpusBulkImport([
      BULK_HEADER,
      bulkTsvRow(),
      bulkTsvRow({ tags: "" }),
      bulkTsvRow({ target: "mira talo-mi-na", translation: "Duplicate walk." })
    ].join("\n"));

    expect(report.ok).toBe(false);
    expect(report.validCount).toBe(1);
    expect(report.errorCount).toBe(2);
    expect(report.rows[1]).toEqual({
      rowNumber: 3,
      ok: false,
      errorCode: "incomplete",
      targetPreview: "mira talo-mi-na"
    });
    expect(report.rows[2]).toEqual({
      rowNumber: 4,
      ok: false,
      errorCode: "duplicateTarget",
      targetPreview: "mira talo-mi-na"
    });
  });

  it("rejects empty paste, unknown delimiter, and missing headers", () => {
    expect(dryRunCorpusBulkImport("")).toMatchObject({
      ok: false,
      parseError: "empty"
    });
    expect(dryRunCorpusBulkImport("target translation source")).toMatchObject({
      ok: false,
      parseError: "unknownDelimiter"
    });
    expect(dryRunCorpusBulkImport("target\ttranslation\nhello\tworld")).toMatchObject({
      ok: false,
      format: "tsv",
      parseError: "missingHeader"
    });
  });

  it("formats bulk dry-run reports through i18n catalogs", () => {
    const en = createTranslator("en");
    const ar = createTranslator("ar");

    const success = dryRunCorpusBulkImport([BULK_HEADER, bulkTsvRow()].join("\n"));
    expect(formatCorpusBulkDryRunReport(success, en)).toBe(
      "Dry-run only — nothing saved yet. 1 ready, 0 failed of 1 rows."
    );
    expect(formatCorpusBulkDryRunReport(success, ar)).toContain("تجربة جافة فقط");
    expect(formatCorpusBulkDryRunReport(success, ar)).toContain("1 جاهزة");
    expect(formatCorpusBulkDryRunReport(success, ar)).not.toMatch(/ready,/);

    const mixed = dryRunCorpusBulkImport([
      BULK_HEADER,
      bulkTsvRow(),
      bulkTsvRow({ consentUse: "not-a-real-consent-use", target: "other target" })
    ].join("\n"));
    const mixedEn = formatCorpusBulkDryRunReport(mixed, en);
    expect(mixedEn).toContain("1 ready, 1 failed of 2 rows.");
    expect(mixedEn).toContain("Row 3:");
    expect(mixedEn).toContain(CORPUS_CONSENT_USE_VALUES.join(", "));

    expect(formatCorpusBulkDryRunReport(dryRunCorpusBulkImport(""), en)).toContain(
      "Paste a TSV or CSV with a header row before validating."
    );
    expect(formatCorpusBulkDryRunReport(dryRunCorpusBulkImport(""), ar)).toContain("الصق");
  });
});
