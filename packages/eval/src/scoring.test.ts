import { describe, expect, it } from "vitest";
import { buildSeedState } from "@assini/synthetic-langs";
import { gradeExerciseAnswer, scoreLanguageEvaluation } from "./scoring";
import { draftNotesForLanguage } from "./studyLoop";

describe("evaluation scoring", () => {
  it("grades accepted and rejected exercise answers", () => {
    const state = buildSeedState();
    const exercise = state.exercises.find((item) => item.id === "avn-ex001");
    if (!exercise) throw new Error("Missing avn-ex001");

    expect(gradeExerciseAnswer(exercise, "mira talo-mi-na").accepted).toBe(true);
    expect(gradeExerciseAnswer(exercise, "talo mira").accepted).toBe(false);
  });

  it("scores a synthetic language against the gold answer key", () => {
    const state = buildSeedState();
    const language = state.languages.find((item) => item.id === "avenik");
    if (!language) throw new Error("Missing Avenik");

    const drafted = draftNotesForLanguage(language.id, state);
    const result = scoreLanguageEvaluation(language.id, state, drafted);

    expect(result.scores.noteCoverage).toBe(1);
    expect(result.scores.evidenceAccuracy).toBe(1);
    expect(result.failures).toHaveLength(0);
  });

  it("rejects unapproved hyphenated forms in generation-policy scoring", () => {
    const state = buildSeedState();
    const exercise = state.exercises.find((item) => item.id === "avn-ex001");
    if (!exercise) throw new Error("Missing avn-ex001");

    exercise.expectedAnswers = ["mira rogue-form"];

    const drafted = draftNotesForLanguage("avenik", state);
    const result = scoreLanguageEvaluation("avenik", state, drafted);

    expect(result.scores.generationPolicy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "generationPolicy",
          itemId: "avn-ex001"
        })
      ])
    );
  });
});
