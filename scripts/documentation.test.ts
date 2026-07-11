import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DOC_FILES = [
  "README.md",
  "docs/README.md",
  "docs/api.md",
  "docs/architecture.md",
  "docs/configuration.md",
  "docs/development.md",
  "docs/ingestion.md",
  "docs/maintenance.md",
  "docs/operator-recovery.md",
  "docs/incident-response.md",
  "docs/audit-export-drill.md",
  "docs/product-guide.md",
  "docs/roadmap.md",
  "docs/troubleshooting.md",
  "docs/ui-design.md"
] as const;

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(projectRoot, path), "utf8");
}

async function readAllDocs(): Promise<Map<string, string>> {
  const docs = new Map<string, string>();
  for (const file of DOC_FILES) {
    docs.set(file, await readProjectFile(file));
  }
  return docs;
}

function markdownSection(content: string, startHeading: string, endHeading: string): string {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find markdown section ${startHeading} before ${endHeading}`);
  }
  return content.slice(start, end);
}

// Route paths registered in the Fastify server, derived from source so the
// guard cannot go stale when routes are added or renamed.
async function readRegisteredRoutePaths(): Promise<string[]> {
  const routeFiles = ["apps/api/src/server.ts"];
  const routesDir = join(projectRoot, "apps/api/src/routes");
  for (const entry of await readdir(routesDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      routeFiles.push(`apps/api/src/routes/${entry.name}`);
    }
  }

  const paths = new Set<string>();
  for (const file of routeFiles) {
    const source = await readProjectFile(file);
    for (const match of source.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      const path = match[1];
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

// Members of a named `z.enum([...])` declaration in schema.ts.
async function readEnumMembers(exportName: string): Promise<string[]> {
  const schema = [
    await readProjectFile("packages/db/src/schema.ts"),
    await readProjectFile("packages/db/src/schemaDomains.ts")
  ].join("\n");
  const declaration = new RegExp(`export const ${exportName} = z\\.enum\\(\\[([^\\]]*)\\]`);
  const match = schema.match(declaration);
  if (!match || match[1] === undefined) {
    throw new Error(`Could not find ${exportName} z.enum(...) in schema.ts`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((member) => member[1] as string);
}

// Collection keys and schemaVersion literal of the persisted appStateSchema,
// derived from schema.ts so a new collection cannot ship undocumented.
async function readAppStateShape(): Promise<{ collections: string[]; schemaVersion: number }> {
  const schema = await readProjectFile("packages/db/src/schema.ts");
  const block = schema.match(/export const appStateSchema = z\s*\.object\(\{([\s\S]*?)\}\)\s*\.superRefine/);
  if (!block || block[1] === undefined) {
    throw new Error("Could not find appStateSchema z.object({...}).superRefine in schema.ts");
  }
  const body = block[1];
  const collections: string[] = [];
  for (const match of body.matchAll(/^\s*([A-Za-z0-9_]+):\s*z\.array\(/gm)) {
    if (match[1]) collections.push(match[1]);
  }

  const versionMatch = body.match(/schemaVersion:\s*z\.literal\(([^)]+)\)/);
  if (!versionMatch || versionMatch[1] === undefined) {
    throw new Error("Could not find schemaVersion z.literal(...) in appStateSchema");
  }

  const versionExpression = versionMatch[1].trim();
  let schemaVersion: number;
  if (/^\d+$/.test(versionExpression)) {
    schemaVersion = Number(versionExpression);
  } else {
    const constantMatch = schema.match(new RegExp(`export const ${versionExpression} = (\\d+) as const`));
    if (!constantMatch || constantMatch[1] === undefined) {
      throw new Error(`Could not resolve schemaVersion literal ${versionExpression} from schema.ts`);
    }
    schemaVersion = Number(constantMatch[1]);
  }

  return { collections, schemaVersion };
}

describe("project documentation", () => {
  it("keeps every handbook doc present with its key sections", async () => {
    const docs = await readAllDocs();

    const expectedContent: Record<string, string[]> = {
      "README.md": [
        "[Documentation Hub](docs/README.md)",
        "```mermaid",
        "First Nations",
        "npm.cmd run smoke:backup",
        "npm.cmd run verify:beta",
        "npm.cmd run ci:green"
      ],
      "docs/README.md": [
        "[UI Design Guide](ui-design.md)",
        "[Audit / Export Drill](audit-export-drill.md)",
        "## Reading paths",
        "## Doc index",
        "kept as-is and not updated"
      ],
      "docs/api.md": [
        "verifyExportIntegrity",
        "missing or null `integrity`",
        "non-object `integrity`",
        "own properties required",
        "unexpected or missing `algorithm`/`generatedBy`",
        "mismatched, reordered, truncated, or extended `redactionPolicy`",
        "missing, non-string, or unknown `exportVersion`",
        "Payload key order does not affect verification",
        "vacuous green gate",
        "Cache-Control: no-store",
        "language_snapshot.exported",
        "evaluation_artifact.exported",
        "exactly 64 hex digits",
        "case-insensitive",
        "Relative root segments",
        "ingest.errorVaultOutsideAllowlist",
        "in-flight markers are cleared",
        "## Route index",
        "Lead and admin users remain server-token actors",
        "Review-policy updates have a prototype-only reviewer exception",
        '"async": true',
        "duplicate",
        "processingAttempts",
        "ingest.sourceMaxProcessingAttempts",
        "ingest.sourceAlreadyProcessing",
        "ExerciseAuthoringBody",
        "Evaluation artifact export",
        "uses the reviewer actor in the browser",
        "**remaining** lifetime",
        "ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS",
        "sliding ∩ absolute",
        "Orphan sessions whose `userId` no longer exists",
        "same Secure/HttpOnly/SameSite/Path rules as create",
        "Empty or whitespace-only session cookie",
        "last matching pair wins",
        "trailing malformed percent-encoded",
        "governance.errDispositionNotFound",
        "governance.errDispositionAlreadyResolved",
        "errors.noLanguagesToEvaluate",
        "errors.languageNotFound",
        "errors.invalidLanguageBody",
        "errors.invalidLanguagePatchBody",
        "errors.bulkReviewInvalidAction",
        "errors.bulkReviewInvalidDraftIds",
        "errors.bulkReviewTooManyDraftIds",
        "errors.invalidExerciseAuthoringBody",
        "errors.exerciseAuthoringValidationFailed",
        "errors.invalidExerciseSubmissionBody",
        "errors.exerciseNotFound",
        "errors.exerciseGenerationFailed",
        "errors.invalidCorpusImportBody",
        "errors.corpusImportValidationFailed",
        "errors.extractionDraftNotFound",
        "errors.invalidReviewBody",
        "errors.noteExplanationTooShort",
        "errors.noteNotFound",
        "errors.modelRequired",
        "errors.prototypeAuthDisabled",
        "errors.invalidPrototypeSessionBody",
        "errors.missingLanguageId",
        "whitespace-only, or repeated `languageId`",
        "elder-correction nodes with redacted labels",
        "errors.payloadTooLarge",
        "1 MB import limit",
        "app.rateLimitExceeded",
        "elderWs.errInvalidCorrectionBody",
        "elderWs.errNoteNotFoundForLanguage",
        "elderWs.errPassageNotFoundForLanguage",
        "elderWs.errCorrectionMustBeAccepted",
        "elderWs.errCorrectionNotPending",
        "joined before parsing",
        "empty-workspace guidance",
        "ASSINI_EVAL_REQUIRE_LANGUAGES",
        "A successful run also clears `processingAttempts`",
        "capped asset stays blocked",
        "ASSINI_OCR_PDF_MAX_PAGES",
        "pages 1..N",
        '"schemaVersion": 9'
      ],
      "docs/architecture.md": [
        "## Ingestion pipeline",
        "## Health and readiness",
        "apps/api/src/ingestion.ts",
        "jobRecovery.ts",
        "readiness.ts",
        "jobQueue.ts",
        "segmentationProposals.ts",
        "processingHeartbeatAt",
        "processingAttempts",
        "stale-heartbeat",
        "ingest.sourceMaxProcessingAttempts",
        "desktop/",
        "CONSENT_USE_VALUES",
        "`testing-only`",
        "data/local-db.json",
        "JsonStore / SQLite",
        "```mermaid",
        "schemaVersion",
        "ASSINI_EVAL_REQUIRE_LANGUAGES",
        "empty seed cannot green-pass",
        "OCR readiness",
        "schemaVersion: 9",
        "8 -> 9 SQLite migration",
        "processing_started_at",
        "processing_attempts",
        "processing_heartbeat_at"
      ],
      "docs/configuration.md": [
        "## Setup recipes",
        "ASSINI_LLM_PROVIDER",
        "Deterministic / no-model mode",
        "Empty or whitespace-only session cookie",
        "last matching pair wins",
        "trailing malformed percent-encoded",
        "joined before parsing",
        "Relative segments",
        "Timeout and max-token recommendations for slow local models",
        "ASSINI_LLM_TIMEOUT_MS",
        "ASSINI_LLM_MAX_TOKENS",
        "expires the browser cookie with `Max-Age=0`",
        "ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS",
        "sliding ∩ absolute",
        "three times the configured sliding TTL",
        "raise if extractions are getting truncated",
        "ASSINI_VERIFY_MODEL",
        "verify:beta"
      ],
      "docs/development.md": [
        "npm.cmd run verify",
        "fixtures/eval/testlang-baseline.json",
        "verify:beta",
        "model:verify",
        "npm.cmd run smoke:backup",
        "npm.cmd run ci:green",
        "--omit=dev",
        "CLI refusal checks",
        "SQLite force-overwrite",
        "timed backup/restore drill log",
        "select-or-create empty state",
        "Building a language from raw sources",
        "ASSINI_EVAL_REQUIRE_LANGUAGES",
        "exits `0` with System Eval guidance"
      ],
      "docs/ingestion.md": [
        "## Source kinds",
        "## SSRF guard",
        "## Error catalogue",
        "## Duplicate flags on drafts",
        "```mermaid",
        "Source processing attempt limit reached",
        "ingest.sourceAlreadyProcessing",
        "ingest.processingInterruptedByRestart",
        "processingStartedAt",
        "ingest.transcribeNotConfigured",
        "ingest.warningOfflineHeuristicFallback",
        "ingest.warningModelExtractionFailed",
        "OCR model endpoint returned no text",
        "leaving the model unset",
        "successful run clears the counter",
        "stay blocked",
        "ingest.urlContentTooLarge",
        "ingest.vaultMarkdownTooLarge",
        "errors.payloadTooLarge"
      ],
      "docs/maintenance.md": [
        "## Adding an API route",
        "## Documentation conventions",
        "publicLanguageViews.ts",
        "--dry-run",
        "same path",
        "symlink alias",
        "hard-link alias",
        "case-only path alias",
        "extended-length prefix",
        "does not bypass same-file identity",
        "validates the live workspace",
        "not an existing directory",
        "is also refused unless",
        "--force",
        "JSON and SQLite both overwrite",
        "backup source is an existing directory",
        "same clear file-path error as backup",
        "Desktop create validates",
        "Desktop restore validates",
        "prefers the newest routine backup",
        "database file only",
        "not `data/assets/`",
        "refuses to replace live data if that safety backup fails",
        "dry-run still succeeds and prints a warning",
        "docs/audit-export-drill.md",
        "docs/operator-recovery.md",
        "`api.ts` is the public barrel",
        "apps/web/src/api/",
        "i18n/en.ts",
        "schemaVersion: 9",
        "SQLITE_MIGRATIONS"
      ],
      "docs/operator-recovery.md": [
        "## Local data paths",
        "data/local-db.json",
        "data/ocr-cache/",
        "npm.cmd run db:backup",
        "--dry-run",
        "refuses to overwrite an existing backup file",
        "--force",
        "refuses to archive an invalid workspace",
        "symlink or hard-link aliases",
        "case-only path aliases",
        "extended-length prefixes",
        "does not bypass same-file identity",
        "JsonStore.restoreFrom",
        "source_asset.processing_recovered",
        "processingStartedAt",
        "successful reprocess clears the counter",
        "ingest.sourceMaxProcessingAttempts",
        "npm.cmd run seed",
        "existing directory is rejected",
        "refuses when the backup path is a directory",
        "Create validates the live workspace",
        "Desktop's restore-latest",
        "newest **routine** restorable backup",
        "backup-manifest.json",
        "no silent fallback",
        "database file only",
        "data/assets/",
        "backup-safety-before-restore-",
        "refuses to wipe live data if that safety backup fails",
        "dry-run still succeeds and warns",
        "audit-export-drill.md",
        "language_snapshot.exported",
        "evaluation_artifact.exported",
        "## Acceptance drills (operator recovery pack)",
        "Timed backup/restore exercise",
        "timed backup/restore drill log:",
        "Interrupted-processing drill log",
        "interrupted-processing drill log",
        'metadata.reason: "interrupted_restart"'
      ],
      "docs/incident-response.md": [
        "## First five minutes",
        "## Signal interpretation",
        "Startup recovery failed",
        "requests.errors.server",
        "job.failed",
        "request.unhandled",
        "Never attach `.env`",
        "## Closure checklist"
      ],
      "docs/audit-export-drill.md": [
        "## What you prove",
        "## Fixtures and automated guard",
        "## Step-by-step local drill",
        "fixtures/exports/language-snapshot.sample.json",
        "fixtures/exports/evaluation-artifact.sample.json",
        "scripts/reviewAccountability.test.ts",
        "language-snapshot-v2",
        "evaluation-artifact-v2",
        "language_snapshot.exported",
        "evaluation_artifact.exported",
        "verifyExportIntegrity",
        "/exports/languages/testlang/snapshot",
        "/exports/evaluations/artifact",
        "/audit/events",
        "x-assini-user-id",
        "x-assini-dev-token",
        "Cache-Control: no-store",
        "errors.languageNotFound",
        "operator-recovery.md"
      ],
      "docs/roadmap.md": [
        "Non-negotiable gate",
        "testlang-baseline.json",
        "verify:beta",
        "ci:green",
        "groundingFailureCodes",
        "First Nations",
        "timeout/max-token starting points",
        "Clear ingest attempts on success",
        "Stale-heartbeat reclaim without restart",
        "jobRecovery.ts",
        "Eval empty gates",
        "ASSINI_EVAL_REQUIRE_LANGUAGES",
        "Prototype session absolute max",
        "sliding ∩ absolute",
        "smoke:backup",
        "success clears the counter",
        "source_asset.processing_recovered",
        "in-process only",
        "audit-export-drill.md",
        "acceptance-pack screenshots",
        "Operator recovery drills",
        "timed backup/restore drill log",
        "interrupted-processing drill log",
        "corrupted-database loud-failure screenshot",
        "oversizedImportFailures.test.ts",
        "ingest.vaultMarkdownTooLarge",
        "ASSINI_OCR_PDF_MAX_PAGES",
        "ModelSetupView.test.tsx",
        "ModelDiscoveryPanel.test.tsx",
        "schema 9",
        "8 -> 9 SQLite migration"
      ],
      "docs/product-guide.md": [
        "leadless",
        "learner, Elder, reviewer, and programmer",
        "Build and sources & intake",
        "evaluation artifact export",
        "Run System Eval",
        "vacuous green gate",
        "next-step empty state",
        "New language"
      ],
      "docs/troubleshooting.md": [
        "## Startup and ports",
        "ASSINI_TRANSCRIBE_BASE_URL",
        "ASSINI_ALLOW_PRIVATE_URLS",
        "data/local-db.json",
        "ingest.processingInterruptedByRestart",
        "ingest.sourceMaxProcessingAttempts",
        "a successful run also clears `processingAttempts`",
        "only a successful process clears ingest attempts",
        "errors.noLanguagesToEvaluate",
        "ASSINI_EVAL_REQUIRE_LANGUAGES",
        "relative roots were set",
        "errors.prototypeAuthDisabled",
        "ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS",
        "absolute deadline",
        "app.rateLimitExceeded",
        "requestId",
        "x-request-id",
        "(request id:",
        "select-or-create / next-step empty state",
        "New language",
        "destination is a directory",
        "destination already exists",
        "same as the live database",
        "case-only alias",
        "extended-length prefix",
        "does not bypass this check",
        "backup source is a directory",
        "database file only",
        "could not create a safety backup",
        "disk full",
        "newest **routine** backup",
        "ASSINI_OCR_PDF_MAX_PAGES",
        "pages 1..N"
      ],
      "docs/ui-design.md": [
        "## Implemented direction",
        "source of truth",
        "Atlas layout",
        "night-sky",
        "local-first",
        "Sources & intake"
      ]
    };

    for (const [file, sentinels] of Object.entries(expectedContent)) {
      const content = docs.get(file);
      expect(content, `${file} should exist`).toBeDefined();
      for (const sentinel of sentinels) {
        expect(content, `${file} should contain ${JSON.stringify(sentinel)}`).toContain(sentinel);
      }
    }
  });

  it("keeps the root README a concise map that links out", async () => {
    const readme = await readProjectFile("README.md");
    expect(readme.split(/\r?\n/).length).toBeLessThanOrEqual(150);
  });

  it("links every docs/*.md file from the documentation hub", async () => {
    const hub = await readProjectFile("docs/README.md");
    const entries = await readdir(join(projectRoot, "docs"), { withFileTypes: true });
    const docFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
      .map((entry) => entry.name);

    expect(docFiles.length).toBeGreaterThanOrEqual(10);
    for (const file of docFiles) {
      expect(hub, `docs/README.md should link ${file}`).toContain(`(${file})`);
    }
  });

  it("keeps every relative markdown link pointing at a real file", async () => {
    const docs = await readAllDocs();
    const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
    const broken: string[] = [];

    for (const [file, content] of docs) {
      const baseDir = dirname(join(projectRoot, file));
      for (const match of content.matchAll(linkPattern)) {
        const rawTarget = (match[1] ?? "").trim();
        if (
          rawTarget.length === 0 ||
          rawTarget.startsWith("http://") ||
          rawTarget.startsWith("https://") ||
          rawTarget.startsWith("mailto:") ||
          rawTarget.startsWith("#")
        ) {
          continue;
        }
        const targetPath = (rawTarget.split("#")[0] ?? "").trim();
        if (targetPath.length === 0) continue;
        const resolved = resolve(baseDir, targetPath);
        const exists = await stat(resolved).then(
          () => true,
          () => false
        );
        if (!exists) {
          broken.push(`${file} -> ${rawTarget}`);
        }
      }
    }

    expect(broken, `Broken relative links:\n${broken.join("\n")}`).toEqual([]);
  });

  it("documents every ASSINI_* environment variable referenced in source", async () => {
    const configurationDoc = await readProjectFile("docs/configuration.md");
    const sourceRoots = ["apps", "packages", "scripts"];
    const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
    const referenced = new Set<string>();

    for (const root of sourceRoots) {
      const entries = await readdir(join(projectRoot, root), { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const extension = entry.name.slice(entry.name.lastIndexOf("."));
        if (!sourceExtensions.has(extension)) continue;
        const parent = entry.parentPath ?? entry.path;
        if (parent.includes("node_modules") || parent.includes("dist")) continue;
        const content = await readFile(join(parent, entry.name), "utf8");
        for (const match of content.matchAll(/ASSINI_[A-Z0-9_]*[A-Z0-9]/g)) {
          referenced.add(match[0]);
        }
      }
    }

    expect(referenced.size).toBeGreaterThanOrEqual(10);
    const undocumented = [...referenced].filter((name) => !configurationDoc.includes(name)).sort();
    expect(undocumented, `Add these variables to docs/configuration.md: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("documents the non-ASSINI environment variables read in source", async () => {
    const configurationDoc = await readProjectFile("docs/configuration.md");
    const nonPrefixedVars = ["PORT", "HOST", "OPENAI_API_KEY", "OPENAI_MODEL"];
    const undocumented = nonPrefixedVars.filter((name) => !configurationDoc.includes(name));
    expect(undocumented, `Add these variables to docs/configuration.md: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("indexes every server route path in docs/api.md", async () => {
    const apiDoc = await readProjectFile("docs/api.md");
    const routeIndex = markdownSection(apiDoc, "## Route index", "## Auth model");
    const routePaths = await readRegisteredRoutePaths();

    expect(routePaths.length).toBeGreaterThanOrEqual(10);
    const undocumented = routePaths.filter((path) => !routeIndex.includes(`\`${path}\``)).sort();
    expect(undocumented, `Add these routes to the docs/api.md route index: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("lists every source-asset kind in the ingestion source-kinds table", async () => {
    const ingestionDoc = await readProjectFile("docs/ingestion.md");
    const kinds = await readEnumMembers("sourceAssetKindSchema");

    expect(kinds).toContain("document");
    const undocumented = kinds.filter((kind) => !ingestionDoc.includes(`\`${kind}\``)).sort();
    expect(undocumented, `Add these source kinds to the docs/ingestion.md table: ${undocumented.join(", ")}`).toEqual(
      []
    );
  });

  it("enumerates every persisted collection and the schema version in architecture.md", async () => {
    const architectureDoc = await readProjectFile("docs/architecture.md");
    const { collections, schemaVersion } = await readAppStateShape();

    expect(collections).toContain("languages");
    expect(collections).toContain("extractionDrafts");
    const missingCollections = collections
      .filter((name) => name !== "schemaVersion")
      .filter((name) => !architectureDoc.includes(`\`${name}\``))
      .sort();
    expect(
      missingCollections,
      `Add these collections to the architecture.md collections list: ${missingCollections.join(", ")}`
    ).toEqual([]);

    expect(
      architectureDoc.includes(`schemaVersion: ${schemaVersion}`),
      `architecture.md should state schemaVersion: ${schemaVersion} to match schema.ts`
    ).toBe(true);
  });

  it("guards current OCR, web-client, model-operations, and persistence facts", async () => {
    const docs = await readAllDocs();
    const currentHandbook = [...docs.values()].join("\n");
    const architecture = docs.get("docs/architecture.md") ?? "";
    const maintenance = docs.get("docs/maintenance.md") ?? "";
    const roadmap = docs.get("docs/roadmap.md") ?? "";

    // Dated plans are deliberately outside DOC_FILES: their old intent is historical.
    expect(currentHandbook).not.toContain("AssiniLang.html");
    expect(currentHandbook).not.toContain("i18n/ar.ts");
    expect(currentHandbook).not.toMatch(/\bpage[- ]1(?:-only)?\b/i);

    for (const file of ["docs/api.md", "docs/ingestion.md", "docs/roadmap.md", "docs/troubleshooting.md"] as const) {
      const content = docs.get(file) ?? "";
      expect(content, `${file} should document the scanned-PDF page cap`).toContain("ASSINI_OCR_PDF_MAX_PAGES");
      expect(content, `${file} should document the default scanned-PDF page cap`).toMatch(/default `?10`?/);
    }

    expect(maintenance).toContain("`api.ts` is the public barrel");
    expect(maintenance).toContain("apps/web/src/api/");
    expect(roadmap).toContain("saved-profile switch test is shipped");
    expect(roadmap).toContain("unloaded-model stale-state tests are shipped");

    const { schemaVersion } = await readAppStateShape();
    expect(schemaVersion).toBe(9);
    expect(architecture).toContain("The current schema version is 9");
    expect(architecture).toContain("8 -> 9 SQLite migration");
    expect(architecture).toContain("processing_started_at");
    expect(architecture).toContain("processing_attempts");
    expect(architecture).toContain("processing_heartbeat_at");
  });
});
