import { describe, expect, it } from "vitest";
import { parseAppState } from "@assini/db";
import {
  buildSeedState,
  buildSyntheticFixtureQualityActuals,
  SYNTHETIC_FIXTURE_MINIMUMS,
  summarizeSyntheticFixtureQuality,
  syntheticLanguageFixtures,
  validateSyntheticLanguageFixtures
} from "./loader";

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
    expect(state.corpus.length).toBeGreaterThanOrEqual(
      SYNTHETIC_FIXTURE_MINIMUMS.corpusPassages * syntheticLanguageFixtures.length
    );
    expect(state.corpus.every((passage) => passage.consentStatus.use === "synthetic-testing-only")).toBe(true);
  });

  it("provides a richer grammar and exercise baseline for every synthetic language", () => {
    expect(SYNTHETIC_FIXTURE_MINIMUMS).toMatchObject({
      vocabularyItems: 24,
      corpusPassages: 12,
      grammarRules: 6,
      noteAnswerKeys: 6,
      exerciseAnswerKeys: 6
    });

    for (const fixture of syntheticLanguageFixtures) {
      expect(fixture.vocabulary.length, `${fixture.language.id} vocabulary items`).toBeGreaterThanOrEqual(
        SYNTHETIC_FIXTURE_MINIMUMS.vocabularyItems
      );
      expect(fixture.corpus, `${fixture.language.id} corpus passages`).toHaveLength(
        SYNTHETIC_FIXTURE_MINIMUMS.corpusPassages
      );
      expect(fixture.grammarRules, `${fixture.language.id} grammar rules`).toHaveLength(
        SYNTHETIC_FIXTURE_MINIMUMS.grammarRules
      );
      expect(fixture.notesAnswerKey, `${fixture.language.id} note answer keys`).toHaveLength(
        SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys
      );
      expect(fixture.exercisesAnswerKey.length, `${fixture.language.id} exercise answer keys`).toBeGreaterThanOrEqual(
        SYNTHETIC_FIXTURE_MINIMUMS.exerciseAnswerKeys
      );

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

  it("summarizes fixture quality from shared minimums in a stable order", () => {
    const avenik = syntheticLanguageFixtures.find((fixture) => fixture.language.id === "avenik");
    const actuals = buildSyntheticFixtureQualityActuals(avenik);

    expect(actuals).toMatchObject({
      consonants: 9,
      vowels: 5,
      phonotacticNotes: 3,
      vocabularyItems: 24,
      semanticDomains: 3,
      semanticDomainVocabulary: 3,
      corpusPassages: 12,
      grammarRules: 6,
      noteAnswerKeys: 6,
      exerciseAnswerKeys: 6,
      exerciseTypes: 3,
      paradigms: 2,
      paradigmRows: 3,
      dialectVariants: 2,
      dialectHistoryEvents: 2,
      discourseExamples: 3,
      teachingSequences: 2
    });

    const summary = summarizeSyntheticFixtureQuality(actuals);

    expect(summary).toMatchObject({
      passed: true,
      totalChecks: 17,
      passedChecks: 17,
      failedChecks: 0
    });
    expect(summary.checks.map((check) => check.id)).toEqual([
      "consonants",
      "vowels",
      "phonotacticNotes",
      "vocabularyItems",
      "semanticDomains",
      "semanticDomainVocabulary",
      "corpusPassages",
      "grammarRules",
      "noteAnswerKeys",
      "exerciseAnswerKeys",
      "exerciseTypes",
      "paradigms",
      "paradigmRows",
      "dialectVariants",
      "dialectHistoryEvents",
      "discourseExamples",
      "teachingSequences"
    ]);
    expect(summary.checks).toContainEqual({
      id: "exerciseTypes",
      label: "Exercise types",
      actual: 3,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.exerciseTypes,
      passed: true
    });
    expect(summary.checks).toContainEqual({
      id: "semanticDomains",
      label: "Semantic domains",
      actual: 3,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.semanticDomains,
      passed: true
    });
    expect(summary.checks).toContainEqual({
      id: "semanticDomainVocabulary",
      label: "Semantic domain vocabulary",
      actual: 3,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.semanticDomainVocabulary,
      passed: true
    });
    expect(summary.checks).toContainEqual({
      id: "dialectHistoryEvents",
      label: "Dialect history events",
      actual: 2,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.dialectHistoryEvents,
      passed: true
    });
    expect(summary.checks).toContainEqual({
      id: "discourseExamples",
      label: "Discourse examples",
      actual: 3,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.discourseExamples,
      passed: true
    });
    expect(summary.checks).toContainEqual({
      id: "teachingSequences",
      label: "Teaching sequences",
      actual: 2,
      minimum: 2,
      passed: true
    });
  });

  it("supports app-state actual overrides when reporting fixture quality", () => {
    const avenik = syntheticLanguageFixtures.find((fixture) => fixture.language.id === "avenik");
    const actuals = {
      ...buildSyntheticFixtureQualityActuals(avenik),
      noteAnswerKeys: 2,
      exerciseAnswerKeys: 1
    };

    const summary = summarizeSyntheticFixtureQuality(actuals);

    expect(summary).toMatchObject({
      passed: false,
      totalChecks: 17,
      passedChecks: 15,
      failedChecks: 2
    });
    expect(summary.checks).toContainEqual({
      id: "noteAnswerKeys",
      label: "Public notes",
      actual: 2,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys,
      passed: false
    });
    expect(summary.checks).toContainEqual({
      id: "exerciseAnswerKeys",
      label: "Learner exercises",
      actual: 1,
      minimum: SYNTHETIC_FIXTURE_MINIMUMS.exerciseAnswerKeys,
      passed: false
    });
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

  it("seeds local prototype users referenced by review policies", () => {
    const state = buildSeedState();
    const usersById = new Map(state.users.map((user) => [user.id, user]));

    expect(state.users.map((user) => user.id).sort()).toEqual([
      "admin-1",
      "elder-1",
      "lead-1",
      "learner-1",
      "programmer-1",
      "reviewer-1"
    ]);
    expect(usersById.get("reviewer-1")?.role).toBe("reviewer");
    expect(usersById.get("elder-1")?.role).toBe("elder");
    expect(state.reviewPolicies.flatMap((policy) => policy.assignedReviewerIds).every((userId) => usersById.has(userId))).toBe(true);
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
          history: {
            summary: string;
            events: Array<{ period: string; description: string; evidencePassageIds: string[] }>;
          };
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
        expect(dialect.history.summary, `${fixture.language.id} ${dialect.id} history summary`).toBeTruthy();
        expect(dialect.history.events.length, `${fixture.language.id} ${dialect.id} history events`).toBeGreaterThanOrEqual(
          SYNTHETIC_FIXTURE_MINIMUMS.dialectHistoryEvents
        );
        expect(dialect.examplePhrases.length, `${fixture.language.id} ${dialect.id} examples`).toBeGreaterThan(0);
      }
    }
  });

  it("provides dialect history timelines that cite real corpus evidence", () => {
    for (const fixture of syntheticLanguageFixtures) {
      const corpusIds = new Set(fixture.corpus.map((passage) => passage.id));

      for (const dialect of fixture.dialectVariants) {
        expect(dialect.history.summary, `${fixture.language.id} ${dialect.id} history summary`).toBeTruthy();
        expect(dialect.history.events.length, `${fixture.language.id} ${dialect.id} events`).toBeGreaterThanOrEqual(2);
        for (const event of dialect.history.events) {
          expect(event.period, `${fixture.language.id} ${dialect.id} event period`).toBeTruthy();
          expect(event.description, `${fixture.language.id} ${dialect.id} event description`).toBeTruthy();
          expect(event.evidencePassageIds.length, `${fixture.language.id} ${dialect.id} event evidence`).toBeGreaterThan(0);
          expect(event.evidencePassageIds.every((passageId) => corpusIds.has(passageId))).toBe(true);
        }
      }
    }
  });

  it("provides semantic domains that anchor vocabulary to corpus evidence", () => {
    for (const fixture of syntheticLanguageFixtures) {
      const vocabularyIds = new Set(fixture.vocabulary.map((item) => item.id));
      const corpusIds = new Set(fixture.corpus.map((passage) => passage.id));

      expect(fixture.semanticDomains, `${fixture.language.id} semantic domains`).toHaveLength(
        SYNTHETIC_FIXTURE_MINIMUMS.semanticDomains
      );
      for (const domain of fixture.semanticDomains) {
        expect(domain.id, `${fixture.language.id} semantic domain id`).toBeTruthy();
        expect(domain.label, `${fixture.language.id} ${domain.id} label`).toBeTruthy();
        expect(domain.description, `${fixture.language.id} ${domain.id} description`).toBeTruthy();
        expect(domain.coreVocabularyIds.length, `${fixture.language.id} ${domain.id} vocabulary`).toBeGreaterThanOrEqual(
          SYNTHETIC_FIXTURE_MINIMUMS.semanticDomainVocabulary
        );
        expect(domain.evidencePassageIds.length, `${fixture.language.id} ${domain.id} evidence`).toBeGreaterThan(0);
        expect(domain.usageNotes.length, `${fixture.language.id} ${domain.id} usage notes`).toBeGreaterThan(0);
        expect(domain.coreVocabularyIds.every((vocabularyId) => vocabularyIds.has(vocabularyId))).toBe(true);
        expect(domain.evidencePassageIds.every((passageId) => corpusIds.has(passageId))).toBe(true);
      }
    }
  });

  it("provides discourse examples for every synthetic language", () => {
    for (const fixture of syntheticLanguageFixtures) {
      const discourseExamples = (fixture as unknown as {
        discourseExamples?: Array<{
          id: string;
          functionLabel: string;
          context: string;
          target: string;
          translation: string;
          notes: string[];
        }>;
      }).discourseExamples;

      expect(discourseExamples, `${fixture.language.id} discourse examples`).toHaveLength(
        SYNTHETIC_FIXTURE_MINIMUMS.discourseExamples
      );
      for (const example of discourseExamples ?? []) {
        expect(example.id, `${fixture.language.id} discourse example id`).toBeTruthy();
        expect(example.functionLabel, `${fixture.language.id} ${example.id} function`).toBeTruthy();
        expect(example.context, `${fixture.language.id} ${example.id} context`).toBeTruthy();
        expect(example.target, `${fixture.language.id} ${example.id} target`).toBeTruthy();
        expect(example.translation, `${fixture.language.id} ${example.id} translation`).toBeTruthy();
        expect(example.notes.length, `${fixture.language.id} ${example.id} notes`).toBeGreaterThan(0);
      }
    }
  });

  it("provides teaching sequences that reference real fixture materials", () => {
    for (const fixture of syntheticLanguageFixtures) {
      const teachingSequences = (fixture as unknown as {
        teachingSequences?: Array<{
          id: string;
          title: string;
          objective: string;
          level: "intro" | "practice" | "review";
          ruleIds: string[];
          corpusPassageIds: string[];
          exerciseIds: string[];
          steps: Array<{ label: string; prompt: string }>;
        }>;
      }).teachingSequences;
      const ruleIds = new Set(fixture.grammarRules.map((rule) => rule.id));
      const corpusIds = new Set(fixture.corpus.map((passage) => passage.id));
      const exerciseIds = new Set(fixture.exercisesAnswerKey.map((exercise) => exercise.id));

      expect(teachingSequences, `${fixture.language.id} teaching sequences`).toHaveLength(2);
      for (const sequence of teachingSequences ?? []) {
        expect(sequence.id, `${fixture.language.id} teaching sequence id`).toBeTruthy();
        expect(sequence.title, `${fixture.language.id} ${sequence.id} title`).toBeTruthy();
        expect(sequence.objective, `${fixture.language.id} ${sequence.id} objective`).toBeTruthy();
        expect(["intro", "practice", "review"]).toContain(sequence.level);
        expect(sequence.ruleIds.length, `${fixture.language.id} ${sequence.id} rules`).toBeGreaterThan(0);
        expect(sequence.corpusPassageIds.length, `${fixture.language.id} ${sequence.id} corpus`).toBeGreaterThan(0);
        expect(sequence.exerciseIds.length, `${fixture.language.id} ${sequence.id} exercises`).toBeGreaterThan(0);
        expect(sequence.steps.length, `${fixture.language.id} ${sequence.id} steps`).toBeGreaterThanOrEqual(2);
        expect(sequence.ruleIds.every((ruleId) => ruleIds.has(ruleId))).toBe(true);
        expect(sequence.corpusPassageIds.every((passageId) => corpusIds.has(passageId))).toBe(true);
        expect(sequence.exerciseIds.every((exerciseId) => exerciseIds.has(exerciseId))).toBe(true);
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
    expect(state.notes).toHaveLength(SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys * syntheticLanguageFixtures.length);
    expect(state.exercises.length).toBeGreaterThanOrEqual(
      SYNTHETIC_FIXTURE_MINIMUMS.exerciseAnswerKeys * syntheticLanguageFixtures.length
    );
    expect(state.notes.every((note) => note.status === "draft")).toBe(true);
    expect(state.notes.every((note) => languageIds.has(note.languageId))).toBe(true);
    expect(state.exercises.every((exercise) => languageIds.has(exercise.languageId))).toBe(true);
    expect(syntheticLanguageFixtures).toHaveLength(4);

    for (const language of state.languages) {
      expect(state.exercises.filter((exercise) => exercise.languageId === language.id).length).toBeGreaterThanOrEqual(
        SYNTHETIC_FIXTURE_MINIMUMS.exerciseAnswerKeys
      );
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
    ).toEqual(["3pl.past", "3pl.past", "3pl.past"]);
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
