import type { CorpusImportPayload } from "./api";
import type { Translate } from "./i18n";

export type CorpusConsentUse = CorpusImportPayload["consentStatus"]["use"];

/** Mirrors CONSENT_USE_VALUES from @assini/api-contract (type-checked against the schema union). */
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

export type CorpusImportErrorCode = "incomplete" | "invalidConsentUse";

type CorpusImportBuildResult =
  { ok: true; payload: CorpusImportPayload } | { ok: false; errorCode: CorpusImportErrorCode };

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
      const [surface = "", lemma = "", gloss = "", features = ""] = row.split("|").map((part) => part.trim());
      return {
        surface,
        lemma,
        gloss,
        features: parseDraftList(features)
      };
    });
}

function hasCompleteCorpusMorphemes(morphemes: CorpusImportPayload["morphologicalSegmentation"]): boolean {
  return (
    morphemes.length > 0 &&
    morphemes.every((morpheme) => morpheme.surface.length > 0 && morpheme.lemma.length > 0 && morpheme.gloss.length > 0)
  );
}

export function buildCorpusImportPayload(draft: CorpusImportDraft): CorpusImportBuildResult {
  const parsedYear = Number(draft.year.trim());
  const topicTags = parseDraftList(draft.tags);
  const morphologicalSegmentation = parseCorpusMorphemeDraft(draft.morphemes);
  const consentUse = draft.consentUse.trim();

  if (
    draft.target.trim().length === 0 ||
    draft.translation.trim().length === 0 ||
    draft.source.trim().length === 0 ||
    draft.author.trim().length === 0 ||
    draft.year.trim().length === 0 ||
    !Number.isInteger(parsedYear) ||
    draft.license.trim().length === 0 ||
    draft.consentRecord.trim().length === 0 ||
    topicTags.length === 0 ||
    !hasCompleteCorpusMorphemes(morphologicalSegmentation)
  ) {
    return { ok: false, errorCode: "incomplete" };
  }

  if (!isCorpusConsentUse(consentUse)) {
    return { ok: false, errorCode: "invalidConsentUse" };
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

/** Maps corpus import validation codes to localized operator-facing copy. */
export function formatCorpusImportError(errorCode: CorpusImportErrorCode, t: Translate): string {
  if (errorCode === "incomplete") {
    return t("corpus.importIncomplete");
  }
  return t("corpus.consentUseInvalid", { values: CORPUS_CONSENT_USE_VALUES.join(", ") });
}

/** Required header columns for TSV/CSV bulk corpus import (restrictions optional). */
export const CORPUS_BULK_REQUIRED_COLUMNS = [
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
] as const;

export type CorpusBulkDelimiter = "tsv" | "csv";

export type CorpusBulkParseErrorCode = "empty" | "missingHeader" | "unknownDelimiter";

export type CorpusBulkRowErrorCode = CorpusImportErrorCode | "duplicateTarget";

export type CorpusBulkDryRunRowResult =
  | {
      rowNumber: number;
      ok: true;
      payload: CorpusImportPayload;
      targetPreview: string;
    }
  | {
      rowNumber: number;
      ok: false;
      errorCode: CorpusBulkRowErrorCode;
      targetPreview: string;
    };

export type CorpusBulkDryRunReport =
  | {
      ok: false;
      format: CorpusBulkDelimiter | null;
      parseError: CorpusBulkParseErrorCode;
      rowCount: 0;
      validCount: 0;
      errorCount: 0;
      rows: [];
    }
  | {
      ok: boolean;
      format: CorpusBulkDelimiter;
      parseError?: undefined;
      rowCount: number;
      validCount: number;
      errorCount: number;
      rows: CorpusBulkDryRunRowResult[];
    };

function detectCorpusBulkDelimiter(headerLine: string): CorpusBulkDelimiter | null {
  if (headerLine.includes("\t")) {
    return "tsv";
  }
  if (headerLine.includes(",")) {
    return "csv";
  }
  return null;
}

/** Splits one delimited line; CSV supports basic double-quoted fields. */
export function splitCorpusBulkLine(line: string, format: CorpusBulkDelimiter): string[] {
  if (format === "tsv") {
    return line.split("\t").map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeBulkMorphemesCell(value: string): string {
  // Bulk cells often cannot carry raw newlines; allow `;` as a row separator.
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

function draftFromBulkCells(header: string[], cells: string[]): CorpusImportDraft {
  const byName = new Map<string, string>();
  for (let index = 0; index < header.length; index += 1) {
    byName.set(header[index]!.trim().toLowerCase(), (cells[index] ?? "").trim());
  }
  const read = (name: string): string => byName.get(name) ?? "";
  return {
    target: read("target"),
    translation: read("translation"),
    source: read("source"),
    author: read("author"),
    year: read("year"),
    license: read("license"),
    consentRecord: read("consentrecord"),
    consentUse: read("consentuse") || DEFAULT_CORPUS_CONSENT_USE,
    tags: read("tags"),
    morphemes: normalizeBulkMorphemesCell(read("morphemes")),
    restrictions: read("restrictions")
  };
}

function headerHasRequiredColumns(header: string[]): boolean {
  const names = new Set(header.map((name) => name.trim().toLowerCase()).filter(Boolean));
  return CORPUS_BULK_REQUIRED_COLUMNS.every((column) => names.has(column.toLowerCase()));
}

/**
 * Dry-runs a TSV/CSV bulk corpus paste: parses rows and validates each through
 * the same draft builder as single-passage import, without calling the API.
 */
export function dryRunCorpusBulkImport(text: string): CorpusBulkDryRunReport {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      format: null,
      parseError: "empty",
      rowCount: 0,
      validCount: 0,
      errorCount: 0,
      rows: []
    };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const headerLine = lines[0] ?? "";
  const format = detectCorpusBulkDelimiter(headerLine);
  if (!format) {
    return {
      ok: false,
      format: null,
      parseError: "unknownDelimiter",
      rowCount: 0,
      validCount: 0,
      errorCount: 0,
      rows: []
    };
  }

  const header = splitCorpusBulkLine(headerLine, format).map((name) => name.trim());
  if (!headerHasRequiredColumns(header)) {
    return {
      ok: false,
      format,
      parseError: "missingHeader",
      rowCount: 0,
      validCount: 0,
      errorCount: 0,
      rows: []
    };
  }

  const seenTargets = new Map<string, number>();
  const rows: CorpusBulkDryRunRowResult[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    // 1-based file line number (header is line 1).
    const rowNumber = index + 1;
    const cells = splitCorpusBulkLine(lines[index]!, format);
    const draft = draftFromBulkCells(header, cells);
    const targetPreview = draft.target.trim();
    const built = buildCorpusImportPayload(draft);
    if (!built.ok) {
      rows.push({
        rowNumber,
        ok: false,
        errorCode: built.errorCode,
        targetPreview
      });
      continue;
    }

    const normalizedTarget = built.payload.textTarget.toLowerCase();
    const firstRow = seenTargets.get(normalizedTarget);
    if (firstRow !== undefined) {
      rows.push({
        rowNumber,
        ok: false,
        errorCode: "duplicateTarget",
        targetPreview
      });
      continue;
    }
    seenTargets.set(normalizedTarget, rowNumber);
    rows.push({
      rowNumber,
      ok: true,
      payload: built.payload,
      targetPreview
    });
  }

  const validCount = rows.filter((row) => row.ok).length;
  const errorCount = rows.length - validCount;
  return {
    ok: errorCount === 0 && validCount > 0,
    format,
    rowCount: rows.length,
    validCount,
    errorCount,
    rows
  };
}

function formatBulkRowError(errorCode: CorpusBulkRowErrorCode, t: Translate): string {
  if (errorCode === "duplicateTarget") {
    return t("corpus.bulkDryRunDuplicateTarget");
  }
  return formatCorpusImportError(errorCode, t);
}

/** Localized summary (+ optional per-row failures) for a bulk dry-run report. */
export function formatCorpusBulkDryRunReport(report: CorpusBulkDryRunReport, t: Translate): string {
  const dryRunPrefix = t("corpus.validateDryRunNote");
  if (report.parseError === "empty") {
    return `${dryRunPrefix} ${t("corpus.bulkDryRunEmpty")}`;
  }
  if (report.parseError === "unknownDelimiter") {
    return `${dryRunPrefix} ${t("corpus.bulkDryRunUnknownDelimiter")}`;
  }
  if (report.parseError === "missingHeader") {
    return `${dryRunPrefix} ${t("corpus.bulkDryRunMissingHeader")}`;
  }

  const summary = t("corpus.bulkDryRunSummary", {
    validCount: report.validCount,
    errorCount: report.errorCount,
    rowCount: report.rowCount
  });
  const failedRows: Array<Extract<CorpusBulkDryRunRowResult, { ok: false }>> = [];
  for (const row of report.rows) {
    if (!row.ok) failedRows.push(row);
  }
  const failures = failedRows.map((row) =>
    t("corpus.bulkDryRunRowError", {
      row: row.rowNumber,
      detail: formatBulkRowError(row.errorCode, t)
    })
  );

  if (failures.length === 0) {
    return `${dryRunPrefix} ${summary}`;
  }
  return `${dryRunPrefix} ${summary} ${failures.join(" ")}`;
}
