import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("script JSON helpers", () => {
  it("reads JSON files as parsed objects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-json-helper-"));
    try {
      const path = join(dir, "fixture.json");
      await writeFile(path, "{\"name\":\"AssiniLang\",\"ok\":true}\n", "utf8");
      const { readJsonFile } = await import("./lib/jsonHelpers.mjs");

      await expect(readJsonFile(path)).resolves.toEqual({
        name: "AssiniLang",
        ok: true
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
