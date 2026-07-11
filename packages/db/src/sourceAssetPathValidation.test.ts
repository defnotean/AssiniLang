import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSourceAssetFilePath } from "./sourceAssetPaths.js";
import { sourceAssetFilePathIssue } from "./sourceAssetPathValidation.js";

describe("sourceAssetFilePathIssue", () => {
  it("accepts canonical assets/<languageId>/... paths", () => {
    expect(sourceAssetFilePathIssue("assets/avenik/source-1__notes.txt", "avenik")).toBeUndefined();
  });

  it("rejects NUL and other control characters before OS path APIs see them", () => {
    expect(sourceAssetFilePathIssue("assets/avenik/a\0.txt", "avenik")).toMatch(/must stay under assets\/avenik\//);
    expect(sourceAssetFilePathIssue("assets/avenik/a\n.txt", "avenik")).toMatch(/must stay under assets\/avenik\//);
    expect(sourceAssetFilePathIssue("assets/avenik/a\r.txt", "avenik")).toMatch(/must stay under assets\/avenik\//);
    expect(sourceAssetFilePathIssue("assets/avenik/a\t.txt", "avenik")).toMatch(/must stay under assets\/avenik\//);
    expect(sourceAssetFilePathIssue("assets/avenik/a\u007f.txt", "avenik")).toMatch(/must stay under assets\/avenik\//);
  });

  it("rejects traversal, absolute, and scheme-like paths", () => {
    expect(sourceAssetFilePathIssue("../outside.txt", "avenik")).toBeDefined();
    expect(sourceAssetFilePathIssue("assets/avenik/../other/x.txt", "avenik")).toBeDefined();
    expect(sourceAssetFilePathIssue("/tmp/x.txt", "avenik")).toBeDefined();
    expect(sourceAssetFilePathIssue("C:/Windows/x.txt", "avenik")).toBeDefined();
    expect(sourceAssetFilePathIssue("file:///tmp/x.txt", "avenik")).toBeDefined();
  });
});

describe("resolveSourceAssetFilePath", () => {
  it("throws for NUL-bearing persisted paths instead of resolving them under dataDir", () => {
    expect(() => resolveSourceAssetFilePath(join(tmpdir(), "data"), "assets/avenik/a\0.txt", "avenik")).toThrow(
      /Unsafe source asset file path/
    );
  });

  it("resolves a safe relative asset path under dataDir", () => {
    const dataDir = join(tmpdir(), "data");
    const resolved = resolveSourceAssetFilePath(dataDir, "assets/avenik/source-1__notes.txt", "avenik");
    expect(resolved.replace(/\\/g, "/")).toContain("assets/avenik/source-1__notes.txt");
  });
});
