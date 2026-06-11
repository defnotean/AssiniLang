import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { gradeExerciseAnswer, scoreLanguageEvaluation } from "./scoring.js";
import { draftNotesForLanguage } from "./studyLoop.js";

describe("evaluation scoring", () => {
  it("grades accepted and rejected exercise answers", () => {
    const state = buildTestWorkspaceState();
    const exercise = state.exercises.find((item) => item.id === "testlang-ex-002");
    if (!exercise) throw new Error("Missing testlang-ex-002");

    expect(gradeExerciseAnswer(exercise, "saku talo-ki").accepted).toBe(true);
    expect(gradeExerciseAnswer(exercise, "talo saku").accepted).toBe(false);
  });

  it("scores a clean workspace language at full marks", () => {
    const state = buildTestWorkspaceState();

    const drafted = draftNotesForLanguage(TEST_LANGUAGE_ID, state);
    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, drafted);

    expect(result.scores.noteCoverage).toBe(1);
    expect(result.scores.evidenceAccuracy).toBe(1);
    expect(result.failures).toHaveLength(0);
  });

  it("scores corpus translations against answer-key text", () => {
    const state = buildTestWorkspaceState();
    const passage = state.corpus.find((item) => item.id === "testlang-c001");
    if (!passage) throw new Error("Missing testlang-c001");

    passage.textTranslation = "A fluent but wrong translation.";

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.translationAccuracy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "translationAccuracy",
          itemId: "testlang-c001"
        })
      ])
    );
  });

  it("scores corpus segmentations against answer-key morphemes", () => {
    const state = buildTestWorkspaceState();
    const passage = state.corpus.find((item) => item.id === "testlang-c002");
    if (!passage) throw new Error("Missing testlang-c002");

    passage.morphologicalSegmentation = [
      { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
      { surface: "nemi-lo", lemma: "nemi", gloss: "teach.past", features: ["verb"] },
      { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
    ];

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.segmentationAccuracy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "segmentationAccuracy",
          itemId: "testlang-c002"
        })
      ])
    );
  });

  it("scores drafted notes against immutable answer keys instead of mutable reviewed notes", () => {
    const state = buildTestWorkspaceState();
    const reviewedNote = state.notes.find((note) => note.id === "testlang-note-basic-order");
    if (!reviewedNote) throw new Error("Missing reviewed note");

    reviewedNote.explanation = "Reviewed note text that should not become the gold answer.";

    const result = scoreLanguageEvaluation(
      TEST_LANGUAGE_ID,
      state,
      state.notes.filter((note) => note.languageId === TEST_LANGUAGE_ID)
    );

    expect(result.scores.noteAccuracy).toBeLessThan(1);
    const failure = result.failures.find((f: any) => f.category === "noteAccuracy" && f.itemId === "testlang-note-basic-order");
    expect(failure).toBeDefined();
    expect(failure?.message).toContain("draft confidence:");
  });

  it("drafts baseline notes from immutable answer keys instead of reviewed notes", () => {
    const state = buildTestWorkspaceState();
    const reviewedNote = state.notes.find((note) => note.id === "testlang-note-basic-order");
    if (!reviewedNote) throw new Error("Missing reviewed note");

    const originalExplanation = reviewedNote.explanation;
    reviewedNote.explanation = "Reviewed wording from the mutable queue.";

    const drafted = draftNotesForLanguage(TEST_LANGUAGE_ID, state);
    const draftedNote = drafted.find((note: any) => note.topic === reviewedNote.topic);

    expect(draftedNote?.explanation).toBe(originalExplanation);
  });

  it("rejects unapproved forms in generation-policy scoring", () => {
    const state = buildTestWorkspaceState();
    const exercise = state.exercises.find((item) => item.id === "testlang-ex-002");
    if (!exercise) throw new Error("Missing testlang-ex-002");

    exercise.expectedAnswers = ["mira rogue-form"];

    const drafted = draftNotesForLanguage(TEST_LANGUAGE_ID, state);
    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, drafted);

    expect(result.scores.generationPolicy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "generationPolicy",
          itemId: "testlang-ex-002"
        })
      ])
    );
  });

  it("rejects allowed-morpheme answers that do not exist in the corpus", () => {
    const state = buildTestWorkspaceState();
    const exercise = state.exercises.find((item) => item.id === "testlang-ex-002");
    if (!exercise) throw new Error("Missing testlang-ex-002");

    exercise.expectedAnswers = ["saku talo-ki-ki"];

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.generationPolicy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "generationPolicy", itemId: "testlang-ex-002" })
      ])
    );
  });

  it("emits traceable accuracy and evidence failures when a drafted note is missing", () => {
    const state = buildTestWorkspaceState();
    const drafted = draftNotesForLanguage(TEST_LANGUAGE_ID, state);
    const missingNote = drafted[0];
    if (!missingNote) throw new Error("Missing drafted note");

    const result = scoreLanguageEvaluation(
      TEST_LANGUAGE_ID,
      state,
      drafted.filter((note: any) => note.id !== missingNote.id)
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
    const state = buildTestWorkspaceState();
    const exercise = state.exercises.find((item) => item.id === "testlang-ex-002");
    if (!exercise) throw new Error("Missing testlang-ex-002");

    exercise.expectedAnswers = [...exercise.expectedAnswers, "talo-ki saku"];

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.exerciseGrading).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "exerciseGrading",
          itemId: "testlang-ex-002"
        })
      ])
    );
  });

  it("scores exercise grading against curated adversarial answer probes", () => {
    const state = buildTestWorkspaceState();
    const exercise = state.exercises.find((item) => item.id === "testlang-ex-002");
    if (!exercise) throw new Error("Missing testlang-ex-002");

    exercise.adversarialAnswers = [
      { answer: "saku talo-ki", reason: "Matches an expected answer and must be detected as an unsafe probe." }
    ];

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.exerciseGrading).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "exerciseGrading",
          itemId: "testlang-ex-002",
          message: "Curated adversarial answer was accepted by the grader."
        })
      ])
    );
  });

  it("accepts valid segment answers for suffix chains", () => {
    const state = buildTestWorkspaceState();

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.generationPolicy).toBe(1);
    expect(result.failures.filter((failure: any) => failure.itemId === "testlang-ex-003")).toHaveLength(0);
  });

  it("rejects segment answers that collapse required morpheme boundaries", () => {
    const state = buildTestWorkspaceState();
    const exercise = state.exercises.find((item) => item.id === "testlang-ex-003");
    if (!exercise) throw new Error("Missing testlang-ex-003");

    exercise.expectedAnswers = [...exercise.expectedAnswers, "nemi-lo -ki"];

    const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

    expect(result.scores.generationPolicy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "generationPolicy",
          itemId: "testlang-ex-003"
        })
      ])
    );
  });

  it.each(["nemi -ki -lo", "nemi -lo -ki -ki"])(
    "rejects malformed segment answer %s even when it is listed as expected",
    (malformedAnswer) => {
      const state = buildTestWorkspaceState();
      const exercise = state.exercises.find((item) => item.id === "testlang-ex-003");
      if (!exercise) throw new Error("Missing testlang-ex-003");

      exercise.expectedAnswers = [...exercise.expectedAnswers, malformedAnswer];

      const result = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, draftNotesForLanguage(TEST_LANGUAGE_ID, state));

      expect(result.scores.generationPolicy).toBeLessThan(1);
      expect(result.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "generationPolicy",
            itemId: "testlang-ex-003"
          })
        ])
      );
    }
  );
});
