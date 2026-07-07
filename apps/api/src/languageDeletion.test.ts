import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { purgeLanguageFromState } from "./languageDeletion.js";

describe("purgeLanguageFromState", () => {
  it("removes the language and all scoped workspace records", () => {
    const state = buildTestWorkspaceState();
    const purged = purgeLanguageFromState(state, TEST_LANGUAGE_ID);

    expect(purged.languages.some((language) => language.id === TEST_LANGUAGE_ID)).toBe(false);
    expect(purged.corpus.every((item) => item.languageId !== TEST_LANGUAGE_ID)).toBe(true);
    expect(purged.notes.every((item) => item.languageId !== TEST_LANGUAGE_ID)).toBe(true);
    expect(purged.lexemes.every((item) => item.languageId !== TEST_LANGUAGE_ID)).toBe(true);
    expect(purged.exercises.every((item) => item.languageId !== TEST_LANGUAGE_ID)).toBe(true);
    expect(purged.auditEvents.every((item) => item.languageId !== TEST_LANGUAGE_ID)).toBe(true);
    expect(purged.languages.length).toBe(state.languages.length - 1);
  });
});
