import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as domainSchemas from "./schemaDomains.js";
import * as publicSchema from "./schema.js";

const INTERNAL_MODULES = [
  "schemaDomains.ts",
  "schemaIntegrityCore.ts",
  "schemaIntegritySources.ts",
  "schemaIntegrityCorpusNotes.ts",
  "schemaIntegrityLearning.ts",
  "schemaIntegrityOperations.ts",
  "schemaIntegrityReview.ts"
] as const;

describe("schema composition boundary", () => {
  it("keeps every domain value available through the compatibility facade", () => {
    for (const [name, value] of Object.entries(domainSchemas)) {
      expect(publicSchema, `schema.ts should re-export ${name}`).toHaveProperty(name, value);
    }
  });

  it("keeps internal schema modules bounded and independent of the facade", async () => {
    for (const moduleName of INTERNAL_MODULES) {
      const source = await readFile(new URL(moduleName, import.meta.url), "utf8");
      expect(source.split(/\r?\n/).length, `${moduleName} should stay below the production limit`).toBeLessThanOrEqual(
        800
      );
      expect(source, `${moduleName} must not create a facade import cycle`).not.toMatch(
        /from\s+["']\.\/schema\.js["']/
      );
    }
  });
});
