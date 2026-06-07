import { describe, expect, it } from "vitest";
import { syntheticLanguageFixtures } from "./fixtures";
import { SYNTHETIC_FIXTURE_MINIMUMS, validateSyntheticLanguageFixtures } from "./validation";

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
      semanticDomains: Array<{
        id: string;
        label: string;
        description: string;
        coreVocabularyIds: string[];
        evidencePassageIds: string[];
        usageNotes: string[];
      }>;
    }).semanticDomains = [
      {
        id: "duplicate-domain",
        label: "",
        description: "",
        coreVocabularyIds: ["missing-vocab"],
        evidencePassageIds: ["missing-domain-passage"],
        usageNotes: []
      },
      {
        id: "duplicate-domain",
        label: "Repair domain",
        description: "Groups repair vocabulary for validation.",
        coreVocabularyIds: ["avn-v-001", "avn-v-001"],
        evidencePassageIds: ["avn-c001", "avn-c001"],
        usageNotes: [""]
      }
    ];
    (avenik as unknown as {
      dialectVariants: Array<{
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
        examplePhrases: unknown[];
      }>;
    }).dialectVariants = [
      {
        id: "duplicate-dialect",
        name: "Duplicate",
        regionLabel: "test region",
        phonologyNotes: ["short vowels remain stable"],
        lexicalNotes: ["test lexical note"],
        grammarNotes: ["test grammar note"],
        history: {
          summary: "",
          events: []
        },
        examplePhrases: [{ standard: "mira", variant: "mira", translation: "river" }]
      },
      {
        id: "duplicate-dialect",
        name: "",
        regionLabel: "",
        phonologyNotes: [],
        lexicalNotes: [],
        grammarNotes: [],
        history: {
          summary: "Repair history",
          events: [
            {
              period: "",
              description: "",
              evidencePassageIds: ["missing-history-passage"]
            }
          ]
        },
        examplePhrases: []
      }
    ];
    (avenik as unknown as {
      discourseExamples: Array<{
        id: string;
        functionLabel: string;
        context: string;
        target: string;
        translation: string;
        notes: string[];
      }>;
    }).discourseExamples = [
      {
        id: "duplicate-discourse",
        functionLabel: "",
        context: "",
        target: "zalo",
        translation: "",
        notes: []
      },
      {
        id: "duplicate-discourse",
        functionLabel: "repair",
        context: "review desk",
        target: "mira",
        translation: "river",
        notes: [""]
      }
    ];
    (avenik as unknown as {
      teachingSequences: Array<{
        id: string;
        title: string;
        objective: string;
        level: string;
        ruleIds: string[];
        corpusPassageIds: string[];
        exerciseIds: string[];
        steps: Array<{ label: string; prompt: string }>;
      }>;
    }).teachingSequences = [
      {
        id: "duplicate-sequence",
        title: "",
        objective: "",
        level: "advanced",
        ruleIds: ["missing-rule"],
        corpusPassageIds: ["missing-passage"],
        exerciseIds: ["missing-exercise"],
        steps: []
      },
      {
        id: "duplicate-sequence",
        title: "Repair drill",
        objective: "Practice a repair sequence.",
        level: "practice",
        ruleIds: ["avn-rule-verb-chain"],
        corpusPassageIds: ["avn-c001"],
        exerciseIds: ["avn-ex001"],
        steps: [{ label: "", prompt: "" }]
      }
    ];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik has duplicate corpus id avn-c001",
        "avenik grammar rule avn-rule-verb-chain references missing evidence passage missing-passage",
        "avenik vocabulary form zalo uses z outside phonology inventory",
        "avenik paradigm avn-paradigm-verb-chain row present first singular references unknown morpheme -missing",
        "avenik exercise avn-ex001 adversarial answer duplicates an expected answer: mira talo-mi-na",
        "avenik has duplicate semantic domain id duplicate-domain",
        "avenik semantic domain duplicate-domain is missing a label",
        "avenik semantic domain duplicate-domain is missing a description",
        "avenik semantic domain duplicate-domain needs at least 3 vocabulary items (found 1)",
        "avenik semantic domain duplicate-domain references missing vocabulary id missing-vocab",
        "avenik semantic domain duplicate-domain references missing corpus passage missing-domain-passage",
        "avenik semantic domain duplicate-domain needs at least one usage note",
        "avenik semantic domain duplicate-domain vocabulary id is duplicated: avn-v-001",
        "avenik semantic domain duplicate-domain evidence passage is duplicated: avn-c001",
        "avenik semantic domain duplicate-domain has a blank usage note",
        "avenik has duplicate dialect variant id duplicate-dialect",
        "avenik dialect variant duplicate-dialect is missing a name",
        "avenik dialect variant duplicate-dialect is missing a region label",
        "avenik dialect variant duplicate-dialect needs at least one phonology note",
        "avenik dialect variant duplicate-dialect needs at least one lexical note",
        "avenik dialect variant duplicate-dialect needs at least one grammar note",
        "avenik dialect variant duplicate-dialect is missing a history summary",
        "avenik dialect variant duplicate-dialect needs at least 2 history events (found 0)",
        "avenik dialect variant duplicate-dialect needs at least 2 history events (found 1)",
        "avenik dialect variant duplicate-dialect history event 1 is missing a period",
        "avenik dialect variant duplicate-dialect history event 1 is missing a description",
        "avenik dialect variant duplicate-dialect history event 1 references missing corpus passage missing-history-passage",
        "avenik dialect variant duplicate-dialect needs at least one example phrase",
        "avenik has duplicate discourse example id duplicate-discourse",
        "avenik discourse example duplicate-discourse is missing a function label",
        "avenik discourse example duplicate-discourse is missing a context",
        "avenik discourse example duplicate-discourse target uses z outside phonology inventory",
        "avenik discourse example duplicate-discourse is missing a translation",
        "avenik discourse example duplicate-discourse needs at least one note",
        "avenik discourse example duplicate-discourse has a blank note",
        "avenik has duplicate teaching sequence id duplicate-sequence",
        "avenik teaching sequence duplicate-sequence is missing a title",
        "avenik teaching sequence duplicate-sequence is missing an objective",
        "avenik teaching sequence duplicate-sequence has invalid level advanced",
        "avenik teaching sequence duplicate-sequence references missing rule missing-rule",
        "avenik teaching sequence duplicate-sequence references missing corpus passage missing-passage",
        "avenik teaching sequence duplicate-sequence references missing exercise missing-exercise",
        "avenik teaching sequence duplicate-sequence needs at least one step",
        "avenik teaching sequence duplicate-sequence step 1 is missing a label",
        "avenik teaching sequence duplicate-sequence step 1 is missing a prompt"
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

  it("rejects grammar rules without note and exercise coverage", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.notesAnswerKey = avenik.notesAnswerKey.filter((note) => note.id !== "avn-rule-demo-agent-marking-note");
    for (const exercise of avenik.exercisesAnswerKey) {
      exercise.allowedRuleIds = exercise.allowedRuleIds.filter((ruleId) => ruleId !== "avn-rule-demo-agent-marking");
    }

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik grammar rule avn-rule-demo-agent-marking is missing note answer-key coverage",
        "avenik grammar rule avn-rule-demo-agent-marking is missing exercise coverage"
      ])
    );
  });

  it("rejects duplicate vocabulary ids, forms, and tags", () => {
    const brokenFixtures = cloneFixtures();
    const avenik = brokenFixtures[0];
    if (!avenik) throw new Error("Missing Avenik fixture");

    avenik.vocabulary.push({
      ...avenik.vocabulary[0],
      form: "  talo  ",
      tags: ["motion", "verb", "motion"]
    });

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        "avenik has duplicate vocabulary id avn-v-001",
        "avenik vocabulary form is duplicated: talo",
        "avenik vocabulary item avn-v-001 tag is duplicated: motion"
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

    avenik.phonology.consonants = avenik.phonology.consonants.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.consonants - 1);
    avenik.phonology.vowels = avenik.phonology.vowels.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.vowels - 1);
    avenik.phonology.phonotactics = avenik.phonology.phonotactics.slice(
      0,
      SYNTHETIC_FIXTURE_MINIMUMS.phonotacticNotes - 1
    );
    avenik.phonology.syllableTemplate = "";
    avenik.phonology.stress = "";
    avenik.vocabulary = avenik.vocabulary.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.vocabularyItems - 1);
    const existingSemanticDomains = (avenik as unknown as {
      semanticDomains?: Array<{
        id: string;
        label: string;
        description: string;
        coreVocabularyIds: string[];
        evidencePassageIds: string[];
        usageNotes: string[];
      }>;
    }).semanticDomains ?? [
      {
        id: "avn-domain-motion",
        label: "Motion and route teaching",
        description: "Placeholder domain for richness-floor diagnostics.",
        coreVocabularyIds: ["avn-v-001", "avn-v-002", "avn-v-003"],
        evidencePassageIds: ["avn-c001"],
        usageNotes: ["Placeholder note."]
      }
    ];
    (avenik as unknown as { semanticDomains: typeof existingSemanticDomains }).semanticDomains = [
      {
        ...existingSemanticDomains[0],
        coreVocabularyIds: ["avn-v-001", "avn-v-002"]
      }
    ];
    avenik.corpus = avenik.corpus.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.corpusPassages - 1);
    avenik.grammarRules = avenik.grammarRules.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.grammarRules - 1);
    avenik.notesAnswerKey = avenik.notesAnswerKey.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys - 1);
    avenik.exercisesAnswerKey = avenik.exercisesAnswerKey.filter((exercise) => exercise.type === "translate_to_target");
    avenik.paradigms = avenik.paradigms.slice(0, 1);
    avenik.paradigms[0].rows = avenik.paradigms[0].rows.slice(0, 2);
    avenik.dialectVariants = avenik.dialectVariants.slice(0, 1);
    (avenik.dialectVariants[0] as unknown as { history: { summary: string; events: unknown[] } }).history = {
      summary: "River-side history placeholder",
      events: []
    };
    avenik.discourseExamples = avenik.discourseExamples.slice(0, SYNTHETIC_FIXTURE_MINIMUMS.discourseExamples - 1);
    (avenik as unknown as { teachingSequences: unknown[] }).teachingSequences = [];

    expect(validateSyntheticLanguageFixtures(brokenFixtures)).toEqual(
      expect.arrayContaining([
        `avenik phonology needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.consonants} consonants (found ${SYNTHETIC_FIXTURE_MINIMUMS.consonants - 1})`,
        `avenik phonology needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.vowels} vowels (found ${SYNTHETIC_FIXTURE_MINIMUMS.vowels - 1})`,
        `avenik phonology needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.phonotacticNotes} phonotactic notes (found ${SYNTHETIC_FIXTURE_MINIMUMS.phonotacticNotes - 1})`,
        "avenik phonology is missing a syllable template",
        "avenik phonology is missing a stress rule",
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.vocabularyItems} vocabulary items (found ${SYNTHETIC_FIXTURE_MINIMUMS.vocabularyItems - 1})`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.semanticDomains} semantic domains (found 1)`,
        `avenik semantic domain avn-domain-motion needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.semanticDomainVocabulary} vocabulary items (found 2)`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.corpusPassages} corpus passages (found ${SYNTHETIC_FIXTURE_MINIMUMS.corpusPassages - 1})`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.grammarRules} grammar rules (found ${SYNTHETIC_FIXTURE_MINIMUMS.grammarRules - 1})`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys} note answer keys (found ${SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys - 1})`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.exerciseAnswerKeys} exercise answer keys (found 4)`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.exerciseTypes} exercise types (found 1)`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.paradigms} paradigm tables (found 1)`,
        `avenik paradigm avn-paradigm-verb-chain needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.paradigmRows} rows (found 2)`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.dialectVariants} dialect variants (found 1)`,
        `avenik dialect variant avn-dialect-river needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.dialectHistoryEvents} history events (found 0)`,
        `avenik needs at least ${SYNTHETIC_FIXTURE_MINIMUMS.discourseExamples} discourse examples (found ${SYNTHETIC_FIXTURE_MINIMUMS.discourseExamples - 1})`,
        "avenik needs at least 2 teaching sequences (found 0)"
      ])
    );
  });
});
