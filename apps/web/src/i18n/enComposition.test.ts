import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertUniqueEnglishMessageKeys } from "./catalogComposition";
import { en } from "./en";
import { enFoundation } from "./enFoundation";
import { enModel } from "./enModel";
import { enWorkflows } from "./enWorkflows";

const FRAGMENTS = [enFoundation, enWorkflows, enModel] as const;
const MODULES = ["enFoundation.ts", "enWorkflows.ts", "enModel.ts"] as const;

describe("English catalog composition", () => {
  it("preserves the exact complete key set and fragment order", () => {
    const fragmentEntries = FRAGMENTS.flatMap((fragment) => Object.entries(fragment));
    expect(fragmentEntries).toHaveLength(1_576);
    expect(new Set(fragmentEntries.map(([key]) => key)).size).toBe(1_576);
    expect(Object.entries(en)).toEqual(fragmentEntries);
  });

  it("rejects duplicate keys across independently valid fragments", () => {
    expect(() =>
      assertUniqueEnglishMessageKeys([{ "common.example": "first" }, { "common.example": "second" }])
    ).toThrow("Duplicate English message key across catalog modules: common.example");
  });

  it("keeps fragments bounded and independent of the public catalog facade", async () => {
    for (const moduleName of MODULES) {
      const source = await readFile(new URL(moduleName, import.meta.url), "utf8");
      expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      expect(source).not.toMatch(/from\s+["']\.\/en["']/);
    }
  });
});
