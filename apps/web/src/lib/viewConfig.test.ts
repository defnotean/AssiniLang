import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { ar } from "../i18n/ar";
import type { ViewMode } from "./types";
import { LANGUAGE_TYPOLOGY_OPTIONS, VIEW_ORDER } from "./viewConfig";

const ALL_VIEWS: ViewMode[] = [
  "profile",
  "ingest",
  "corpus",
  "review",
  "learner",
  "eval",
  "governance",
  "elder",
  "assistant",
  "model"
];

describe("viewConfig", () => {
  it("keeps sidebar VIEW_ORDER as a subset of known view modes", () => {
    for (const mode of VIEW_ORDER) {
      expect(ALL_VIEWS).toContain(mode);
    }
    expect(new Set(VIEW_ORDER).size).toBe(VIEW_ORDER.length);
  });

  it("has localized label/title/eyebrow keys for every view mode", () => {
    for (const mode of ALL_VIEWS) {
      for (const part of ["label", "title", "eyebrow"] as const) {
        const key = `viewConfig.${mode}.${part}` as keyof typeof en;
        expect(en[key]).toBeTruthy();
        expect(ar[key]).toBeTruthy();
        expect(ar[key]).not.toBe(en[key]);
      }
    }
  });

  it("lists every typology option used by create-language", () => {
    expect(LANGUAGE_TYPOLOGY_OPTIONS).toEqual([
      "unknown",
      "agglutinative",
      "isolating",
      "fusional",
      "polysynthetic-lite",
      "polysynthetic",
      "analytic",
      "mixed"
    ]);
  });
});
