import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import {
  corpusPhonologyValidationError,
  corpusTargetContainsSurface,
  firstDuplicateNormalizedValue,
  normalizeAuthoredAnswer
} from "./corpusValidation.js";

describe("corpus validation helpers", () => {
  it("normalizes authored answers by trimming and collapsing whitespace", () => {
    expect(normalizeAuthoredAnswer("  saku\n\ttalo-ki  ")).toBe("saku talo-ki");
  });

  it("returns the first duplicate after authored-answer normalization", () => {
    expect(firstDuplicateNormalizedValue([" noun ", "verb", "noun"])).toBe("noun");
    expect(firstDuplicateNormalizedValue(["Saku talo", "saku talo"])).toBeUndefined();
  });

  it("matches corpus surfaces inside target tokens after case and hyphen normalization", () => {
    expect(corpusTargetContainsSurface("Mira talo-na", "-NA")).toBe(true);
    expect(corpusTargetContainsSurface("Mira talo-na", "talo")).toBe(true);
    expect(corpusTargetContainsSurface("Mira talo-na", "saku")).toBe(false);
  });

  it("reports missing corpus import languages with the existing error text", () => {
    const state = buildTestWorkspaceState();

    expect(corpusPhonologyValidationError(state, "missing-language", { textTarget: "mira" }))
      .toBe("Corpus import language not found: missing-language");
  });

  it("skips orthography validation when no phonology inventory is declared", () => {
    const state = buildTestWorkspaceState();
    const language = state.languages.find((item) => item.id === TEST_LANGUAGE_ID);
    if (!language) throw new Error("Expected test language");
    language.phonology = {
      consonants: [],
      vowels: [],
      syllableTemplate: "CV",
      stress: "word-initial",
      notes: []
    };

    expect(corpusPhonologyValidationError(state, TEST_LANGUAGE_ID, { textTarget: "mira-z" })).toBeUndefined();
  });

  it("reports target text outside the language phonology with the existing error text", () => {
    const state = buildTestWorkspaceState();

    expect(corpusPhonologyValidationError(state, TEST_LANGUAGE_ID, { textTarget: "mira-z talo-na" }))
      .toBe("Corpus target text uses z outside Testlang phonology inventory: mira-z talo-na");
  });
});
