import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(contractDir, "../..");
const webDir = join(repoRoot, "apps/web");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function filesContaining(root: string, pattern: RegExp): string[] {
  return sourceFiles(root)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(repoRoot, path).replaceAll("\\", "/"));
}

describe("package boundaries", () => {
  it("keeps the API contract independent of persistence", () => {
    const manifest = readJson(join(contractDir, "package.json"));
    const dependencies = manifest.dependencies as Record<string, string> | undefined;
    const tsconfig = readJson(join(contractDir, "tsconfig.json"));

    expect(dependencies?.["@assini/db"]).toBeUndefined();
    expect(JSON.stringify(tsconfig)).not.toContain("../db");
    expect(filesContaining(join(contractDir, "src"), /from\s+["']@assini\/db(?:\/[^"']*)?["']/)).toEqual([]);
  });

  it("keeps browser source and build configuration independent of persistence", () => {
    const manifest = readJson(join(webDir, "package.json"));
    const dependencies = manifest.dependencies as Record<string, string> | undefined;
    const tsconfig = readFileSync(join(webDir, "tsconfig.json"), "utf8");
    const viteConfig = readFileSync(join(webDir, "vite.config.ts"), "utf8");

    expect(dependencies?.["@assini/db"]).toBeUndefined();
    expect(tsconfig).not.toContain("packages/db");
    expect(viteConfig).not.toContain("@assini/db");
    expect(filesContaining(join(webDir, "src"), /from\s+["']@assini\/db(?:\/[^"']*)?["']/)).toEqual([]);
  });
});
