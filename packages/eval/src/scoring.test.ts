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

  it("rejects extra or reordered allowed morphemes in generation-policy scoring", () => {
    const state = buildSeedState();
    const avenikExercise = state.exercises.find((item) => item.id === "avn-ex001");
    const ketharuExercise = state.exercises.find((item) => item.id === "ket-ex002");
    if (!avenikExercise) throw new Error("Missing avn-ex001");
    if (!ketharuExercise) throw new Error("Missing ket-ex002");

    avenikExercise.expectedAnswers = ["mira talo-mi-na-mi", "mira talo-na-mi"];
    ketharuExercise.expectedAnswers = ["ka-se-lom-ra-ra"];

    const avenikResult = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));
    const ketharuResult = scoreLanguageEvaluation("ketharu", state, draftNotesForLanguage("ketharu", state));

    expect(avenikResult.scores.generationPolicy).toBeLessThan(1);
    expect(ketharuResult.scores.generationPolicy).toBeLessThan(1);
    expect([...avenikResult.failures, ...ketharuResult.failures]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "generationPolicy", itemId: "avn-ex001" }),
        expect.objectContaining({ category: "generationPolicy", itemId: "ket-ex002" })
      ])
    );
  });

  it("emits traceable accuracy and evidence failures when a drafted note is missing", () => {
    const state = buildSeedState();
    const drafted = draftNotesForLanguage("avenik", state);
    const missingNote = drafted[0];
    if (!missingNote) throw new Error("Missing drafted note");

    const result = scoreLanguageEvaluation(
      "avenik",
      state,
      drafted.filter((note) => note.id !== missingNote.id)
    );

    expect(result.scores.noteCoverage).toBeLessThan(1);
    expect(result.scores.noteAccuracy).toBeLessThan(1);
    expect(result.scores.evidenceAccuracy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "noteCoverage", itemId: missingNote.id.replace("-draft", "-note") }),
        expect.objectContaining({ category: "noteAccuracy", itemId: missingNote.id.replace("-draft", "-note") }),
        expect.objectContaining({ category: "evidenceAccuracy", itemId: missingNote.id.replace("-draft", "-note") })
      ])
    );
  });

  it("scores exercise grading with deterministic negative probes", () => {
    const state = buildSeedState();
    const exercise = state.exercises.find((item) => item.id === "avn-ex001");
    if (!exercise) throw new Error("Missing avn-ex001");

    exercise.expectedAnswers = [...exercise.expectedAnswers, "talo-mi-na mira"];

    const result = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));

    expect(result.scores.exerciseGrading).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "exerciseGrading",
          itemId: "avn-ex001"
        })
      ])
    );
  });
});
