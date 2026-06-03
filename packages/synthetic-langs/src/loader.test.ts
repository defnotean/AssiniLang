import { describe, expect, it } from "vitest";
import { buildSeedState, syntheticLanguageFixtures } from "./loader";

describe("synthetic language fixtures", () => {
  it("contains four typologically distinct synthetic languages", () => {
    const state = buildSeedState();
    expect(state.languages).toHaveLength(4);
    expect(new Set(state.languages.map((language) => language.typology))).toEqual(
      new Set(["agglutinative", "isolating", "fusional", "polysynthetic-lite"])
    );
  });

  it("labels every passage as synthetic testing data", () => {
    const state = buildSeedState();
    expect(state.corpus.length).toBeGreaterThanOrEqual(20);
    expect(state.corpus.every((passage) => passage.consentStatus.use === "synthetic-testing-only")).toBe(true);
  });

  it("connects notes and exercises to existing languages", () => {
    const state = buildSeedState();
    const languageIds = new Set(state.languages.map((language) => language.id));
    expect(state.notes.every((note) => languageIds.has(note.languageId))).toBe(true);
    expect(state.exercises.every((exercise) => languageIds.has(exercise.languageId))).toBe(true);
    expect(syntheticLanguageFixtures).toHaveLength(4);
  });
});
