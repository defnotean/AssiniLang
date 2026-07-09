import { describe, expect, it } from "vitest";
import { en } from "../apps/web/src/i18n/en";

describe("English i18n catalog", () => {
  it("contains unique, non-empty translation values", () => {
    const keys = Object.keys(en);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(0);
    for (const value of Object.values(en)) {
      expect(value.trim()).not.toBe("");
    }
  });

  it("keeps interpolation placeholders balanced", () => {
    for (const [key, value] of Object.entries(en)) {
      const placeholders = value.match(/\{\w+\}/g) ?? [];
      expect(new Set(placeholders).size, key).toBe(placeholders.length);
    }
  });
});
