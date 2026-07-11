import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SCAN_ROOTS = [join(REPO_ROOT, "apps/api/src"), join(REPO_ROOT, "packages")];

async function productionSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") return [];
        return productionSources(path);
      }
      if (![".ts", ".js", ".cjs", ".mjs"].includes(extname(entry.name))) return [];
      if (/\.(?:test|spec)\.[^.]+$/.test(entry.name)) return [];
      return [path];
    })
  );
  return nested.flat();
}

describe("server-side outbound HTTP architecture", () => {
  it("keeps raw network clients and direct fetch calls behind the guarded boundary", async () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of await productionSources(root)) {
        const source = await readFile(file, "utf8");
        const repoPath = relative(REPO_ROOT, file).replaceAll("\\", "/");
        const isBoundary = repoPath === "apps/api/src/urlSafety.ts";

        if (!isBoundary && /from\s+["'](?:undici|node:https?|https?)["']/.test(source)) {
          violations.push(`${repoPath}: imports a raw HTTP client`);
        }
        if (!isBoundary && /\bglobalThis\.fetch\s*\(/.test(source)) {
          violations.push(`${repoPath}: calls globalThis.fetch directly`);
        }
        if (!isBoundary && /(^|[^.\w])fetch\s*\(/m.test(source)) {
          violations.push(`${repoPath}: calls fetch directly`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not let lower-level packages silently fall back to global fetch", async () => {
    const evalSource = await readFile(join(REPO_ROOT, "packages/eval/src/vectorSearch.ts"), "utf8");
    expect(evalSource).not.toContain("globalThis.fetch");
    expect(evalSource).not.toMatch(/\?\?\s*fetch/);
  });
});
