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
    expect(state.notes).toHaveLength(8);
    expect(state.exercises).toHaveLength(8);
    expect(state.notes.every((note) => note.status === "draft")).toBe(true);
    expect(state.notes.every((note) => languageIds.has(note.languageId))).toBe(true);
    expect(state.exercises.every((exercise) => languageIds.has(exercise.languageId))).toBe(true);
    expect(syntheticLanguageFixtures).toHaveLength(4);

    for (const language of state.languages) {
      expect(state.exercises.filter((exercise) => exercise.languageId === language.id)).toHaveLength(2);
    }
  });

  it("links every note and exercise reference to fixture data", () => {
    const state = buildSeedState();
    const corpusById = new Map(state.corpus.map((passage) => [passage.id, passage]));
    const fixturesByLanguageId = new Map(
      syntheticLanguageFixtures.map((fixture) => [fixture.language.id, fixture])
    );

    for (const note of state.notes) {
      for (const passageId of note.evidencePassageIds) {
        expect(corpusById.get(passageId)?.languageId).toBe(note.languageId);
      }
    }

    for (const exercise of state.exercises) {
      const fixture = fixturesByLanguageId.get(exercise.languageId);
      expect(fixture).toBeDefined();

      const ruleIds = new Set(fixture?.grammarRules.map((rule) => rule.id));
      const vocabularyForms = new Set(fixture?.vocabulary.map((item) => item.form));
      expect(exercise.allowedRuleIds.every((ruleId) => ruleIds.has(ruleId))).toBe(true);
      expect(exercise.allowedVocabulary.every((form) => vocabularyForms.has(form))).toBe(true);
    }
  });

  it("keeps Velari plural fused endings consistent", () => {
    const velari = syntheticLanguageFixtures.find((fixture) => fixture.language.id === "velari");
    expect(velari).toBeDefined();
    expect(velari?.vocabulary.find((item) => item.form === "-eth")?.gloss).toBe("3pl past");
    expect(velari?.grammarRules.find((rule) => rule.id === "vel-rule-fused-ending")?.explanation).toContain(
      "third-person plural past"
    );
    expect(
      velari?.corpus
        .flatMap((passage) => passage.morphologicalSegmentation)
        .filter((segment) => segment.surface === "-eth")
        .map((segment) => segment.gloss)
    ).toEqual(["3pl.past", "3pl.past"]);
    expect(velari?.exercisesAnswerKey.find((exercise) => exercise.id === "vel-ex001")?.gradingExplanation).toContain(
      "third-person plural past"
    );
    expect(JSON.stringify(velari)).not.toContain("3sg");
  });

  it("does not use the locative Velari star passage as object-after-verb evidence", () => {
    const velari = syntheticLanguageFixtures.find((fixture) => fixture.language.id === "velari");
    expect(velari?.grammarRules.find((rule) => rule.id === "vel-rule-object-after-verb")?.evidencePassageIds).toEqual([
      "vel-c001",
      "vel-c003"
    ]);
  });
});
