import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createEmptyState } from "./storeState.js";
import { pathsReferToSameFile, replaceFileAtomically, stripWindowsExtendedPrefix } from "./storeFileIdentity.js";
import * as storeFacade from "./store.js";

const INTERNAL_MODULES = ["storeConfig.ts", "storeFileIdentity.ts", "storeState.ts"] as const;

describe("store composition boundary", () => {
  it("preserves helper exports through the store compatibility facade", () => {
    expect(storeFacade.createEmptyState).toBe(createEmptyState);
    expect(storeFacade.pathsReferToSameFile).toBe(pathsReferToSameFile);
    expect(storeFacade.replaceFileAtomically).toBe(replaceFileAtomically);
    expect(storeFacade.stripWindowsExtendedPrefix).toBe(stripWindowsExtendedPrefix);
  });

  it("keeps extracted helpers bounded and independent of the facade", async () => {
    for (const moduleName of INTERNAL_MODULES) {
      const source = await readFile(new URL(moduleName, import.meta.url), "utf8");
      expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      expect(source).not.toMatch(/from\s+["']\.\/store\.js["']/);
    }
  });
});
