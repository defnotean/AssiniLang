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
  const schema = await readProjectFile("packages/db/src/schema.ts");
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
  const block = schema.match(/export const appStateSchema = z\.object\(\{([\s\S]*?)\}\)\.superRefine/);
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
    const constantMatch = schema.match(
      new RegExp(`export const ${versionExpression} = (\\d+) as const`)
    );
    if (!constantMatch || constantMatch[1] === undefined) {
      throw new Error(
        `Could not resolve schemaVersion literal ${versionExpression} from schema.ts`
      );
    }
    schemaVersion = Number(constantMatch[1]);
  }

  return { collections, schemaVersion };
}

describe("project documentation", () => {
  it("keeps every handbook doc present with its key sections", async () => {
    const docs = await readAllDocs();

    const expectedContent: Record<string, string[]> = {
      "README.md": ["[Documentation Hub](docs/README.md)", "```mermaid", "First Nations"],
      "docs/README.md": ["[UI Design Guide](ui-design.md)", "## Reading paths", "## Doc index"],
      "docs/api.md": [
        "verifyExportIntegrity",
        "unexpected `algorithm`/`generatedBy`",
        "mismatched `redactionPolicy`",
        "case-insensitive",
        "Relative root segments",
        "in-flight markers are cleared",
        "## Route index",
        "Lead and admin users remain server-token actors",
        "Review-policy updates have a prototype-only reviewer exception",
        "\"async\": true",
        "duplicate",
        "processingAttempts",
        "ingest.sourceMaxProcessingAttempts",
        "ingest.sourceAlreadyProcessing",
        "ExerciseAuthoringBody",
        "Evaluation artifact export",
        "uses the reviewer actor in the browser",
        "cookie `Max-Age` both refresh",
        "Empty or whitespace-only session cookie",
        "last matching pair wins",
        "errors.noLanguagesToEvaluate",
        "errors.languageNotFound",
        "errors.prototypeAuthDisabled",
        "errors.missingLanguageId",
        "errors.payloadTooLarge",
        "app.rateLimitExceeded",
        "elderWs.errInvalidCorrectionBody",
        "elderWs.errCorrectionMustBeAccepted",
        "elderWs.errCorrectionNotPending"
      ],
      "docs/architecture.md": [
        "## Ingestion pipeline",
        "apps/api/src/ingestion.ts",
        "CONSENT_USE_VALUES",
        "`testing-only`",
        "data/local-db.json",
        "```mermaid",
        "schemaVersion"
      ],
      "docs/configuration.md": [
        "## Setup recipes",
        "ASSINI_LLM_PROVIDER",
        "Deterministic / no-model mode",
        "Empty or whitespace-only session cookie",
        "last matching pair wins",
        "Relative segments"
      ],
      "docs/development.md": [
        "npm.cmd run verify",
        "fixtures/eval/testlang-baseline.json",
        "verify:beta",
        "model:verify",
        "Building a language from raw sources"
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
        "leaving the model unset"
      ],
      "docs/maintenance.md": [
        "## Adding an API route",
        "## Documentation conventions",
        "publicLanguageViews.ts",
        "--dry-run",
        "same path",
        "symlink alias",
        "hard-link alias",
        "validates the live workspace"
      ],
      "docs/operator-recovery.md": [
        "## Local data paths",
        "data/local-db.json",
        "data/ocr-cache/",
        "npm.cmd run db:backup",
        "--dry-run",
        "refuses to archive an invalid workspace",
        "symlink or hard-link aliases",
        "JsonStore.restoreFrom",
        "source_asset.processing_recovered",
        "processingStartedAt",
        "npm.cmd run seed"
      ],
      "docs/product-guide.md": [
        "leadless",
        "learner, Elder, reviewer, and programmer",
        "Build and sources & intake",
        "evaluation artifact export"
      ],
      "docs/roadmap.md": ["Non-negotiable gate", "testlang-baseline.json", "verify:beta", "groundingFailureCodes", "First Nations"],
      "docs/troubleshooting.md": [
        "## Startup and ports",
        "ASSINI_TRANSCRIBE_BASE_URL",
        "ASSINI_ALLOW_PRIVATE_URLS",
        "data/local-db.json",
        "ingest.processingInterruptedByRestart",
        "relative roots were set",
        "errors.prototypeAuthDisabled",
        "app.rateLimitExceeded"
      ],
      "docs/ui-design.md": ["AssiniLang.html", "Atlas layout", "night-sky", "local-first", "Sources & intake"]
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
          rawTarget.length === 0
          || rawTarget.startsWith("http://")
          || rawTarget.startsWith("https://")
          || rawTarget.startsWith("mailto:")
          || rawTarget.startsWith("#")
        ) {
          continue;
        }
        const targetPath = (rawTarget.split("#")[0] ?? "").trim();
        if (targetPath.length === 0) continue;
        const resolved = resolve(baseDir, targetPath);
        const exists = await stat(resolved).then(() => true, () => false);
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
    expect(undocumented, `Add these source kinds to the docs/ingestion.md table: ${undocumented.join(", ")}`).toEqual([]);
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
});
