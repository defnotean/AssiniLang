import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as artifactFormatters from "./formatArtifacts";
import * as errorFormatters from "./formatErrors";
import * as publicFormatters from "./format";
import * as labelFormatters from "./formatLabels";

const MODULES = ["formatLabels.ts", "formatArtifacts.ts", "formatErrors.ts"] as const;

describe("format compatibility facade", () => {
  it("re-exports every formatter from the bounded domain modules", () => {
    for (const moduleExports of [labelFormatters, artifactFormatters, errorFormatters]) {
      for (const [name, value] of Object.entries(moduleExports)) {
        expect(publicFormatters, `format.ts should re-export ${name}`).toHaveProperty(name, value);
      }
    }
  });

  it("keeps domain modules bounded and independent of the compatibility facade", async () => {
    for (const moduleName of MODULES) {
      const source = await readFile(new URL(moduleName, import.meta.url), "utf8");
      expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      expect(source).not.toMatch(/from\s+["']\.\/format["']/);
    }
  });
});
