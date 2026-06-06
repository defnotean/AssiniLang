import { describe, expect, it } from "vitest";
import { syntheticLanguageFixtures } from "./fixtures";
import { validateSyntheticLanguageFixtures } from "./validation";

function cloneFixtures(): typeof syntheticLanguageFixtures {
  return structuredClone(syntheticLanguageFixtures);
}

describe("synthetic fixture validation module", () => {
  it("returns actionable diagnostics for cross-reference and phonology drift", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.corpus[1].id = "avn-c001";
    avenik.grammarRules[0].evidencePassageIds = ["missing-passage"];
    avenik.vocabulary[0].form = "zalo";
    avenik.paradigms[0].rows[0].morphemes = ["talo", "-missing"];
    avenik.exercisesAnswerKey[0].adversarialAnswers = [
      { answer: avenik.exercisesAnswerKey[0].expectedAnswers[0], reason: "Duplicates the expected answer." }
    ];
    (avenik as unknown as {
      dialectVariants: Array<{ id: string; name: string; regionLabel: string; phonologyNotes: string[]; lexicalNotes: string[]; grammarNotes: string[]; examplePhrases: unknown[] }>;
    }).dialectVariants = [
      {
        id: "duplicate-dialect",
        name: "Duplicate",
        regionLabel: "test region",
        phonologyNotes: ["short vowels remain stable"],
        lexicalNotes: ["test lexical note"],
        grammarNotes: ["test grammar note"],
        examplePhrases: [{ standard: "mira", variant: "mira", translation: "river" }]
      },
      {
        id: "duplicate-dialect",
        name: "",
        regionLabel: "",
        phonologyNotes: [],
        lexicalNotes: [],
        grammarNotes: [],
        examplePhrases: []
      }
    ];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik has duplicate corpus id avn-c001",
        "avenik grammar rule avn-rule-verb-chain references missing evidence passage missing-passage",
        "avenik vocabulary form zalo uses z outside phonology inventory",
        "avenik paradigm avn-paradigm-verb-chain row present first singular references unknown morpheme -missing",
        "avenik exercise avn-ex001 adversarial answer duplicates an expected answer: mira talo-mi-na",
        "avenik has duplicate dialect variant id duplicate-dialect",
        "avenik dialect variant duplicate-dialect is missing a name",
        "avenik dialect variant duplicate-dialect is missing a region label",
        "avenik dialect variant duplicate-dialect needs at least one phonology note",
        "avenik dialect variant duplicate-dialect needs at least one lexical note",
        "avenik dialect variant duplicate-dialect needs at least one grammar note",
        "avenik dialect variant duplicate-dialect needs at least one example phrase"
      ])
    );
  });

  it("rejects duplicate adversarial exercise probes after normalization", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.exercisesAnswerKey[0].adversarialAnswers = [
      { answer: "talo-mi-na mira", reason: "Keeps the words but moves the verb first." },
      { answer: "  talo-mi-na   mira  ", reason: "Repeats the same probe with extra whitespace." }
    ];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik exercise avn-ex001 adversarial answer is duplicated: talo-mi-na mira"
      ])
    );
  });

  it("rejects duplicate expected exercise answers after normalization", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.exercisesAnswerKey[1].expectedAnswers = ["nemi|-lo|-ki", "  nemi|-lo|-ki  "];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik exercise avn-ex002 expected answer is duplicated: nemi|-lo|-ki"
      ])
    );
  });

  it("rejects duplicate exercise authoring allow-list entries", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.exercisesAnswerKey[0].allowedVocabulary = ["mira", "talo", "mira", "-mi", "-na"];
    avenik.exercisesAnswerKey[0].allowedRuleIds = ["avn-rule-verb-chain", "avn-rule-verb-chain"];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik exercise avn-ex001 allowed vocabulary is duplicated: mira",
        "avenik exercise avn-ex001 allowed rule is duplicated: avn-rule-verb-chain"
      ])
    );
  });

  it("rejects duplicate corpus topic tags and morpheme features after normalization", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.corpus[0].topicTags = ["motion", "present", "motion"];
    avenik.corpus[0].morphologicalSegmentation[0].features = ["noun", "noun"];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik corpus passage avn-c001 topic tag is duplicated: motion",
        "avenik corpus passage avn-c001 morpheme mira feature is duplicated: noun"
      ])
    );
  });

  it("rejects corpus passages whose segmentation omits target tokens", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.corpus[4].morphologicalSegmentation = avenik.corpus[4].morphologicalSegmentation.filter(
      (morpheme) => morpheme.surface !== "mira"
    );

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik corpus passage avn-c005 segmentation does not cover target token: mira"
      ])
    );
  });

  it("rejects synthetic language fixtures that fall below the richness floor", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.phonology.consonants = avenik.phonology.consonants.slice(0, 5);
    avenik.phonology.vowels = avenik.phonology.vowels.slice(0, 2);
    avenik.phonology.phonotactics = avenik.phonology.phonotactics.slice(0, 1);
    avenik.phonology.syllableTemplate = "";
    avenik.phonology.stress = "";
    avenik.vocabulary = avenik.vocabulary.slice(0, 19);
    avenik.corpus = avenik.corpus.slice(0, 9);
    avenik.grammarRules = avenik.grammarRules.slice(0, 4);
    avenik.notesAnswerKey = avenik.notesAnswerKey.slice(0, 4);
    avenik.exercisesAnswerKey = avenik.exercisesAnswerKey.filter((exercise) => exercise.type === "translate_to_target");
    avenik.paradigms = avenik.paradigms.slice(0, 1);
    avenik.paradigms[0].rows = avenik.paradigms[0].rows.slice(0, 2);
    avenik.dialectVariants = avenik.dialectVariants.slice(0, 1);

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik phonology needs at least 6 consonants (found 5)",
        "avenik phonology needs at least 3 vowels (found 2)",
        "avenik phonology needs at least 2 phonotactic notes (found 1)",
        "avenik phonology is missing a syllable template",
        "avenik phonology is missing a stress rule",
        "avenik needs at least 20 vocabulary items (found 19)",
        "avenik needs at least 10 corpus passages (found 9)",
        "avenik needs at least 5 grammar rules (found 4)",
        "avenik needs at least 5 note answer keys (found 4)",
        "avenik needs at least 5 exercise answer keys (found 3)",
        "avenik needs at least 2 exercise types (found 1)",
        "avenik needs at least 2 paradigm tables (found 1)",
        "avenik paradigm avn-paradigm-verb-chain needs at least 3 rows (found 2)",
        "avenik needs at least 2 dialect variants (found 1)"
      ])
    );
  });
});
