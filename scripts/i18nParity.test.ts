import { describe, expect, it } from "vitest";
import { ar } from "../apps/web/src/i18n/ar";
import { en } from "../apps/web/src/i18n/en";

function sortedKeys(catalog: Record<string, string>): string[] {
  return Object.keys(catalog).sort();
}

function formatMissingKeys(label: string, keys: string[]): string {
  if (keys.length === 0) return "";
  return `${label}:\n${keys.map((key) => `  - ${key}`).join("\n")}`;
}

describe("i18n key parity", () => {
  it("keeps English and Arabic catalogs in sync", () => {
    const enKeys = sortedKeys(en);
    const arKeys = sortedKeys(ar);

    const missingFromAr = enKeys.filter((key) => !arKeys.includes(key));
    const missingFromEn = arKeys.filter((key) => !enKeys.includes(key));

    const report = [
      formatMissingKeys("Missing from ar.ts (present in en.ts)", missingFromAr),
      formatMissingKeys("Missing from en.ts (present in ar.ts)", missingFromEn)
    ]
      .filter(Boolean)
      .join("\n\n");

    expect(missingFromAr, report || undefined).toEqual([]);
    expect(missingFromEn, report || undefined).toEqual([]);
  });
});
