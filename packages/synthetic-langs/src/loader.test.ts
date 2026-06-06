import { describe, expect, it } from "vitest";
import { parseAppState } from "@assini/db";
import { buildSeedState, syntheticLanguageFixtures, validateSyntheticLanguageFixtures } from "./loader";

function cloneFixtures(): typeof syntheticLanguageFixtures {
  return structuredClone(syntheticLanguageFixtures);
}

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
    expect(state.corpus.length).toBeGreaterThanOrEqual(40);
    expect(state.corpus.every((passage) => passage.consentStatus.use === "synthetic-testing-only")).toBe(true);
  });

  it("provides a richer grammar and exercise baseline for every synthetic language", () => {
    for (const fixture of syntheticLanguageFixtures) {
      expect(fixture.corpus, `${fixture.language.id} corpus passages`).toHaveLength(10);
      expect(fixture.grammarRules, `${fixture.language.id} grammar rules`).toHaveLength(5);
      expect(fixture.notesAnswerKey, `${fixture.language.id} note answer keys`).toHaveLength(5);
      expect(fixture.exercisesAnswerKey, `${fixture.language.id} exercise answer keys`).toHaveLength(5);

      const coveredExerciseTypes = new Set(fixture.exercisesAnswerKey.map((exercise) => exercise.type));
      expect(coveredExerciseTypes.size, `${fixture.language.id} exercise type variety`).toBeGreaterThanOrEqual(2);
      for (const exercise of fixture.exercisesAnswerKey) {
        expect(exercise.adversarialAnswers, `${exercise.id} adversarial answers`).toHaveLength(2);
        for (const adversarial of exercise.adversarialAnswers) {
          expect(adversarial.answer, `${exercise.id} adversarial answer`).toBeTruthy();
          expect(adversarial.reason, `${exercise.id} adversarial reason`).toBeTruthy();
          expect(exercise.expectedAnswers).not.toContain(adversarial.answer);
        }
      }
    }
  });

  it("seeds default review policies for every synthetic language", () => {
    const state = buildSeedState();

    expect(state.reviewPolicies).toHaveLength(state.languages.length);
    for (const language of state.languages) {
      expect(state.reviewPolicies).toContainEqual({
        id: `review-policy-${language.id}`,
        languageId: language.id,
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true,
        updatedAt: "2026-06-06T00:00:00.000Z",
        updatedBy: "system-seed"
      });
    }
  });

  it("provides structured phonology and paradigm metadata for every synthetic language", () => {
    for (const fixture of syntheticLanguageFixtures) {
      expect(fixture.phonology.consonants.length, `${fixture.language.id} consonant inventory`).toBeGreaterThanOrEqual(6);
      expect(fixture.phonology.vowels.length, `${fixture.language.id} vowel inventory`).toBeGreaterThanOrEqual(3);
      expect(fixture.phonology.phonotactics.length, `${fixture.language.id} phonotactics`).toBeGreaterThanOrEqual(2);
      expect(fixture.phonology.syllableTemplate, `${fixture.language.id} syllable template`).toBeTruthy();
      expect(fixture.phonology.stress, `${fixture.language.id} stress rule`).toBeTruthy();
      expect(fixture.paradigms, `${fixture.language.id} paradigms`).toHaveLength(2);

      for (const paradigm of fixture.paradigms) {
        expect(paradigm.rows.length, `${fixture.language.id} ${paradigm.id} rows`).toBeGreaterThanOrEqual(3);
        for (const row of paradigm.rows) {
          expect(row.label).toBeTruthy();
          expect(row.form).toBeTruthy();
          expect(row.gloss).toBeTruthy();
          expect(row.morphemes.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("provides public dialect variant metadata for every synthetic language", () => {
    for (const fixture of syntheticLanguageFixtures) {
      const dialectVariants = (fixture as unknown as {
        dialectVariants?: Array<{
          id: string;
          name: string;
          regionLabel: string;
          phonologyNotes: string[];
          lexicalNotes: string[];
          grammarNotes: string[];
          examplePhrases: Array<{ standard: string; variant: string; translation: string }>;
        }>;
      }).dialectVariants;

      expect(dialectVariants, `${fixture.language.id} dialect variants`).toHaveLength(2);
      for (const dialect of dialectVariants ?? []) {
        expect(dialect.id, `${fixture.language.id} dialect id`).toBeTruthy();
        expect(dialect.name, `${fixture.language.id} dialect name`).toBeTruthy();
        expect(dialect.regionLabel, `${fixture.language.id} dialect region`).toBeTruthy();
        expect(dialect.phonologyNotes.length, `${fixture.language.id} ${dialect.id} phonology notes`).toBeGreaterThan(0);
        expect(dialect.lexicalNotes.length, `${fixture.language.id} ${dialect.id} lexical notes`).toBeGreaterThan(0);
        expect(dialect.grammarNotes.length, `${fixture.language.id} ${dialect.id} grammar notes`).toBeGreaterThan(0);
        expect(dialect.examplePhrases.length, `${fixture.language.id} ${dialect.id} examples`).toBeGreaterThan(0);
      }
    }
  });

  it("seeds corpus answer keys from the existing fixture corpus", () => {
    const state = buildSeedState();
    const answerKeys = (state as unknown as {
      corpusAnswerKeys?: Array<{
        passageId: string;
        languageId: string;
        textTarget: string;
        textTranslation: string;
      }>;
    }).corpusAnswerKeys;
    const passage = state.corpus.find((item) => item.id === "avn-c001");
    if (!passage) throw new Error("Missing avn-c001");

    const answerKey = answerKeys?.find((item) => item.passageId === passage.id);

    expect(answerKeys).toHaveLength(state.corpus.length);
    expect(answerKey).toMatchObject({
      passageId: "avn-c001",
      languageId: "avenik",
      textTarget: "mira talo-mi-na",
      textTranslation: "I walk by the river."
    });

    passage.textTranslation = "Mutable corpus edit.";

    expect(answerKey?.textTranslation).toBe("I walk by the river.");
  });

  it.each([1, 2, 3] as const)("migrates legacy v%s corpus data into corpus answer keys", (schemaVersion) => {
    const seededState = buildSeedState();
    const legacyState = { ...seededState, schemaVersion } as Record<string, unknown>;
    delete legacyState.corpusAnswerKeys;

    if (schemaVersion === 1) {
      delete legacyState.noteAnswerKeys;
      delete legacyState.exerciseSubmissions;
    }

    if (schemaVersion === 2) {
      delete legacyState.exerciseSubmissions;
    }

    const loaded = parseAppState(legacyState) as typeof seededState & {
      corpusAnswerKeys?: Array<{
        passageId: string;
        textTarget: string;
        textTranslation: string;
      }>;
    };

    expect(loaded.schemaVersion).toBe(7);
    expect(loaded.auditEvents).toEqual([]);
    expect(loaded.reviewPolicies).toEqual([]);
    expect(loaded.reviewApprovals).toEqual([]);
    expect(loaded.reviewDispositions).toEqual([]);
    expect(loaded.corpusAnswerKeys).toHaveLength(seededState.corpus.length);
    expect(loaded.corpusAnswerKeys?.find((item) => item.passageId === "ket-c002")).toMatchObject({
      textTarget: "ka-se-lom-ra",
      textTranslation: "They told the story yesterday."
    });
  });

  it("connects notes and exercises to existing languages", () => {
    const state = buildSeedState();
    const languageIds = new Set(state.languages.map((language) => language.id));
    expect(state.notes).toHaveLength(20);
    expect(state.exercises).toHaveLength(20);
    expect(state.notes.every((note) => note.status === "draft")).toBe(true);
    expect(state.notes.every((note) => languageIds.has(note.languageId))).toBe(true);
    expect(state.exercises.every((exercise) => languageIds.has(exercise.languageId))).toBe(true);
    expect(syntheticLanguageFixtures).toHaveLength(4);

    for (const language of state.languages) {
      expect(state.exercises.filter((exercise) => exercise.languageId === language.id)).toHaveLength(5);
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

  it("validates fixture cross references before seeding", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.grammarRules[0].evidencePassageIds = ["avn-c999"];
    avenik.exercisesAnswerKey[0].allowedRuleIds = ["avn-rule-missing"];
    avenik.exercisesAnswerKey[0].allowedVocabulary = ["mystery-form"];
    avenik.exercisesAnswerKey[0].expectedAnswers = ["mystery-form"];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik grammar rule avn-rule-verb-chain references missing evidence passage avn-c999",
        "avenik exercise avn-ex001 references missing rule avn-rule-missing",
        "avenik exercise avn-ex001 allows unknown vocabulary form mystery-form",
        "avenik translate-to-target exercise avn-ex001 expected answer is not present in corpus: mystery-form"
      ])
    );
  });

  it("validates note evidence counts and examples against cited corpus passages", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.notesAnswerKey[0].evidenceCount = 99;
    avenik.notesAnswerKey[0].examples[0] = {
      passageId: "avn-c001",
      target: "wrong target text",
      translation: "Wrong translation."
    };

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik note avn-rule-verb-chain-note evidenceCount 99 does not match evidencePassageIds length 3",
        "avenik note avn-rule-verb-chain-note example avn-c001 target does not match cited corpus textTarget",
        "avenik note avn-rule-verb-chain-note example avn-c001 translation does not match cited corpus textTranslation"
      ])
    );
  });

  it("validates corpus morphemes against the fixture vocabulary inventory", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.corpus[0].morphologicalSegmentation[0] = {
      surface: "rogue-form",
      lemma: "rogue-lemma",
      gloss: "ungrounded",
      features: ["noun"]
    };

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik corpus passage avn-c001 has ungrounded morpheme rogue-form/rogue-lemma"
      ])
    );
  });

  it("validates paradigm morphemes against the fixture vocabulary inventory", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.paradigms[0].rows[0].morphemes = ["talo", "-missing"];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik paradigm avn-paradigm-verb-chain row present first singular references unknown morpheme -missing"
      ])
    );
  });

  it("validates vocabulary and public forms against each language phonology inventory", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.vocabulary[0].form = "zalo";
    avenik.corpus[0].textTarget = "mira zalo-mi-na";
    avenik.paradigms[0].rows[0].form = "talo-zi-na";

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik vocabulary form zalo uses z outside phonology inventory",
        "avenik corpus passage avn-c001 textTarget uses z outside phonology inventory",
        "avenik paradigm avn-paradigm-verb-chain row present first singular form uses z outside phonology inventory"
      ])
    );
  });

  it("fails seed construction with actionable fixture validation errors", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.corpus[1].id = "avn-c001";
    avenik.notesAnswerKey[0].evidencePassageIds = ["avn-c999"];

    expect(() => buildSeedState(brokenFixtures)).toThrow("Synthetic fixture validation failed:");
    try {
      buildSeedState(brokenFixtures);
      throw new Error("Expected broken fixtures to fail validation");
    } catch (error) {
      const message = String((error as Error).message);
      expect(message.split("\n")).toEqual(
        expect.arrayContaining([
          "avenik has duplicate corpus id avn-c001",
          "avenik note avn-rule-verb-chain-note references missing evidence passage avn-c999"
        ])
      );
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
