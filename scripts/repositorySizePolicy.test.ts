import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const productionLimit = 800;
const testLimit = 1_500;

// There are currently no exceptions. Any future temporary, non-growing budget
// requires an evidence-backed exit plan in docs/large-file-exceptions.md.
const productionExceptions: Record<string, number> = {};

const testExceptions: Record<string, number> = {};

const codeExtension = /\.(?:cjs|js|mjs|ts|tsx)$/;
const testFile = /\.test\.(?:ts|tsx)$/;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["dist", "node_modules"].includes(entry.name)) continue;
      files.push(...(await sourceFiles(absolute)));
    } else if (codeExtension.test(entry.name)) {
      files.push(relative(projectRoot, absolute).replaceAll("\\", "/"));
    }
  }
  return files;
}

async function lineCount(path: string): Promise<number> {
  return (await readFile(join(projectRoot, path), "utf8")).split(/\r?\n/).length;
}

async function filesOverLimit(files: string[], limit: number): Promise<Array<{ path: string; lines: number }>> {
  const measured = await Promise.all(files.map(async (path) => ({ path, lines: await lineCount(path) })));
  return measured.filter(({ lines }) => lines > limit).sort((left, right) => left.path.localeCompare(right.path));
}

async function expectPolicy(files: string[], limit: number, exceptions: Record<string, number>): Promise<void> {
  const oversized = await filesOverLimit(files, limit);
  expect(oversized.map(({ path }) => path)).toEqual(Object.keys(exceptions).sort());
  for (const { path, lines } of oversized) {
    expect(lines, `${path} exceeded its non-growing exception budget`).toBeLessThanOrEqual(exceptions[path] as number);
  }
}

describe("repository source-size policy", () => {
  it("prevents production modules above 800 lines from growing or appearing without an exception", async () => {
    const files = (
      await Promise.all(["apps", "packages", "scripts"].map((directory) => sourceFiles(join(projectRoot, directory))))
    )
      .flat()
      .filter((path) => !testFile.test(path));

    await expectPolicy(files, productionLimit, productionExceptions);
  });

  it("prevents test modules above 1500 lines from growing or appearing without an exception", async () => {
    const files = (
      await Promise.all(["apps", "packages", "scripts"].map((directory) => sourceFiles(join(projectRoot, directory))))
    )
      .flat()
      .filter((path) => testFile.test(path));

    await expectPolicy(files, testLimit, testExceptions);
  });
});
