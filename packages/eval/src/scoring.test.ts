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

  it("scores corpus translations against answer-key text", () => {
    const state = buildSeedState();
    const passage = state.corpus.find((item) => item.id === "avn-c001");
    if (!passage) throw new Error("Missing avn-c001");

    passage.textTranslation = "A fluent but wrong translation.";

    const result = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));

    expect(result.scores.translationAccuracy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "translationAccuracy",
          itemId: "avn-c001"
        })
      ])
    );
  });

  it("scores corpus segmentations against answer-key morphemes", () => {
    const state = buildSeedState();
    const passage = state.corpus.find((item) => item.id === "avn-c002");
    if (!passage) throw new Error("Missing avn-c002");

    passage.morphologicalSegmentation = [
      { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
      { surface: "nemi-lo", lemma: "nemi", gloss: "teach.past", features: ["verb"] },
      { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
    ];

    const result = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));

    expect(result.scores.segmentationAccuracy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "segmentationAccuracy",
          itemId: "avn-c002"
        })
      ])
    );
  });

  it("scores drafted notes against immutable answer keys instead of mutable reviewed notes", () => {
    const state = buildSeedState();
    const reviewedNote = state.notes.find((note) => note.id === "avn-rule-verb-chain-note");
    if (!reviewedNote) throw new Error("Missing reviewed note");

    reviewedNote.explanation = "Reviewed note text that should not become the gold answer.";

    const result = scoreLanguageEvaluation(
      "avenik",
      state,
      state.notes.filter((note) => note.languageId === "avenik")
    );

    expect(result.scores.noteAccuracy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "noteAccuracy",
          itemId: "avn-rule-verb-chain-note"
        })
      ])
    );
  });

  it("drafts baseline notes from immutable answer keys instead of reviewed notes", () => {
    const state = buildSeedState();
    const reviewedNote = state.notes.find((note) => note.id === "avn-rule-verb-chain-note");
    if (!reviewedNote) throw new Error("Missing reviewed note");

    const originalExplanation = reviewedNote.explanation;
    reviewedNote.explanation = "Reviewed wording from the mutable queue.";

    const drafted = draftNotesForLanguage("avenik", state);
    const draftedNote = drafted.find((note) => note.topic === reviewedNote.topic);

    expect(draftedNote?.explanation).toBe(originalExplanation);
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

  it("scores exercise grading against curated adversarial answer probes", () => {
    const state = buildSeedState();
    const exercise = state.exercises.find((item) => item.id === "avn-ex001");
    if (!exercise) throw new Error("Missing avn-ex001");

    exercise.adversarialAnswers = [
      { answer: "mira talo-mi-na", reason: "Matches an expected answer and must be detected as an unsafe probe." }
    ];

    const result = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));

    expect(result.scores.exerciseGrading).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "exerciseGrading",
          itemId: "avn-ex001",
          message: "Curated adversarial answer was accepted by the grader."
        })
      ])
    );
  });

  it("rejects segment answers that collapse required morpheme boundaries", () => {
    const state = buildSeedState();
    const exercise = state.exercises.find((item) => item.id === "avn-ex002");
    if (!exercise) throw new Error("Missing avn-ex002");

    exercise.expectedAnswers = [...exercise.expectedAnswers, "nemi-lo -ki"];

    const result = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));

    expect(result.scores.generationPolicy).toBeLessThan(1);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "generationPolicy",
          itemId: "avn-ex002"
        })
      ])
    );
  });

  it("accepts valid segment answers for fused surface forms", () => {
    const state = buildSeedState();

    const result = scoreLanguageEvaluation("velari", state, draftNotesForLanguage("velari", state));

    expect(result.scores.generationPolicy).toBe(1);
    expect(result.failures.filter((failure) => failure.itemId === "vel-ex002")).toHaveLength(0);
  });

  it.each(["nemi -ki -lo", "nemi -lo -ki -ki"])(
    "rejects malformed segment answer %s even when it is listed as expected",
    (malformedAnswer) => {
      const state = buildSeedState();
      const exercise = state.exercises.find((item) => item.id === "avn-ex002");
      if (!exercise) throw new Error("Missing avn-ex002");

      exercise.expectedAnswers = [...exercise.expectedAnswers, malformedAnswer];

      const result = scoreLanguageEvaluation("avenik", state, draftNotesForLanguage("avenik", state));

      expect(result.scores.generationPolicy).toBeLessThan(1);
      expect(result.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "generationPolicy",
            itemId: "avn-ex002"
          })
        ])
      );
    }
  );
});
