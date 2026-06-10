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

describe("project documentation", () => {
  it("keeps every handbook doc present with its key sections", async () => {
    const docs = await readAllDocs();

    const expectedContent: Record<string, string[]> = {
      "README.md": ["[Documentation Hub](docs/README.md)", "```mermaid", "First Nations"],
      "docs/README.md": ["[UI Design Guide](ui-design.md)", "## Reading paths", "## Doc index"],
      "docs/api.md": [
        "## Route index",
        "Lead and admin users remain server-token actors",
        "Review-policy updates have a prototype-only reviewer exception",
        "\"async\": true",
        "duplicate"
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
      "docs/configuration.md": ["## Setup recipes", "ASSINI_LLM_PROVIDER", "Deterministic / no-model mode"],
      "docs/development.md": ["npm.cmd run verify", "Building a language from raw sources"],
      "docs/ingestion.md": ["## Source kinds", "## SSRF guard", "## Error catalogue", "## Duplicate flags on drafts", "```mermaid"],
      "docs/maintenance.md": ["## Adding an API route", "## Documentation conventions", "publicLanguageViews.ts"],
      "docs/product-guide.md": ["leadless", "learner, Elder, reviewer, and programmer", "Sources & intake"],
      "docs/roadmap.md": ["Non-negotiable gate", "First Nations"],
      "docs/troubleshooting.md": ["## Startup and ports", "ASSINI_TRANSCRIBE_BASE_URL", "ASSINI_ALLOW_PRIVATE_URLS", "data/local-db.json"],
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
});
