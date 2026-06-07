import type { CorpusPassage, Exercise, Language, Note } from "@assini/db";

export type PhonologyProfile = {
  consonants: string[];
  vowels: string[];
  syllableTemplate: string;
  stress: string;
  phonotactics: string[];
};

export type ParadigmTable = {
  id: string;
  title: string;
  description: string;
  rows: Array<{
    label: string;
    form: string;
    gloss: string;
    morphemes: string[];
  }>;
};

export type DialectVariant = {
  id: string;
  name: string;
  regionLabel: string;
  phonologyNotes: string[];
  lexicalNotes: string[];
  grammarNotes: string[];
  history: {
    summary: string;
    events: Array<{
      period: string;
      description: string;
      evidencePassageIds: string[];
    }>;
  };
  examplePhrases: Array<{
    standard: string;
    variant: string;
    translation: string;
  }>;
};

export type DiscourseExample = {
  id: string;
  functionLabel: string;
  context: string;
  target: string;
  translation: string;
  notes: string[];
};

export type TeachingSequenceLevel = "intro" | "practice" | "review";

export type TeachingSequence = {
  id: string;
  title: string;
  objective: string;
  level: TeachingSequenceLevel;
  ruleIds: string[];
  corpusPassageIds: string[];
  exerciseIds: string[];
  steps: Array<{
    label: string;
    prompt: string;
  }>;
};

export type SyntheticLanguageFixture = {
  language: Language;
  phonology: PhonologyProfile;
  paradigms: ParadigmTable[];
  dialectVariants: DialectVariant[];
  discourseExamples: DiscourseExample[];
  teachingSequences: TeachingSequence[];
  vocabulary: Array<{ id: string; form: string; gloss: string; partOfSpeech: string; tags: string[] }>;
  grammarRules: Array<{ id: string; topic: string; explanation: string; evidencePassageIds: string[]; confidence: "low" | "medium" | "high" }>;
  corpus: CorpusPassage[];
  notesAnswerKey: Note[];
  exercisesAnswerKey: Exercise[];
};

const consent = {
  use: "synthetic-testing-only" as const,
  restrictions: ["invented-demo-language", "not-for-cultural-or-provenance-claims"]
};

const sourceMetadata = {
  author: "AssiniLang invented fixture generator",
  year: 2026,
  license: "Synthetic demo fixtures for local workflow validation only",
  consentRecord: "synthetic-demo-fixture-consent"
};

export const syntheticLanguageFixtures: SyntheticLanguageFixture[] = [
  {
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Invented agglutinative demo language. Consonants: /p, t, k, s, m, n, l, r, y/. Vowels: /a, e, i, o, u/. Consonants cannot cluster in syllables. Stress is word-initial.",
      orthography: "Lowercase Latin with explicit morphological hyphens separating transparent suffixes.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    phonology: {
      consonants: ["p", "t", "k", "s", "m", "n", "l", "r", "y"],
      vowels: ["a", "e", "i", "o", "u"],
      syllableTemplate: "CV",
      stress: "word-initial",
      phonotactics: [
        "Consonant clusters are disallowed inside native roots.",
        "Suffixes attach with explicit hyphen boundaries in learner-facing orthography.",
        "Noun and verb roots keep open syllables before suffix chains."
      ]
    },
    paradigms: [
      {
        id: "avn-paradigm-verb-chain",
        title: "Finite verb chain",
        description: "Transparent Avenik finite verbs combine root + tense suffix + person suffix.",
        rows: [
          { label: "present first singular", form: "talo-mi-na", gloss: "walk-present-1sg", morphemes: ["talo", "-mi", "-na"] },
          { label: "past third singular", form: "nemi-lo-ki", gloss: "teach-past-3sg", morphemes: ["nemi", "-lo", "-ki"] },
          { label: "present third singular", form: "pila-mi-ki", gloss: "supervise-present-3sg", morphemes: ["pila", "-mi", "-ki"] }
        ]
      },
      {
        id: "avn-paradigm-case-coordination",
        title: "Noun case and coordination",
        description: "Case suffixes attach before the coordination suffix when a noun phrase is linked.",
        rows: [
          { label: "locative frame", form: "lumo-ke", gloss: "practice-mat-locative", morphemes: ["lumo", "-ke"] },
          { label: "accusative object", form: "kiya-ra", gloss: "lamp-token-accusative", morphemes: ["kiya", "-ra"] },
          { label: "coordinated object", form: "saku-ra-ne", gloss: "child-accusative-and", morphemes: ["saku", "-ra", "-ne"] }
        ]
      }
    ],
    dialectVariants: [
      {
        id: "avn-dialect-river",
        name: "River teaching register",
        regionLabel: "river-side workshop register",
        phonologyNotes: [
          "Careful first-person endings may be lengthened with an echo syllable in teaching demonstrations.",
          "Open CV syllables stay intact, and suffix boundaries remain visible."
        ],
        lexicalNotes: [
          "mira remains the preferred public term for river in route and place examples.",
          "kilo is favored for workshop sequence starts rather than broad calendar time."
        ],
        grammarNotes: [
          "Tense still precedes person even when the person ending is expanded for careful speech.",
          "Locative -ke is retained on place nouns in slow instructional examples."
        ],
        history: {
          summary: "River-side Avenik teaching speech grew around slow suffix demonstration and water-route practice stories.",
          events: [
            {
              period: "early workshop",
              description: "Instructors lengthened first-person endings while demonstrating river-route movement clauses.",
              evidencePassageIds: ["avn-c001", "avn-c005"]
            },
            {
              period: "review circle",
              description: "Learners kept the river noun stable while comparing careful and everyday suffix rhythm.",
              evidencePassageIds: ["avn-c004"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "mira talo-mi-na",
            variant: "mira talo-mi-nena",
            translation: "I walk by the river."
          },
          {
            standard: "lumo-ke pila-mi-ki",
            variant: "lumo-ke pila-mi-kiki",
            translation: "They keep the practice mat ready."
          }
        ]
      },
      {
        id: "avn-dialect-courtyard",
        name: "Courtyard practice register",
        regionLabel: "courtyard instruction register",
        phonologyNotes: [
          "Rapid object suffixes may surface with a lighter vowel in classroom-object phrases.",
          "The coordination suffix keeps the nasal onset after case suffixes."
        ],
        lexicalNotes: [
          "kiya is used for lamp tokens in object-handling drills.",
          "pira is preferred for clay-tile sorting demonstrations."
        ],
        grammarNotes: [
          "Object case remains before coordination in linked classroom nouns.",
          "SOV order is maintained even in short command-like practice examples."
        ],
        history: {
          summary: "Courtyard Avenik practice speech developed around object-handling drills and quick repair turns.",
          events: [
            {
              period: "sorting drills",
              description: "Lamp-token and clay-tile activities encouraged lighter object-case vowels in rapid practice.",
              evidencePassageIds: ["avn-c006", "avn-c007"]
            },
            {
              period: "repair rounds",
              description: "Reviewers kept coordination order visible while contrasting classroom objects.",
              evidencePassageIds: ["avn-c012"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "saku-ra-ne nemi-lo-ki",
            variant: "saku-re-ne nemi-lo-ki",
            translation: "They taught the children together."
          },
          {
            standard: "kiya-ra tani-mi-na",
            variant: "kiya-re tani-mi-na",
            translation: "I arrange the lamp token."
          }
        ]
      }
    ],
    discourseExamples: [],
    teachingSequences: [],
    vocabulary: [
      { id: "avn-v-001", form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"] },
      { id: "avn-v-002", form: "nemi", gloss: "teach / explain", partOfSpeech: "verb", tags: ["learning"] },
      { id: "avn-v-003", form: "tani", gloss: "arrange / assemble", partOfSpeech: "verb", tags: ["workshop"] },
      { id: "avn-v-004", form: "nemu", gloss: "say / utter", partOfSpeech: "verb", tags: ["speech"] },
      { id: "avn-v-005", form: "pila", gloss: "supervise / keep ready", partOfSpeech: "verb", tags: ["classroom"] },
      { id: "avn-n-001", form: "mira", gloss: "river", partOfSpeech: "noun", tags: ["place"] },
      { id: "avn-n-002", form: "saku", gloss: "child", partOfSpeech: "noun", tags: ["person"] },
      { id: "avn-n-003", form: "kita", gloss: "instructor / demo leader", partOfSpeech: "noun", tags: ["person", "demo-role"] },
      { id: "avn-n-004", form: "kilo", gloss: "first step / start", partOfSpeech: "noun", tags: ["time"] },
      { id: "avn-n-005", form: "seme", gloss: "blue panel", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "avn-n-006", form: "pira", gloss: "clay tile", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "avn-n-007", form: "kiya", gloss: "lamp token", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "avn-n-008", form: "lumo", gloss: "practice mat", partOfSpeech: "noun", tags: ["classroom-object", "place"] },
      { id: "avn-s-001", form: "-mi", gloss: "present tense", partOfSpeech: "suffix", tags: ["tense"] },
      { id: "avn-s-002", form: "-lo", gloss: "past tense", partOfSpeech: "suffix", tags: ["tense"] },
      { id: "avn-s-003", form: "-na", gloss: "first person singular", partOfSpeech: "suffix", tags: ["person"] },
      { id: "avn-s-004", form: "-ki", gloss: "third person singular", partOfSpeech: "suffix", tags: ["person"] },
      { id: "avn-s-005", form: "-ke", gloss: "locative marker", partOfSpeech: "suffix", tags: ["case"] },
      { id: "avn-s-006", form: "-ra", gloss: "accusative marker", partOfSpeech: "suffix", tags: ["case"] },
      { id: "avn-s-007", form: "-ne", gloss: "coordinating conjunction suffix (and)", partOfSpeech: "suffix", tags: ["conjunction"] }
    ],
    grammarRules: [
      {
        id: "avn-rule-verb-chain",
        topic: "morphology/verb/tense-person-suffix-chain",
        explanation: "Avenik finite verbs are synthesized with root + tense suffix + person suffix. The tense suffix always precedes person.",
        evidencePassageIds: ["avn-c001", "avn-c002", "avn-c003"],
        confidence: "high"
      },
      {
        id: "avn-rule-noun-before-verb",
        topic: "syntax/basic-noun-before-verb",
        explanation: "Primary syntactic word order is Subject-Object-Verb (SOV) or Subject-Adverbial-Verb. Topical/Agent nouns sit initial in simple clauses.",
        evidencePassageIds: ["avn-c001", "avn-c004", "avn-c005"],
        confidence: "medium"
      },
      {
        id: "avn-rule-noun-case-chain",
        topic: "morphology/noun/case-before-coordination",
        explanation: "Avenik noun suffix chains attach case before coordination: -ke marks location, -ra marks an object, and -ne can follow a case suffix to coordinate the noun phrase.",
        evidencePassageIds: ["avn-c006", "avn-c008"],
        confidence: "high"
      },
      {
        id: "avn-rule-demo-agent-marking",
        topic: "morphology/noun/agent-indexed-classroom-roles",
        explanation: "In classroom-demo clauses, the instructor noun kita can carry -ki before a finite verb to mark the recurring third-person demo agent.",
        evidencePassageIds: ["avn-c006", "avn-c007", "avn-c008"],
        confidence: "medium"
      },
      {
        id: "avn-rule-lesson-setting-locative",
        topic: "syntax/location/lesson-setting-locative-frame",
        explanation: "Avenik lesson-setting nouns take locative -ke to frame the clause; the locative phrase may appear before the subject or directly after the recurring demo agent.",
        evidencePassageIds: ["avn-c009", "avn-c010"],
        confidence: "high"
      }
    ],
    corpus: [
      {
        id: "avn-c001",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mira talo-mi-na",
        textTranslation: "I walk by the river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["motion", "present", "first-person"],
        consentStatus: consent
      },
      {
        id: "avn-c002",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "saku nemi-lo-ki",
        textTranslation: "The child taught.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["learning", "past", "third-person"],
        consentStatus: consent
      },
      {
        id: "avn-c003",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "saku talo-mi-ki",
        textTranslation: "The child walks.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["motion", "present", "third-person"],
        consentStatus: consent
      },
      {
        id: "avn-c004",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mira nemi-lo-na",
        textTranslation: "I taught by the river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["learning", "past", "first-person"],
        consentStatus: consent
      },
      {
        id: "avn-c005",
        languageId: "avenik",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "saku mira talo-mi-ki",
        textTranslation: "The child walks by the river.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["motion", "present", "place"],
        consentStatus: consent
      },
      /* Invented classroom demo passages - Agglutinative Avenik */
      {
        id: "avn-c006",
        languageId: "avenik",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kilo-ke kita-ki seme-ra-ne pira-ra-ne tani-lo-ki",
        textTranslation: "At the first step, the instructor arranged the blue panel and clay tile.",
        morphologicalSegmentation: [
          { surface: "kilo-ke", lemma: "kilo", gloss: "first-step.locative", features: ["noun", "case-loc"] },
          { surface: "kita-ki", lemma: "kita", gloss: "instructor.3sgSubject", features: ["noun", "subject"] },
          { surface: "seme-ra-ne", lemma: "seme", gloss: "blue-panel.accusative.and", features: ["noun", "case-acc", "suffix-conjunction"] },
          { surface: "pira-ra-ne", lemma: "pira", gloss: "clay-tile.accusative.and", features: ["noun", "case-acc", "suffix-conjunction"] },
          { surface: "tani-lo-ki", lemma: "tani", gloss: "arrange.past.3sg", features: ["verb-root", "tense-past", "person-3sg"] }
        ],
        topicTags: ["invented-demo", "classroom", "arrangement", "past"],
        consentStatus: consent
      },
      {
        id: "avn-c007",
        languageId: "avenik",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kita-ki nemu-lo-ki kiya-mi-ki-ne kiya-lo-ki",
        textTranslation: "The instructor named the lamp token, and the lamp token was ready for practice.",
        morphologicalSegmentation: [
          { surface: "kita-ki", lemma: "kita", gloss: "instructor.3sgSubject", features: ["noun", "subject"] },
          { surface: "nemu-lo-ki", lemma: "nemu", gloss: "say.past.3sg", features: ["verb-root", "tense-past", "person-3sg"] },
          { surface: "kiya-mi-ki-ne", lemma: "kiya", gloss: "lamp-token.present.3sg.and", features: ["noun", "tense-pres", "person-3sg", "suffix-conjunction"] },
          { surface: "kiya-lo-ki", lemma: "kiya", gloss: "lamp-token.past.3sg", features: ["noun", "tense-past", "person-3sg"] }
        ],
        topicTags: ["invented-demo", "speech", "classroom-object", "past"],
        consentStatus: consent
      },
      {
        id: "avn-c008",
        languageId: "avenik",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kita-ki saku-ra-ne pila-mi-ki",
        textTranslation: "The instructor supervises the learner during the practice round.",
        morphologicalSegmentation: [
          { surface: "kita-ki", lemma: "kita", gloss: "instructor.3sgSubject", features: ["noun", "subject"] },
          { surface: "saku-ra-ne", lemma: "saku", gloss: "child.accusative.and", features: ["noun", "case-acc", "suffix-conjunction"] },
          { surface: "pila-mi-ki", lemma: "pila", gloss: "supervise.present.3sg", features: ["verb-root", "tense-pres", "person-3sg"] }
        ],
        topicTags: ["invented-demo", "classroom", "learning", "present"],
        consentStatus: consent
      },
      {
        id: "avn-c009",
        languageId: "avenik",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "lumo-ke saku nemi-mi-ki",
        textTranslation: "At the practice mat, the child explains.",
        morphologicalSegmentation: [
          { surface: "lumo-ke", lemma: "lumo", gloss: "practice-mat.locative", features: ["noun", "case-loc"] },
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "explain", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["invented-demo", "classroom", "location", "present"],
        consentStatus: consent
      },
      {
        id: "avn-c010",
        languageId: "avenik",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kita-ki lumo-ke kiya-ra pila-lo-ki",
        textTranslation: "The instructor kept the lamp token ready at the practice mat.",
        morphologicalSegmentation: [
          { surface: "kita-ki", lemma: "kita", gloss: "instructor.3sgSubject", features: ["noun", "subject"] },
          { surface: "lumo-ke", lemma: "lumo", gloss: "practice-mat.locative", features: ["noun", "case-loc"] },
          { surface: "kiya-ra", lemma: "kiya", gloss: "lamp-token.accusative", features: ["noun", "case-acc"] },
          { surface: "pila", lemma: "pila", gloss: "keep-ready", features: ["verb-root"] },
          { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["invented-demo", "classroom", "location", "past"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  },
  {
    language: {
      id: "solari",
      name: "Solari",
      typology: "isolating",
      description: "Synthetic isolating language with particles and stable word order.",
      orthography: "Whitespace-delimited Latin syllables.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    phonology: {
      consonants: ["p", "t", "k", "s", "m", "n", "l", "r"],
      vowels: ["a", "e", "i", "o", "u"],
      syllableTemplate: "CV or CVV",
      stress: "phrase-final pitch prominence",
      phonotactics: [
        "Words are short open syllables with no affixal fusion.",
        "Particles remain independent phonological words.",
        "Vowel sequences are allowed only across word boundaries."
      ]
    },
    paradigms: [
      {
        id: "sol-paradigm-tense-aspect",
        title: "Tense and aspect particles",
        description: "Solari keeps tense and aspect as independent particles before the verb.",
        rows: [
          { label: "present simple", form: "mi len nua", gloss: "I listen song", morphemes: ["mi", "len", "nua"] },
          { label: "past simple", form: "mi pa len nua", gloss: "I past listen song", morphemes: ["mi", "pa", "len", "nua"] },
          { label: "durative present", form: "mi so len nua", gloss: "I ongoing listen song", morphemes: ["mi", "so", "len", "nua"] }
        ]
      },
      {
        id: "sol-paradigm-location-coordination",
        title: "Final location and object coordination",
        description: "Core SVO clauses can be extended by final location phrases or linked objects.",
        rows: [
          { label: "final location", form: "ta ko luma na sao", gloss: "they make board at circle", morphemes: ["ta", "ko", "luma", "na", "sao"] },
          { label: "linked objects", form: "ta ko luma e rei", gloss: "they make board and card", morphemes: ["ta", "ko", "luma", "e", "rei"] },
          { label: "past durative", form: "mi pa so len nua", gloss: "I past ongoing listen song", morphemes: ["mi", "pa", "so", "len", "nua"] }
        ]
      }
    ],
    dialectVariants: [
      {
        id: "sol-dialect-circle",
        name: "Circle lesson register",
        regionLabel: "central circle classroom register",
        phonologyNotes: [
          "Phrase-final pitch prominence is strongest on location nouns.",
          "Particles keep full vowels in slow group recitation."
        ],
        lexicalNotes: [
          "sao is preferred for arranged learning circles.",
          "nua is used for song-like listening material rather than general sound."
        ],
        grammarNotes: [
          "Location phrases remain final after linked objects.",
          "The durative particle so stays before the verb, even in careful speech."
        ],
        history: {
          summary: "Circle Solari speech formed around group recitation where final locations anchored shared classroom attention.",
          events: [
            {
              period: "circle recitation",
              description: "Learners kept particles fully voiced while repeating listening clauses in the central circle.",
              evidencePassageIds: ["sol-c001", "sol-c005"]
            },
            {
              period: "location review",
              description: "Final locative phrases became the stable cue for where a lesson action happened.",
              evidencePassageIds: ["sol-c003", "sol-c011"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "mi so len nua",
            variant: "mi so len nua sao",
            translation: "I am listening to the song in the circle."
          },
          {
            standard: "ta ko luma na sao",
            variant: "ta ko luma e rei na sao",
            translation: "They make the board and card at the circle."
          }
        ]
      },
      {
        id: "sol-dialect-card",
        name: "Card sorting register",
        regionLabel: "edge-table sorting register",
        phonologyNotes: [
          "Short particles may be spoken with flatter pitch before object lists.",
          "Final prominence falls on the last listed object when no location follows."
        ],
        lexicalNotes: [
          "rei is the preferred public term for reusable practice cards.",
          "luma is reserved for boards or panels, not loose cards."
        ],
        grammarNotes: [
          "The linker e can join repeated object nouns without changing verb position.",
          "Past particle pa remains before the durative particle so when both occur."
        ],
        history: {
          summary: "Card-sorting Solari speech emerged from edge-table comparison tasks with compact object lists.",
          events: [
            {
              period: "card sorting",
              description: "Repeated card and board prompts made object coordination the main contrastive pattern.",
              evidencePassageIds: ["sol-c004", "sol-c012"]
            },
            {
              period: "prompt tracing",
              description: "Past and durative particles stayed separate while learners traced memory-line prompts.",
              evidencePassageIds: ["sol-c011"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "ta ko luma e rei",
            variant: "ta ko rei e rei",
            translation: "They make the cards together."
          },
          {
            standard: "mi pa so len nua",
            variant: "mi pa so len rei",
            translation: "I was listening to the card prompt."
          }
        ]
      }
    ],
    discourseExamples: [],
    teachingSequences: [],
    vocabulary: [
      { id: "sol-p-001", form: "mi", gloss: "I", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-p-002", form: "ta", gloss: "they", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-v-001", form: "len", gloss: "listen", partOfSpeech: "verb", tags: ["learning"] },
      { id: "sol-v-002", form: "ko", gloss: "make / compose", partOfSpeech: "verb", tags: ["work"] },
      { id: "sol-n-001", form: "nua", gloss: "song / chant", partOfSpeech: "noun", tags: ["object"] },
      { id: "sol-n-002", form: "luma", gloss: "teaching board", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "sol-n-003", form: "rei", gloss: "pattern card", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "sol-n-004", form: "sao", gloss: "practice circle", partOfSpeech: "noun", tags: ["place"] },
      { id: "sol-n-005", form: "toma", gloss: "marker bowl", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "sol-n-006", form: "palo", gloss: "practice path", partOfSpeech: "noun", tags: ["place", "learning"] },
      { id: "sol-n-007", form: "kare", gloss: "memory bead", partOfSpeech: "noun", tags: ["classroom-object", "memory"] },
      { id: "sol-n-008", form: "nelo", gloss: "quiet prompt", partOfSpeech: "noun", tags: ["learning", "prompt"] },
      { id: "sol-p-003", form: "lo", gloss: "you", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-p-004", form: "ra", gloss: "we", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-v-003", form: "rame", gloss: "trace / follow", partOfSpeech: "verb", tags: ["learning", "motion"] },
      { id: "sol-v-004", form: "seni", gloss: "remember / hold in mind", partOfSpeech: "verb", tags: ["memory"] },
      { id: "sol-c-001", form: "e", gloss: "and / linked object marker", partOfSpeech: "particle", tags: ["coordination"] },
      { id: "sol-l-001", form: "na", gloss: "locative phrase marker", partOfSpeech: "particle", tags: ["location"] },
      { id: "sol-t-001", form: "pa", gloss: "past marker", partOfSpeech: "particle", tags: ["tense"] },
      { id: "sol-a-001", form: "so", gloss: "ongoing / repeated action marker", partOfSpeech: "particle", tags: ["aspect"] }
    ],
    grammarRules: [
      {
        id: "sol-rule-past-particle",
        topic: "syntax/particle/past-before-verb",
        explanation: "Solari marks past time with the particle pa immediately before the verb.",
        evidencePassageIds: ["sol-c001", "sol-c003"],
        confidence: "high"
      },
      {
        id: "sol-rule-svo",
        topic: "syntax/basic-svo",
        explanation: "Solari basic clauses follow subject + optional tense particle + verb + object.",
        evidencePassageIds: ["sol-c001", "sol-c002", "sol-c004", "sol-c005"],
        confidence: "high"
      },
      {
        id: "sol-rule-location-final",
        topic: "syntax/location/final-na-phrase",
        explanation: "Solari places locative phrases after the core clause with na introducing the location noun.",
        evidencePassageIds: ["sol-c006", "sol-c007"],
        confidence: "high"
      },
      {
        id: "sol-rule-object-coordination",
        topic: "syntax/coordination/e-between-objects",
        explanation: "The particle e links two object nouns after the verb without changing the tense particle or subject position.",
        evidencePassageIds: ["sol-c007", "sol-c008"],
        confidence: "medium"
      },
      {
        id: "sol-rule-durative-particle",
        topic: "syntax/particle/durative-before-verb",
        explanation: "Solari marks ongoing or repeated action with the aspect particle so before the verb, after the subject and after any tense particle.",
        evidencePassageIds: ["sol-c009", "sol-c010"],
        confidence: "high"
      }
    ],
    corpus: [
      {
        id: "sol-c001",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mi pa len nua",
        textTranslation: "I listened to the song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["past", "learning"],
        consentStatus: consent
      },
      {
        id: "sol-c002",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ta ko nua",
        textTranslation: "They make a song.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["present", "work"],
        consentStatus: consent
      },
      {
        id: "sol-c003",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ta pa ko nua",
        textTranslation: "They made a song.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["past", "work"],
        consentStatus: consent
      },
      {
        id: "sol-c004",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mi len nua",
        textTranslation: "I listen to the song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["present", "learning"],
        consentStatus: consent
      },
      {
        id: "sol-c005",
        languageId: "solari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mi pa ko nua",
        textTranslation: "I made a song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["past", "work"],
        consentStatus: consent
      },
      {
        id: "sol-c006",
        languageId: "solari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "mi ko luma na sao",
        textTranslation: "I make the teaching board at the practice circle.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "luma", lemma: "luma", gloss: "teaching-board", features: ["noun"] },
          { surface: "na", lemma: "na", gloss: "locative", features: ["location-particle"] },
          { surface: "sao", lemma: "sao", gloss: "practice-circle", features: ["noun", "place"] }
        ],
        topicTags: ["invented-demo", "classroom", "location", "present"],
        consentStatus: consent
      },
      {
        id: "sol-c007",
        languageId: "solari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "ta pa len nua e rei na sao",
        textTranslation: "They listened to the song and pattern card at the practice circle.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] },
          { surface: "e", lemma: "e", gloss: "and", features: ["coordination-particle"] },
          { surface: "rei", lemma: "rei", gloss: "pattern-card", features: ["noun"] },
          { surface: "na", lemma: "na", gloss: "locative", features: ["location-particle"] },
          { surface: "sao", lemma: "sao", gloss: "practice-circle", features: ["noun", "place"] }
        ],
        topicTags: ["invented-demo", "past", "coordination", "location"],
        consentStatus: consent
      },
      {
        id: "sol-c008",
        languageId: "solari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "mi pa ko rei e luma",
        textTranslation: "I made the pattern card and teaching board.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "rei", lemma: "rei", gloss: "pattern-card", features: ["noun"] },
          { surface: "e", lemma: "e", gloss: "and", features: ["coordination-particle"] },
          { surface: "luma", lemma: "luma", gloss: "teaching-board", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "past", "coordination", "work"],
        consentStatus: consent
      },
      {
        id: "sol-c009",
        languageId: "solari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "mi so len nua na sao",
        textTranslation: "I keep listening to the song at the practice circle.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "so", lemma: "so", gloss: "durative", features: ["aspect-particle"] },
          { surface: "len", lemma: "len", gloss: "listen", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] },
          { surface: "na", lemma: "na", gloss: "locative", features: ["location-particle"] },
          { surface: "sao", lemma: "sao", gloss: "practice-circle", features: ["noun", "place"] }
        ],
        topicTags: ["invented-demo", "classroom", "aspect", "location"],
        consentStatus: consent
      },
      {
        id: "sol-c010",
        languageId: "solari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "ta pa so ko rei e luma",
        textTranslation: "They kept making the pattern card and teaching board.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense-particle"] },
          { surface: "so", lemma: "so", gloss: "durative", features: ["aspect-particle"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "rei", lemma: "rei", gloss: "pattern-card", features: ["noun"] },
          { surface: "e", lemma: "e", gloss: "and", features: ["coordination-particle"] },
          { surface: "luma", lemma: "luma", gloss: "teaching-board", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "past", "aspect", "coordination"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  },
  {
    language: {
      id: "velari",
      name: "Velari",
      typology: "fusional",
      description: "Synthetic fusional language where endings encode tense and person together.",
      orthography: "Latin roots with fused final syllables.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    phonology: {
      consonants: ["d", "m", "r", "s", "v", "l", "n", "k", "t", "h"],
      vowels: ["a", "e", "i", "o", "u"],
      syllableTemplate: "CV(C) root + fused ending",
      stress: "root-initial before fused ending",
      phonotactics: [
        "Fused endings are written as final syllables without a hyphen in surface text.",
        "Morphological analysis separates roots from endings even when the orthography fuses them.",
        "Object nouns remain full phonological words after the finite verb."
      ]
    },
    paradigms: [
      {
        id: "vel-paradigm-fused-person-tense",
        title: "Fused person-tense endings",
        description: "Velari endings encode person/number and tense as one inseparable suffix.",
        rows: [
          { label: "first singular present", form: "danor", gloss: "eat-1sg.present", morphemes: ["dan", "-or"] },
          { label: "first singular past", form: "miral", gloss: "see-1sg.past", morphemes: ["mir", "-al"] },
          { label: "first singular future", form: "kelin", gloss: "arrange-1sg.future", morphemes: ["kel", "-in"] },
          { label: "third plural present", form: "kelum", gloss: "arrange-3pl.present", morphemes: ["kel", "-um"] },
          { label: "third plural past", form: "daneth", gloss: "eat-3pl.past", morphemes: ["dan", "-eth"] },
          { label: "third plural future", form: "sarun", gloss: "mark-3pl.future", morphemes: ["sar", "-un"] }
        ]
      },
      {
        id: "vel-paradigm-object-order",
        title: "Finite verb before object",
        description: "Objects follow the finite verb regardless of tense or fused agreement.",
        rows: [
          { label: "present verb object", form: "danor loma", gloss: "eat-1sg.present berry", morphemes: ["dan", "-or", "loma"] },
          { label: "future verb object", form: "kelin sora", gloss: "arrange-1sg.future lesson-stone", morphemes: ["kel", "-in", "sora"] },
          { label: "plural future object", form: "sarun navi", gloss: "mark-3pl.future practice-light", morphemes: ["sar", "-un", "navi"] }
        ]
      }
    ],
    dialectVariants: [
      {
        id: "vel-dialect-stone",
        name: "Stone-table register",
        regionLabel: "stone-table lesson register",
        phonologyNotes: [
          "Final fused endings keep full vowel quality in careful citation forms.",
          "Root-initial stress remains audible before longer object phrases."
        ],
        lexicalNotes: [
          "sora is preferred for lesson-stone prompts used in arrangement drills.",
          "navi refers to a practice light or marked demonstration point."
        ],
        grammarNotes: [
          "Fused tense-person endings are not split in surface spelling.",
          "Objects remain after the finite verb in all tense frames."
        ],
        history: {
          summary: "Stone-table Velari speech grew from citation drills that made fused endings audible before object comparison.",
          events: [
            {
              period: "citation table",
              description: "Teachers held fused endings clearly while arranging lesson-stone prompts.",
              evidencePassageIds: ["vel-c003", "vel-c005"]
            },
            {
              period: "comparison practice",
              description: "Stable object-after-verb order was reinforced through practice-light marking tasks.",
              evidencePassageIds: ["vel-c011"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "kelin sora",
            variant: "kelien sora",
            translation: "I will arrange the lesson stone."
          },
          {
            standard: "sarun navi",
            variant: "saruun navi",
            translation: "They will mark the practice light."
          }
        ]
      },
      {
        id: "vel-dialect-lantern",
        name: "Lantern review register",
        regionLabel: "evening review register",
        phonologyNotes: [
          "Past third-plural endings may be held with a softer final consonant in slow review.",
          "Object nouns keep their full syllables after the fused verb."
        ],
        lexicalNotes: [
          "loma is retained for berry-like counters in food examples.",
          "navi is extended to visual markers during review lessons."
        ],
        grammarNotes: [
          "The fused ending still carries both tense and agreement.",
          "Object order does not change when a visual marker is topical."
        ],
        history: {
          summary: "Lantern Velari review speech developed around evening recall lessons with softened past endings.",
          events: [
            {
              period: "evening recall",
              description: "Reviewers softened final past consonants while recounting completed object lessons.",
              evidencePassageIds: ["vel-c001", "vel-c012"]
            },
            {
              period: "visual review",
              description: "Practice-light prompts extended object vocabulary without changing the finite-verb frame.",
              evidencePassageIds: ["vel-c004", "vel-c010"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "daneth loma",
            variant: "danet loma",
            translation: "They ate the berry."
          },
          {
            standard: "miral navi",
            variant: "mirel navi",
            translation: "I saw the practice light."
          }
        ]
      }
    ],
    discourseExamples: [],
    teachingSequences: [],
    vocabulary: [
      { id: "vel-v-001", form: "dan", gloss: "eat", partOfSpeech: "verb-root", tags: ["food"] },
      { id: "vel-v-002", form: "mir", gloss: "see", partOfSpeech: "verb-root", tags: ["perception"] },
      { id: "vel-v-003", form: "kel", gloss: "arrange / shape", partOfSpeech: "verb-root", tags: ["workshop"] },
      { id: "vel-v-004", form: "sar", gloss: "mark / name", partOfSpeech: "verb-root", tags: ["speech"] },
      { id: "vel-n-001", form: "loma", gloss: "berry", partOfSpeech: "noun", tags: ["food"] },
      { id: "vel-n-002", form: "vesa", gloss: "star", partOfSpeech: "noun", tags: ["sky"] },
      { id: "vel-n-003", form: "sora", gloss: "lesson stone", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "vel-n-004", form: "navi", gloss: "practice light", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "vel-n-005", form: "kera", gloss: "practice tray", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "vel-n-006", form: "mavi", gloss: "color shard", partOfSpeech: "noun", tags: ["classroom-object"] },
      { id: "vel-n-007", form: "telo", gloss: "teaching line", partOfSpeech: "noun", tags: ["learning"] },
      { id: "vel-v-005", form: "hal", gloss: "ask / prompt", partOfSpeech: "verb-root", tags: ["speech"] },
      { id: "vel-v-006", form: "rav", gloss: "trace / follow", partOfSpeech: "verb-root", tags: ["learning", "motion"] },
      { id: "vel-e-001", form: "-or", gloss: "1sg present", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-002", form: "-eth", gloss: "3pl past", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-003", form: "-al", gloss: "1sg past", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-004", form: "-um", gloss: "3pl present", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-005", form: "-in", gloss: "1sg future", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-006", form: "-un", gloss: "3pl future", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-007", form: "-en", gloss: "2sg present", partOfSpeech: "ending", tags: ["fusional"] }
    ],
    grammarRules: [
      {
        id: "vel-rule-fused-ending",
        topic: "morphology/verb/fused-person-tense-ending",
        explanation: "Velari verb endings encode person and tense in a single fused ending: -or is first-person present, while -eth is third-person plural past.",
        evidencePassageIds: ["vel-c001", "vel-c002", "vel-c004"],
        confidence: "high"
      },
      {
        id: "vel-rule-object-after-verb",
        topic: "syntax/object-after-finite-verb",
        explanation: "Velari places the object noun after the finite verb in simple clauses.",
        evidencePassageIds: ["vel-c001", "vel-c003"],
        confidence: "medium"
      },
      {
        id: "vel-rule-first-past-ending",
        topic: "morphology/verb/fused-first-person-past",
        explanation: "The ending -al is a fused first-person past marker; it attaches directly to a verb root and does not appear as a separate tense word.",
        evidencePassageIds: ["vel-c006"],
        confidence: "high"
      },
      {
        id: "vel-rule-present-plural-ending",
        topic: "morphology/verb/fused-third-person-plural-present",
        explanation: "The ending -um fuses third-person plural subject agreement with present time, contrasting with the past plural ending -eth.",
        evidencePassageIds: ["vel-c007", "vel-c008"],
        confidence: "high"
      },
      {
        id: "vel-rule-future-fused-endings",
        topic: "morphology/verb/fused-future-endings",
        explanation: "Velari future forms also use fused endings: -in marks first-person future, while -un marks third-person plural future.",
        evidencePassageIds: ["vel-c009", "vel-c010"],
        confidence: "high"
      }
    ],
    corpus: [
      {
        id: "vel-c001",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "danor loma",
        textTranslation: "I eat berries.",
        morphologicalSegmentation: [
          { surface: "dan", lemma: "dan", gloss: "eat", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["person-tense"] },
          { surface: "loma", lemma: "loma", gloss: "berry", features: ["noun"] }
        ],
        topicTags: ["food", "present", "first-person"],
        consentStatus: consent
      },
      {
        id: "vel-c002",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "mireth vesa",
        textTranslation: "They saw the star.",
        morphologicalSegmentation: [
          { surface: "mir", lemma: "mir", gloss: "see", features: ["verb-root"] },
          { surface: "-eth", lemma: "-eth", gloss: "3pl.past", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["sky", "past", "third-person-plural"],
        consentStatus: consent
      },
      {
        id: "vel-c003",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "miror vesa",
        textTranslation: "I see the star.",
        morphologicalSegmentation: [
          { surface: "mir", lemma: "mir", gloss: "see", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["sky", "present", "first-person"],
        consentStatus: consent
      },
      {
        id: "vel-c004",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "daneth loma",
        textTranslation: "They ate berries.",
        morphologicalSegmentation: [
          { surface: "dan", lemma: "dan", gloss: "eat", features: ["verb-root"] },
          { surface: "-eth", lemma: "-eth", gloss: "3pl.past", features: ["person-tense"] },
          { surface: "loma", lemma: "loma", gloss: "berry", features: ["noun"] }
        ],
        topicTags: ["food", "past", "third-person-plural"],
        consentStatus: consent
      },
      {
        id: "vel-c005",
        languageId: "velari",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "danor vesa",
        textTranslation: "I eat under the star.",
        morphologicalSegmentation: [
          { surface: "dan", lemma: "dan", gloss: "eat", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["food", "sky", "present"],
        consentStatus: consent
      },
      {
        id: "vel-c006",
        languageId: "velari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kelal sora",
        textTranslation: "I arranged the lesson stone.",
        morphologicalSegmentation: [
          { surface: "kel", lemma: "kel", gloss: "arrange", features: ["verb-root"] },
          { surface: "-al", lemma: "-al", gloss: "1sg.past", features: ["person-tense"] },
          { surface: "sora", lemma: "sora", gloss: "lesson-stone", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "classroom", "past", "first-person"],
        consentStatus: consent
      },
      {
        id: "vel-c007",
        languageId: "velari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "sarum navi",
        textTranslation: "They mark the practice light.",
        morphologicalSegmentation: [
          { surface: "sar", lemma: "sar", gloss: "mark", features: ["verb-root"] },
          { surface: "-um", lemma: "-um", gloss: "3pl.present", features: ["person-tense"] },
          { surface: "navi", lemma: "navi", gloss: "practice-light", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "classroom", "present", "third-person-plural"],
        consentStatus: consent
      },
      {
        id: "vel-c008",
        languageId: "velari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kelum sora",
        textTranslation: "They arrange the lesson stone.",
        morphologicalSegmentation: [
          { surface: "kel", lemma: "kel", gloss: "arrange", features: ["verb-root"] },
          { surface: "-um", lemma: "-um", gloss: "3pl.present", features: ["person-tense"] },
          { surface: "sora", lemma: "sora", gloss: "lesson-stone", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "classroom", "present", "third-person-plural"],
        consentStatus: consent
      },
      {
        id: "vel-c009",
        languageId: "velari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "mirin vesa",
        textTranslation: "I will see the star.",
        morphologicalSegmentation: [
          { surface: "mir", lemma: "mir", gloss: "see", features: ["verb-root"] },
          { surface: "-in", lemma: "-in", gloss: "1sg.future", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "sky", "future", "first-person"],
        consentStatus: consent
      },
      {
        id: "vel-c010",
        languageId: "velari",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "kelun sora",
        textTranslation: "They will arrange the lesson stone.",
        morphologicalSegmentation: [
          { surface: "kel", lemma: "kel", gloss: "arrange", features: ["verb-root"] },
          { surface: "-un", lemma: "-un", gloss: "3pl.future", features: ["person-tense"] },
          { surface: "sora", lemma: "sora", gloss: "lesson-stone", features: ["noun"] }
        ],
        topicTags: ["invented-demo", "classroom", "future", "third-person-plural"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  },
  {
    language: {
      id: "ketharu",
      name: "Ketharu",
      typology: "polysynthetic-lite",
      description: "Invented polysynthetic-style demo language. Consonants: /p, t, k, s, m, n, w, h/. Vowels: /a, e, o, u/. Suffix slots indicate spatial aspect and past/present narratives.",
      orthography: "Whitespace-less hyphenated slot segments merging subject, object, verb-root, and aspect suffixes.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    phonology: {
      consonants: ["p", "t", "k", "s", "m", "n", "w", "h", "l", "r"],
      vowels: ["a", "e", "i", "o", "u"],
      syllableTemplate: "prefix-root-suffix slot chain",
      stress: "final root before suffix",
      phonotactics: [
        "Hyphenated prefixes remain prosodically light before the verb root.",
        "Object-prefix stacks can contain two adjacent prefixes before a root.",
        "Time and aspect suffixes close the predicate word."
      ]
    },
    paradigms: [
      {
        id: "ket-paradigm-slot-chain",
        title: "Predicate slot chain",
        description: "Ketharu predicate words fill subject, object, root, and time/aspect slots.",
        rows: [
          { label: "first singular fish today", form: "na-mo-wan-tu", gloss: "1sg-fish-carry-today", morphemes: ["na-", "mo-", "wan", "-tu"] },
          { label: "third plural story yesterday", form: "ka-se-lom-ra", gloss: "3pl-story-tell-yesterday", morphemes: ["ka-", "se-", "lom", "-ra"] },
          { label: "third plural display aspect", form: "ka-pi-tani-su", gloss: "3pl-clay-tile-arrange-display", morphemes: ["ka-", "pi-", "tani", "-su"] }
        ]
      },
      {
        id: "ket-paradigm-object-stack",
        title: "Object stacks and linked predicates",
        description: "Object prefixes may stack, and a predicate can carry a chained time transition before another predicate begins.",
        rows: [
          { label: "instructor clay story past", form: "wa-pi-se-tani-ra", gloss: "instructor-clay-story-arrange-past", morphemes: ["wa-", "pi-", "se-", "tani", "-ra"] },
          { label: "group lamp story today", form: "ka-ki-se-ne-tu", gloss: "3pl-lamp-story-explain-today", morphemes: ["ka-", "ki-", "se-", "ne", "-tu"] },
          { label: "linked predicate opening", form: "wa-se-ne-ra-tu", gloss: "instructor-story-explain-past-then", morphemes: ["wa-", "se-", "ne", "-ra", "-tu"] }
        ]
      }
    ],
    dialectVariants: [
      {
        id: "ket-dialect-display",
        name: "Display-table register",
        regionLabel: "display-table teaching register",
        phonologyNotes: [
          "Object-prefix stacks are pronounced evenly before the final stressed root.",
          "The display suffix -su receives a clear final release in table demonstrations."
        ],
        lexicalNotes: [
          "pi- marks clay-tile objects in arrangement examples.",
          "ki- marks lamp-token objects when visual prompts are part of the lesson."
        ],
        grammarNotes: [
          "The final aspect slot may hold -su instead of a time suffix.",
          "Stacked object prefixes preserve their order before the root."
        ],
        history: {
          summary: "Display-table Ketharu speech formed around table demonstrations where object stacks had to remain visible.",
          events: [
            {
              period: "table display",
              description: "Clay-tile tasks favored an emphatic display suffix after stable subject-object-root slots.",
              evidencePassageIds: ["ket-c005", "ket-c011"]
            },
            {
              period: "object-stack practice",
              description: "Instructors contrasted clay and story object prefixes during arrangement drills.",
              evidencePassageIds: ["ket-c003"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "ka-pi-tani-su",
            variant: "ka-pi-tani-susu",
            translation: "They arrange the clay tile at the display table."
          },
          {
            standard: "wa-pi-se-tani-ra",
            variant: "wa-pi-se-tani-su",
            translation: "The instructor arranges the clay story at the display table."
          }
        ]
      },
      {
        id: "ket-dialect-story",
        name: "Story-chain register",
        regionLabel: "narrative teaching register",
        phonologyNotes: [
          "Story object prefixes are held slightly longer before speech roots.",
          "Linked predicate suffixes keep the hyphenated slot rhythm in slow narration."
        ],
        lexicalNotes: [
          "se- is the public story object prefix for narrative teaching sequences.",
          "ne is preferred over lom when the lesson frames explanation rather than announcement."
        ],
        grammarNotes: [
          "A time suffix can carry a chaining sense before the next predicate begins.",
          "The subject prefix remains first even when a narrative object is topical."
        ],
        history: {
          summary: "Story-chain Ketharu speech developed from narrative teaching rounds that linked predicate words across turns.",
          events: [
            {
              period: "story rounds",
              description: "Story-object prefixes were held longer as learners repeated yesterday-story clauses.",
              evidencePassageIds: ["ket-c002", "ket-c012"]
            },
            {
              period: "linked narration",
              description: "Chained time suffixes became the public cue that one predicate leads into another.",
              evidencePassageIds: ["ket-c006"]
            }
          ]
        },
        examplePhrases: [
          {
            standard: "ka-se-lom-ra",
            variant: "ka-se-ne-ra",
            translation: "They told the story yesterday."
          },
          {
            standard: "wa-se-ne-ra-tu",
            variant: "wa-se-ne-ra ka-se-lom-tu",
            translation: "The instructor explained the story, then they tell it today."
          }
        ]
      }
    ],
    discourseExamples: [],
    teachingSequences: [],
    vocabulary: [
      { id: "ket-pr-001", form: "na-", gloss: "I (subject prefix)", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-pr-002", form: "ka-", gloss: "they (subject prefix)", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-pr-003", form: "wa-", gloss: "instructor subject prefix", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-ob-001", form: "mo-", gloss: "fish object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-ob-002", form: "se-", gloss: "story object / narrative", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-ob-003", form: "pi-", gloss: "clay-tile object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-ob-004", form: "ki-", gloss: "lamp-token object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-ob-005", form: "lu-", gloss: "path object", partOfSpeech: "object-prefix", tags: ["object", "place"] },
      { id: "ket-ob-006", form: "ru-", gloss: "signal object", partOfSpeech: "object-prefix", tags: ["object", "signal"] },
      { id: "ket-v-001", form: "wan", gloss: "carry / bear", partOfSpeech: "verb-root", tags: ["motion"] },
      { id: "ket-v-002", form: "lom", gloss: "tell / announce", partOfSpeech: "verb-root", tags: ["speech"] },
      { id: "ket-v-003", form: "tani", gloss: "arrange / assemble", partOfSpeech: "verb-root", tags: ["workshop"] },
      { id: "ket-v-004", form: "ne", gloss: "explain / state", partOfSpeech: "verb-root", tags: ["speech"] },
      { id: "ket-v-005", form: "homa", gloss: "show / display", partOfSpeech: "verb-root", tags: ["teaching"] },
      { id: "ket-v-006", form: "pelo", gloss: "sort / separate", partOfSpeech: "verb-root", tags: ["workshop"] },
      { id: "ket-t-001", form: "-tu", gloss: "today", partOfSpeech: "suffix", tags: ["time"] },
      { id: "ket-t-002", form: "-ra", gloss: "yesterday", partOfSpeech: "suffix", tags: ["time"] },
      { id: "ket-t-003", form: "-su", gloss: "display-table aspect", partOfSpeech: "suffix", tags: ["aspect"] },
      { id: "ket-t-004", form: "-ni", gloss: "near-future teaching sequence", partOfSpeech: "suffix", tags: ["time"] },
      { id: "ket-pr-004", form: "ha-", gloss: "learner subject prefix", partOfSpeech: "prefix", tags: ["subject"] }
    ],
    grammarRules: [
      {
        id: "ket-rule-slot-order",
        topic: "morphology/verb/subject-object-root-time-slots",
        explanation: "Ketharu predicate words follow strict morphological slots: Subject Prefix + Object or Incorporated Noun Prefix + Verb Root + Time/Aspect Suffix.",
        evidencePassageIds: ["ket-c001", "ket-c002", "ket-c003", "ket-c004"],
        confidence: "high"
      },
      {
        id: "ket-rule-verb-as-clause",
        topic: "syntax/polysynthetic-lite/verb-word-clause",
        explanation: "A single, highly complex Ketharu slot-chain operates as a full standalone clause, incorporating nominal indicators within the verb phrase.",
        evidencePassageIds: ["ket-c001", "ket-c003", "ket-c005"],
        confidence: "medium"
      },
      {
        id: "ket-rule-compound-object-stack",
        topic: "morphology/verb/compound-object-prefix-stack",
        explanation: "Ketharu can stack more than one object or incorporated-noun prefix before a verb root when a demo action involves a compound practice object.",
        evidencePassageIds: ["ket-c006", "ket-c007"],
        confidence: "medium"
      },
      {
        id: "ket-rule-linked-predicate-chain",
        topic: "syntax/polysynthetic-lite/linked-predicate-chain",
        explanation: "Two predicate slot chains may be linked in a single teaching sequence, with the first time suffix carrying a chaining sense before the next subject prefix begins.",
        evidencePassageIds: ["ket-c007"],
        confidence: "low"
      },
      {
        id: "ket-rule-display-aspect-suffix",
        topic: "morphology/verb/display-table-aspect-suffix",
        explanation: "The final Ketharu slot can hold the aspect suffix -su to mark that the incorporated action happens at the display table rather than anchoring the clause to today or yesterday.",
        evidencePassageIds: ["ket-c009", "ket-c010"],
        confidence: "medium"
      }
    ],
    corpus: [
      {
        id: "ket-c001",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "na-mo-wan-tu",
        textTranslation: "I carry the fish today.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-tu", lemma: "-tu", gloss: "today", features: ["time"] }
        ],
        topicTags: ["motion", "today", "first-person"],
        consentStatus: consent
      },
      {
        id: "ket-c002",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ka-se-lom-ra",
        textTranslation: "They told the story yesterday.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "se-", lemma: "se-", gloss: "story.object", features: ["object"] },
          { surface: "lom", lemma: "lom", gloss: "tell", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["speech", "yesterday", "third-person"],
        consentStatus: consent
      },
      {
        id: "ket-c003",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ka-mo-wan-tu",
        textTranslation: "They carry the fish today.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-tu", lemma: "-tu", gloss: "today", features: ["time"] }
        ],
        topicTags: ["motion", "today", "third-person"],
        consentStatus: consent
      },
      {
        id: "ket-c004",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "na-se-lom-ra",
        textTranslation: "I told the story yesterday.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "se-", lemma: "se-", gloss: "story.object", features: ["object"] },
          { surface: "lom", lemma: "lom", gloss: "tell", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["speech", "yesterday", "first-person"],
        consentStatus: consent
      },
      {
        id: "ket-c005",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "na-mo-wan-ra",
        textTranslation: "I carried the fish yesterday.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["motion", "yesterday", "first-person"],
        consentStatus: consent
      },
      /* Invented classroom demo passages for Polysynthetic-style Ketharu */
      {
        id: "ket-c006",
        languageId: "ketharu",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "wa-pi-se-tani-ra",
        textTranslation: "The instructor arranged a tile-and-story model for the demo lesson.",
        morphologicalSegmentation: [
          { surface: "wa-", lemma: "wa-", gloss: "3sg.subject instructor", features: ["subject"] },
          { surface: "pi-", lemma: "pi-", gloss: "clay-tile-object", features: ["object"] },
          { surface: "se-", lemma: "se-", gloss: "story-card-object", features: ["object"] },
          { surface: "tani", lemma: "tani", gloss: "arrange", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "past", features: ["time"] }
        ],
        topicTags: ["invented-demo", "classroom", "arrangement", "past"],
        consentStatus: consent
      },
      {
        id: "ket-c007",
        languageId: "ketharu",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "wa-se-ne-ra-tu-wa-ki-tani-ra",
        textTranslation: "The instructor explained, then arranged a practice token for the group.",
        morphologicalSegmentation: [
          { surface: "wa-", lemma: "wa-", gloss: "3sg.subject instructor", features: ["subject"] },
          { surface: "se-", lemma: "se-", gloss: "narrative-object", features: ["object"] },
          { surface: "ne", lemma: "ne", gloss: "explain", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "past", features: ["time"] },
          { surface: "-tu", lemma: "-tu", gloss: "then/today-chain", features: ["time", "aspect"] },
          { surface: "wa-", lemma: "wa-", gloss: "3sg.subject instructor", features: ["subject"] },
          { surface: "ki-", lemma: "ki-", gloss: "lamp-token-object", features: ["object"] },
          { surface: "tani", lemma: "tani", gloss: "arrange", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "past", features: ["time"] }
        ],
        topicTags: ["invented-demo", "speech", "classroom-object", "arrangement"],
        consentStatus: consent
      },
      {
        id: "ket-c008",
        languageId: "ketharu",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "ka-ki-ne-tu",
        textTranslation: "They explain the lamp token today.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "ki-", lemma: "ki-", gloss: "lamp-token-object", features: ["object"] },
          { surface: "ne", lemma: "ne", gloss: "explain", features: ["verb-root"] },
          { surface: "-tu", lemma: "-tu", gloss: "today", features: ["time"] }
        ],
        topicTags: ["invented-demo", "speech", "today", "third-person"],
        consentStatus: consent
      },
      {
        id: "ket-c009",
        languageId: "ketharu",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "wa-ki-ne-su",
        textTranslation: "The instructor explains the lamp token at the display table.",
        morphologicalSegmentation: [
          { surface: "wa-", lemma: "wa-", gloss: "3sg.subject instructor", features: ["subject"] },
          { surface: "ki-", lemma: "ki-", gloss: "lamp-token-object", features: ["object"] },
          { surface: "ne", lemma: "ne", gloss: "explain", features: ["verb-root"] },
          { surface: "-su", lemma: "-su", gloss: "display-table", features: ["aspect"] }
        ],
        topicTags: ["invented-demo", "speech", "classroom-object", "aspect"],
        consentStatus: consent
      },
      {
        id: "ket-c010",
        languageId: "ketharu",
        source: "invented classroom demo corpus",
        sourceMetadata,
        textTarget: "ka-pi-tani-su",
        textTranslation: "They arrange the clay tile at the display table.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "pi-", lemma: "pi-", gloss: "clay-tile-object", features: ["object"] },
          { surface: "tani", lemma: "tani", gloss: "arrange", features: ["verb-root"] },
          { surface: "-su", lemma: "-su", gloss: "display-table", features: ["aspect"] }
        ],
        topicTags: ["invented-demo", "classroom", "arrangement", "aspect"],
        consentStatus: consent
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  }
];

type FixtureRichnessExpansion = {
  vocabulary: SyntheticLanguageFixture["vocabulary"];
  discourseExamples: SyntheticLanguageFixture["discourseExamples"];
  teachingSequences: SyntheticLanguageFixture["teachingSequences"];
  corpus: CorpusPassage[];
  grammarRules: SyntheticLanguageFixture["grammarRules"];
  exercises: Exercise[];
};

const fixtureRichnessExpansion: Record<string, FixtureRichnessExpansion> = {
  avenik: {
    vocabulary: [
      { id: "avn-vocab-yano", form: "yano", gloss: "sample path", partOfSpeech: "noun", tags: ["place", "review"] },
      { id: "avn-vocab-maku", form: "maku", gloss: "memory bead", partOfSpeech: "noun", tags: ["object", "memory"] },
      { id: "avn-vocab-seya", form: "seya", gloss: "answer card", partOfSpeech: "noun", tags: ["classroom", "answer"] },
      { id: "avn-vocab-roki", form: "roki", gloss: "review line", partOfSpeech: "noun", tags: ["review", "sequence"] }
    ],
    discourseExamples: [
      {
        id: "avn-discourse-opening",
        functionLabel: "Opening a teaching turn",
        context: "Used when the instructor starts a careful review sequence.",
        target: "kilo-ke saku-ra nemi-mi-na",
        translation: "At the first step, I teach the child.",
        notes: [
          "The locative frame comes first.",
          "The finite verb keeps tense before person."
        ]
      },
      {
        id: "avn-discourse-repair",
        functionLabel: "Repairing an object label",
        context: "Used after a learner chooses the wrong classroom object.",
        target: "seya-ra maku-ra-ne tani-mi-na",
        translation: "I arrange the answer card and memory bead.",
        notes: [
          "Both objects carry accusative -ra.",
          "The coordination suffix follows the first marked object."
        ]
      },
      {
        id: "avn-discourse-closure",
        functionLabel: "Closing a review step",
        context: "Used when the review leader names the final line.",
        target: "roki-ra nemu-mi-ki",
        translation: "They say the review line.",
        notes: [
          "The reviewed item stays before the speech verb.",
          "Third-person -ki keeps the closure impersonal."
        ]
      }
    ],
    teachingSequences: [
      {
        id: "avn-teach-verb-chain",
        title: "Build a transparent verb chain",
        objective: "Recognize and produce root-tense-person chains in short Avenik clauses.",
        level: "intro",
        ruleIds: ["avn-rule-verb-chain"],
        corpusPassageIds: ["avn-c001", "avn-c002"],
        exerciseIds: ["avn-ex001", "avn-ex002"],
        steps: [
          {
            label: "Observe",
            prompt: "Read mira talo-mi-na and identify the verb chain."
          },
          {
            label: "Practice",
            prompt: "Translate a new first-person present clause."
          }
        ]
      },
      {
        id: "avn-teach-review-object-frame",
        title: "Coordinate reviewed objects",
        objective: "Use accusative -ra and coordination -ne in classroom-object review clauses.",
        level: "practice",
        ruleIds: ["avn-rule-review-object-frame", "avn-rule-demo-agent-marking"],
        corpusPassageIds: ["avn-c011", "avn-c012"],
        exerciseIds: ["avn-ex004", "avn-ex006"],
        steps: [
          {
            label: "Locate",
            prompt: "Find each object noun and mark where -ra appears."
          },
          {
            label: "Repair",
            prompt: "Explain why seya-ne-ra is not the expected review-object order."
          }
        ]
      }
    ],
    corpus: [
      {
        id: "avn-c011",
        languageId: "avenik",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "yano-ke maku-ra nemi-mi-na",
        textTranslation: "I explain the memory bead at the sample path.",
        morphologicalSegmentation: [
          { surface: "yano", lemma: "yano", gloss: "sample-path", features: ["noun", "place"] },
          { surface: "-ke", lemma: "-ke", gloss: "locative", features: ["case-loc"] },
          { surface: "maku", lemma: "maku", gloss: "memory-bead", features: ["noun", "object"] },
          { surface: "-ra", lemma: "-ra", gloss: "accusative", features: ["case-acc"] },
          { surface: "nemi", lemma: "nemi", gloss: "explain", features: ["verb-root"] },
          { surface: "-mi", lemma: "-mi", gloss: "present", features: ["tense"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["invented-demo", "review", "memory", "locative"],
        consentStatus: consent
      },
      {
        id: "avn-c012",
        languageId: "avenik",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "kita-ki seya-ra-ne roki-ra tani-lo-ki",
        textTranslation: "The instructor arranged the answer card and review line.",
        morphologicalSegmentation: [
          { surface: "kita", lemma: "kita", gloss: "instructor", features: ["noun", "agent"] },
          { surface: "-ki", lemma: "-ki", gloss: "demo-agent", features: ["role-marker"] },
          { surface: "seya", lemma: "seya", gloss: "answer-card", features: ["noun", "object"] },
          { surface: "-ra", lemma: "-ra", gloss: "accusative", features: ["case-acc"] },
          { surface: "-ne", lemma: "-ne", gloss: "and", features: ["coordination"] },
          { surface: "roki", lemma: "roki", gloss: "review-line", features: ["noun", "object"] },
          { surface: "-ra", lemma: "-ra", gloss: "accusative", features: ["case-acc"] },
          { surface: "tani", lemma: "tani", gloss: "arrange", features: ["verb-root"] },
          { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
          { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
        ],
        topicTags: ["invented-demo", "coordination", "review", "classroom"],
        consentStatus: consent
      }
    ],
    grammarRules: [
      {
        id: "avn-rule-review-object-frame",
        topic: "syntax/review-object-frame",
        explanation: "Avenik review-work examples place locative setting nouns before the reviewed object, keep object nouns accusative with -ra, and coordinate paired review objects with -ne after the first accusative object.",
        evidencePassageIds: ["avn-c011", "avn-c012", "avn-c008"],
        confidence: "high"
      }
    ],
    exercises: [
      {
        id: "avn-ex006",
        languageId: "avenik",
        type: "translate_to_target",
        prompt: "Translate: The instructor arranged the answer card and review line.",
        allowedVocabulary: ["kita", "-ki", "seya", "-ra", "-ne", "roki", "tani", "-lo"],
        allowedRuleIds: ["avn-rule-review-object-frame", "avn-rule-demo-agent-marking"],
        expectedAnswers: ["kita-ki seya-ra-ne roki-ra tani-lo-ki"],
        adversarialAnswers: [
          { answer: "kita seya-ra-ne roki-ra tani-lo-ki", reason: "Drops the demo-agent suffix from the instructor subject." },
          { answer: "kita-ki seya-ne-ra roki-ra tani-lo-ki", reason: "Places coordination before the accusative case suffix." }
        ],
        gradingExplanation: "Use kita-ki for the instructor, mark both reviewed objects with -ra, attach -ne after the first object, and close with tani-lo-ki."
      }
    ]
  },
  solari: {
    vocabulary: [
      { id: "sol-vocab-lisa", form: "lisa", gloss: "story mat", partOfSpeech: "noun", tags: ["object", "story"] },
      { id: "sol-vocab-moni", form: "moni", gloss: "memory line", partOfSpeech: "noun", tags: ["object", "memory"] },
      { id: "sol-vocab-tero", form: "tero", gloss: "review stone", partOfSpeech: "noun", tags: ["review", "object"] },
      { id: "sol-vocab-pume", form: "pume", gloss: "response shell", partOfSpeech: "noun", tags: ["response", "object"] }
    ],
    discourseExamples: [
      {
        id: "sol-discourse-opening",
        functionLabel: "Opening a shared prompt",
        context: "Used before a group begins listening practice.",
        target: "ra so len nua na sao",
        translation: "We keep listening to the song in the practice circle.",
        notes: [
          "The subject pronoun opens the clause.",
          "The durative particle stays before the verb."
        ]
      },
      {
        id: "sol-discourse-choice",
        functionLabel: "Presenting a choice",
        context: "Used when a reviewer contrasts two classroom objects.",
        target: "lo ko lisa e tero",
        translation: "You make the story mat and review stone.",
        notes: [
          "The linker e joins the object nouns.",
          "No case marking is added to either object."
        ]
      },
      {
        id: "sol-discourse-repair",
        functionLabel: "Repairing a memory cue",
        context: "Used when a learner must trace the prompt again.",
        target: "mi pa rame moni",
        translation: "I traced the memory line.",
        notes: [
          "The past particle pa precedes the verb.",
          "The object remains after the verb without morphology."
        ]
      }
    ],
    teachingSequences: [
      {
        id: "sol-teach-particle-frame",
        title: "Place particles before the verb",
        objective: "Use clause-initial pronouns and pre-verbal particles in basic Solari clauses.",
        level: "intro",
        ruleIds: ["sol-rule-past-particle", "sol-rule-svo"],
        corpusPassageIds: ["sol-c001", "sol-c002"],
        exerciseIds: ["sol-ex001", "sol-ex002"],
        steps: [
          {
            label: "Identify",
            prompt: "Point to the subject, particle, verb, and object in ta pa ko nua."
          },
          {
            label: "Produce",
            prompt: "Build a past-time clause with the same pronoun-particle-verb-object frame."
          }
        ]
      },
      {
        id: "sol-teach-coordination-review",
        title: "Review coordinated objects",
        objective: "Keep Solari tense/aspect particles before the verb while coordinating object nouns after it.",
        level: "practice",
        ruleIds: ["sol-rule-pronoun-particle-frame", "sol-rule-object-coordination"],
        corpusPassageIds: ["sol-c011", "sol-c012"],
        exerciseIds: ["sol-ex004", "sol-ex006"],
        steps: [
          {
            label: "Compare",
            prompt: "Contrast mi pa ko rei e luma with lo pa ko lisa e tero."
          },
          {
            label: "Explain",
            prompt: "Describe why moving pa after ko changes the expected Solari frame."
          }
        ]
      }
    ],
    corpus: [
      {
        id: "sol-c011",
        languageId: "solari",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "ra so rame moni na palo",
        textTranslation: "We keep tracing the memory line on the practice path.",
        morphologicalSegmentation: [
          { surface: "ra", lemma: "ra", gloss: "we", features: ["pronoun", "subject"] },
          { surface: "so", lemma: "so", gloss: "durative", features: ["aspect"] },
          { surface: "rame", lemma: "rame", gloss: "trace", features: ["verb"] },
          { surface: "moni", lemma: "moni", gloss: "memory-line", features: ["noun", "object"] },
          { surface: "na", lemma: "na", gloss: "locative", features: ["location-marker"] },
          { surface: "palo", lemma: "palo", gloss: "practice-path", features: ["noun", "location"] }
        ],
        topicTags: ["invented-demo", "aspect", "memory", "location"],
        consentStatus: consent
      },
      {
        id: "sol-c012",
        languageId: "solari",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "lo pa ko lisa e tero",
        textTranslation: "You made the story mat and review stone.",
        morphologicalSegmentation: [
          { surface: "lo", lemma: "lo", gloss: "you", features: ["pronoun", "subject"] },
          { surface: "pa", lemma: "pa", gloss: "past", features: ["tense"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "lisa", lemma: "lisa", gloss: "story-mat", features: ["noun", "object"] },
          { surface: "e", lemma: "e", gloss: "and", features: ["coordination"] },
          { surface: "tero", lemma: "tero", gloss: "review-stone", features: ["noun", "object"] }
        ],
        topicTags: ["invented-demo", "past", "coordination", "review"],
        consentStatus: consent
      }
    ],
    grammarRules: [
      {
        id: "sol-rule-pronoun-particle-frame",
        topic: "syntax/pronoun-particle-frame",
        explanation: "Solari pronoun subjects stay clause-initial, then tense or aspect particles immediately precede the verb, while object coordination and final locatives remain after the verb phrase.",
        evidencePassageIds: ["sol-c011", "sol-c012", "sol-c010"],
        confidence: "high"
      }
    ],
    exercises: [
      {
        id: "sol-ex006",
        languageId: "solari",
        type: "translate_to_target",
        prompt: "Translate: You made the story mat and review stone.",
        allowedVocabulary: ["lo", "pa", "ko", "lisa", "e", "tero"],
        allowedRuleIds: ["sol-rule-pronoun-particle-frame", "sol-rule-object-coordination"],
        expectedAnswers: ["lo pa ko lisa e tero"],
        adversarialAnswers: [
          { answer: "lo ko pa lisa e tero", reason: "Moves the past particle after the verb." },
          { answer: "pa lo ko lisa e tero", reason: "Places the tense particle before the pronoun subject." }
        ],
        gradingExplanation: "Use lo as the clause-initial subject, pa before ko for past time, and e between the two object nouns."
      }
    ]
  },
  velari: {
    vocabulary: [
      { id: "vel-vocab-mor", form: "mor", gloss: "compare / check", partOfSpeech: "verb-root", tags: ["review", "verb"] },
      { id: "vel-vocab-tesa", form: "tesa", gloss: "teaching cord", partOfSpeech: "noun", tags: ["classroom", "object"] },
      { id: "vel-vocab-rali", form: "rali", gloss: "review mark", partOfSpeech: "noun", tags: ["review", "object"] },
      { id: "vel-vocab-huno", form: "huno", gloss: "future cue", partOfSpeech: "noun", tags: ["time", "prompt"] }
    ],
    discourseExamples: [
      {
        id: "vel-discourse-opening",
        functionLabel: "Opening a comparison",
        context: "Used when the reviewer starts a form comparison.",
        target: "moror tesa",
        translation: "I compare the teaching cord.",
        notes: [
          "The fused ending marks first-person present.",
          "The object follows the completed verb form."
        ]
      },
      {
        id: "vel-discourse-recall",
        functionLabel: "Recalling a completed review",
        context: "Used to report that a group compared a mark earlier.",
        target: "moreth rali",
        translation: "They compared the review mark.",
        notes: [
          "-eth carries third-person plural past.",
          "The root mor remains recoverable before the fused ending."
        ]
      },
      {
        id: "vel-discourse-next-step",
        functionLabel: "Cueing the next step",
        context: "Used when the instructor points to a future prompt.",
        target: "mirun huno",
        translation: "They will see the future cue.",
        notes: [
          "-un marks future plural reference.",
          "The time cue remains a separate object noun."
        ]
      }
    ],
    teachingSequences: [
      {
        id: "vel-teach-fused-endings",
        title: "Decode fused endings",
        objective: "Read Velari person, number, and tense from fused verb endings before translating the object.",
        level: "intro",
        ruleIds: ["vel-rule-fused-ending", "vel-rule-object-after-verb"],
        corpusPassageIds: ["vel-c001", "vel-c002"],
        exerciseIds: ["vel-ex001", "vel-ex002"],
        steps: [
          {
            label: "Segment",
            prompt: "Separate miror into root and ending before naming its person and tense."
          },
          {
            label: "Translate",
            prompt: "Use the ending first, then add the following object noun."
          }
        ]
      },
      {
        id: "vel-teach-root-stability",
        title: "Track stable roots across endings",
        objective: "Compare Velari forms that keep the same lexical root while changing fused endings.",
        level: "review",
        ruleIds: ["vel-rule-root-stability", "vel-rule-object-after-verb"],
        corpusPassageIds: ["vel-c011", "vel-c012"],
        exerciseIds: ["vel-ex003", "vel-ex006"],
        steps: [
          {
            label: "Compare",
            prompt: "Underline mor in moror and moreth, then name each ending."
          },
          {
            label: "Check",
            prompt: "Translate moreth rali without treating -eth as future time."
          }
        ]
      }
    ],
    corpus: [
      {
        id: "vel-c011",
        languageId: "velari",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "moror tesa",
        textTranslation: "I compare the teaching cord.",
        morphologicalSegmentation: [
          { surface: "mor", lemma: "mor", gloss: "compare", features: ["verb-root"] },
          { surface: "-or", lemma: "-or", gloss: "1sg.present", features: ["fused-ending"] },
          { surface: "tesa", lemma: "tesa", gloss: "teaching-cord", features: ["noun", "object"] }
        ],
        topicTags: ["invented-demo", "review", "present", "object"],
        consentStatus: consent
      },
      {
        id: "vel-c012",
        languageId: "velari",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "moreth rali",
        textTranslation: "They compared the review mark.",
        morphologicalSegmentation: [
          { surface: "mor", lemma: "mor", gloss: "compare", features: ["verb-root"] },
          { surface: "-eth", lemma: "-eth", gloss: "3pl.past", features: ["fused-ending"] },
          { surface: "rali", lemma: "rali", gloss: "review-mark", features: ["noun", "object"] }
        ],
        topicTags: ["invented-demo", "review", "past", "object"],
        consentStatus: consent
      }
    ],
    grammarRules: [
      {
        id: "vel-rule-root-stability",
        topic: "morphology/verb/root-stability-with-fused-endings",
        explanation: "Velari keeps the lexical root stable while fused endings carry person, number, and tense, so the same root can appear with -or for first-person present or -eth for third-person plural past.",
        evidencePassageIds: ["vel-c011", "vel-c012", "vel-c001"],
        confidence: "high"
      }
    ],
    exercises: [
      {
        id: "vel-ex006",
        languageId: "velari",
        type: "translate_to_english",
        prompt: "Translate: moreth rali",
        allowedVocabulary: ["mor", "-eth", "rali"],
        allowedRuleIds: ["vel-rule-root-stability", "vel-rule-object-after-verb"],
        expectedAnswers: ["They compared the review mark.", "They compared the review mark"],
        adversarialAnswers: [
          { answer: "I compare the review mark.", reason: "Reads the third-person plural past ending as first-person present." },
          { answer: "They will compare the review mark.", reason: "Reads the past fused ending as future." }
        ],
        gradingExplanation: "The root mor means compare, -eth marks third-person plural past, and rali is the object after the verb."
      }
    ]
  },
  ketharu: {
    vocabulary: [
      { id: "ket-vocab-me-prefix", form: "me-", gloss: "learner object prefix", partOfSpeech: "object-prefix", tags: ["object", "learner"] },
      { id: "ket-vocab-ro-prefix", form: "ro-", gloss: "review-token object prefix", partOfSpeech: "object-prefix", tags: ["object", "review"] },
      { id: "ket-vocab-hali", form: "hali", gloss: "check / compare", partOfSpeech: "verb-root", tags: ["review", "verb"] },
      { id: "ket-vocab-ko-suffix", form: "-ko", gloss: "careful review aspect", partOfSpeech: "aspect-suffix", tags: ["aspect", "review"] }
    ],
    discourseExamples: [
      {
        id: "ket-discourse-opening",
        functionLabel: "Opening a predicate lesson",
        context: "Used when the instructor introduces a new review token.",
        target: "wa-ro-hali-ko",
        translation: "The instructor checks the review token carefully.",
        notes: [
          "The subject prefix opens the predicate word.",
          "The object prefix precedes the verb root."
        ]
      },
      {
        id: "ket-discourse-learner-check",
        functionLabel: "Checking a learner response",
        context: "Used when several reviewers inspect a learner answer.",
        target: "ka-me-hali-ni",
        translation: "They will check the learner soon.",
        notes: [
          "The learner object is encoded as me-.",
          "Near-future -ni closes the predicate word."
        ]
      },
      {
        id: "ket-discourse-closure",
        functionLabel: "Closing a careful review",
        context: "Used after a reviewed signal has been carried forward.",
        target: "na-ru-wan-ko",
        translation: "I carry the signal carefully.",
        notes: [
          "The signal object prefix is ru-.",
          "Careful-review -ko replaces the ordinary time suffix."
        ]
      }
    ],
    teachingSequences: [
      {
        id: "ket-teach-slot-order",
        title: "Read the predicate slots",
        objective: "Segment Ketharu predicate words by subject, object, root, and suffix slots.",
        level: "intro",
        ruleIds: ["ket-rule-slot-order", "ket-rule-verb-as-clause"],
        corpusPassageIds: ["ket-c001", "ket-c002"],
        exerciseIds: ["ket-ex001", "ket-ex002"],
        steps: [
          {
            label: "Map",
            prompt: "Assign each part of na-mo-wan-tu to its predicate slot."
          },
          {
            label: "Build",
            prompt: "Create a new predicate word with ka- in the subject slot."
          }
        ]
      },
      {
        id: "ket-teach-review-aspect",
        title: "Review careful aspect endings",
        objective: "Keep Ketharu slot order stable while reading -ko as careful-review aspect.",
        level: "practice",
        ruleIds: ["ket-rule-review-aspect", "ket-rule-slot-order"],
        corpusPassageIds: ["ket-c011", "ket-c012"],
        exerciseIds: ["ket-ex006", "ket-ex007"],
        steps: [
          {
            label: "Segment",
            prompt: "Separate wa-ro-hali-ko into subject, object, root, and aspect."
          },
          {
            label: "Explain",
            prompt: "Describe how -ko changes the review meaning without changing slot order."
          }
        ]
      }
    ],
    corpus: [
      {
        id: "ket-c011",
        languageId: "ketharu",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "wa-ro-hali-ko",
        textTranslation: "The instructor checks the review token carefully.",
        morphologicalSegmentation: [
          { surface: "wa-", lemma: "wa-", gloss: "instructor.subject", features: ["subject"] },
          { surface: "ro-", lemma: "ro-", gloss: "review-token-object", features: ["object"] },
          { surface: "hali", lemma: "hali", gloss: "check", features: ["verb-root"] },
          { surface: "-ko", lemma: "-ko", gloss: "careful-review", features: ["aspect"] }
        ],
        topicTags: ["invented-demo", "review", "aspect", "instructor"],
        consentStatus: consent
      },
      {
        id: "ket-c012",
        languageId: "ketharu",
        source: "expanded synthetic review corpus",
        sourceMetadata,
        textTarget: "ka-me-hali-ni",
        textTranslation: "They will check the learner soon.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "me-", lemma: "me-", gloss: "learner-object", features: ["object"] },
          { surface: "hali", lemma: "hali", gloss: "check", features: ["verb-root"] },
          { surface: "-ni", lemma: "-ni", gloss: "near-future", features: ["time"] }
        ],
        topicTags: ["invented-demo", "review", "future", "learner"],
        consentStatus: consent
      }
    ],
    grammarRules: [
      {
        id: "ket-rule-review-aspect",
        topic: "morphology/verb/careful-review-aspect",
        explanation: "Ketharu can close a predicate word with -ko to mark careful review work, while the normal subject-object-root-aspect slot order remains visible for review-token and learner-object prefixes.",
        evidencePassageIds: ["ket-c011", "ket-c012", "ket-c009"],
        confidence: "high"
      }
    ],
    exercises: [
      {
        id: "ket-ex007",
        languageId: "ketharu",
        type: "segment",
        prompt: "Segment: wa-ro-hali-ko",
        allowedVocabulary: ["wa-", "ro-", "hali", "-ko"],
        allowedRuleIds: ["ket-rule-review-aspect", "ket-rule-slot-order"],
        expectedAnswers: ["wa-|ro-|hali|-ko", "wa- ro- hali -ko"],
        adversarialAnswers: [
          { answer: "wa-ro|hali|-ko", reason: "Collapses the subject and object prefixes into one segment." },
          { answer: "ro-|wa-|hali|-ko", reason: "Moves the object prefix before the subject prefix." }
        ],
        gradingExplanation: "The review predicate keeps subject prefix wa-, object prefix ro-, root hali, and careful-review suffix -ko in order."
      }
    ]
  }
};

for (const fixture of syntheticLanguageFixtures) {
  const expansion = fixtureRichnessExpansion[fixture.language.id];
  if (!expansion) continue;
  fixture.vocabulary.push(...expansion.vocabulary);
  fixture.discourseExamples.push(...expansion.discourseExamples);
  fixture.corpus.push(...expansion.corpus);
  fixture.grammarRules.push(...expansion.grammarRules);
}

for (const fixture of syntheticLanguageFixtures) {
  fixture.notesAnswerKey = fixture.grammarRules.map((rule) => ({
    id: `${rule.id}-note`,
    languageId: fixture.language.id,
    topic: rule.topic,
    explanation: rule.explanation,
    examples: rule.evidencePassageIds.slice(0, 2).map((passageId) => {
      const passage = fixture.corpus.find((item) => item.id === passageId);
      if (!passage) throw new Error(`Missing passage ${passageId}`);
      return {
        passageId,
        target: passage.textTarget,
        translation: passage.textTranslation
      };
    }),
    evidencePassageIds: rule.evidencePassageIds,
    evidenceCount: rule.evidencePassageIds.length,
    confidence: rule.confidence,
    status: "approved",
    reviewer: {
      lastReviewedBy: "synthetic-reviewer",
      lastReviewedAt: "2026-06-03T00:00:00.000Z",
      comments: ["Synthetic reviewer baseline note."]
    },
    dialectScope: "synthetic-default",
    editHistory: [
      {
        at: "2026-06-03T00:00:00.000Z",
        by: "synthetic-generator",
        action: "created",
        summary: "Created approved synthetic grammar note."
      }
    ]
  }));
}

const exerciseMap: Record<string, Exercise[]> = {
  avenik: [
    {
      id: "avn-ex001",
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["mira talo-mi-na"],
      adversarialAnswers: [
        { answer: "talo-mi-na mira", reason: "Keeps the words but moves the verb before the locative noun." },
        { answer: "mira talo-na-mi", reason: "Reverses tense and person suffix order." }
      ],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    },
    {
      id: "avn-ex002",
      languageId: "avenik",
      type: "segment",
      prompt: "Segment: nemi-lo-ki",
      allowedVocabulary: ["nemi", "-lo", "-ki"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["nemi|-lo|-ki", "nemi -lo -ki"],
      adversarialAnswers: [
        { answer: "nemi-lo|-ki", reason: "Collapses the verb root with the past suffix." },
        { answer: "nemi|-ki|-lo", reason: "Swaps person and tense suffix order." }
      ],
      gradingExplanation: "The verb separates into root nemi, past suffix -lo, and third-person suffix -ki."
    },
    {
      id: "avn-ex003",
      languageId: "avenik",
      type: "choose_particle",
      prompt: "Which Avenik suffix marks location on a noun?",
      allowedVocabulary: ["-ke"],
      allowedRuleIds: ["avn-rule-noun-case-chain"],
      expectedAnswers: ["-ke"],
      adversarialAnswers: [
        { answer: "-ra", reason: "Uses the accusative suffix instead of the locative suffix." },
        { answer: "-ne", reason: "Uses the coordination suffix instead of the locative suffix." }
      ],
      gradingExplanation: "The locative suffix is -ke, as in kilo-ke."
    },
    {
      id: "avn-ex004",
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate: The instructor supervises the learner during the practice round.",
      allowedVocabulary: ["kita", "-ki", "saku", "-ra", "-ne", "pila", "-mi"],
      allowedRuleIds: ["avn-rule-verb-chain", "avn-rule-noun-case-chain", "avn-rule-demo-agent-marking"],
      expectedAnswers: ["kita-ki saku-ra-ne pila-mi-ki"],
      adversarialAnswers: [
        { answer: "kita saku-ra-ne pila-mi-ki", reason: "Drops the demo-agent subject marker from instructor." },
        { answer: "kita-ki saku-ne-ra pila-mi-ki", reason: "Reverses case and coordination suffix order on the object." }
      ],
      gradingExplanation: "Use kita-ki for the instructor as demo agent, saku-ra-ne for the learner object phrase, and pila-mi-ki for supervises."
    },
    {
      id: "avn-ex005",
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate: At the practice mat, the child explains.",
      allowedVocabulary: ["lumo", "-ke", "saku", "nemi", "-mi", "-ki"],
      allowedRuleIds: ["avn-rule-lesson-setting-locative", "avn-rule-verb-chain", "avn-rule-noun-before-verb"],
      expectedAnswers: ["lumo-ke saku nemi-mi-ki"],
      adversarialAnswers: [
        { answer: "lumo saku nemi-mi-ki", reason: "Omits the locative suffix on the practice mat." },
        { answer: "saku lumo-ke nemi-mi-ki", reason: "Moves the lesson-setting locative after the subject." }
      ],
      gradingExplanation: "Use lumo-ke for the lesson-setting locative, then saku before the finite verb nemi-mi-ki."
    }
  ],
  solari: [
    {
      id: "sol-ex001",
      languageId: "solari",
      type: "choose_particle",
      prompt: "Which particle marks past time before the verb?",
      allowedVocabulary: ["pa"],
      allowedRuleIds: ["sol-rule-past-particle"],
      expectedAnswers: ["pa"],
      adversarialAnswers: [
        { answer: "so", reason: "Uses the durative aspect particle instead of past time." },
        { answer: "na", reason: "Uses the locative particle instead of past time." }
      ],
      gradingExplanation: "Solari uses pa immediately before the verb for past time."
    },
    {
      id: "sol-ex002",
      languageId: "solari",
      type: "translate_to_target",
      prompt: "Translate: They made a song.",
      allowedVocabulary: ["ta", "pa", "ko", "nua"],
      allowedRuleIds: ["sol-rule-past-particle", "sol-rule-svo"],
      expectedAnswers: ["ta pa ko nua"],
      adversarialAnswers: [
        { answer: "ta ko pa nua", reason: "Places the past particle after the verb." },
        { answer: "pa ta ko nua", reason: "Moves the tense particle before the subject." }
      ],
      gradingExplanation: "Use subject ta, past particle pa, verb ko, and object nua."
    },
    {
      id: "sol-ex003",
      languageId: "solari",
      type: "choose_particle",
      prompt: "Which Solari particle introduces a final locative phrase?",
      allowedVocabulary: ["na"],
      allowedRuleIds: ["sol-rule-location-final"],
      expectedAnswers: ["na"],
      adversarialAnswers: [
        { answer: "pa", reason: "Uses the past particle instead of the locative introducer." },
        { answer: "e", reason: "Uses the object linker instead of the locative introducer." }
      ],
      gradingExplanation: "The particle na introduces the location noun at the end of the clause."
    },
    {
      id: "sol-ex004",
      languageId: "solari",
      type: "translate_to_target",
      prompt: "Translate: I made the pattern card and teaching board.",
      allowedVocabulary: ["mi", "pa", "ko", "rei", "e", "luma"],
      allowedRuleIds: ["sol-rule-past-particle", "sol-rule-svo", "sol-rule-object-coordination"],
      expectedAnswers: ["mi pa ko rei e luma"],
      adversarialAnswers: [
        { answer: "mi ko pa rei e luma", reason: "Places the past particle after the verb." },
        { answer: "mi pa ko rei luma e", reason: "Moves the object linker after the linked nouns." }
      ],
      gradingExplanation: "Use mi as subject, pa before ko for past time, and e between the two object nouns."
    },
    {
      id: "sol-ex005",
      languageId: "solari",
      type: "choose_particle",
      prompt: "Which Solari particle marks ongoing or repeated action before the verb?",
      allowedVocabulary: ["so"],
      allowedRuleIds: ["sol-rule-durative-particle"],
      expectedAnswers: ["so"],
      adversarialAnswers: [
        { answer: "pa", reason: "Uses the past particle instead of durative aspect." },
        { answer: "na", reason: "Uses the locative particle instead of durative aspect." }
      ],
      gradingExplanation: "The aspect particle so appears before the verb to mark ongoing or repeated action."
    }
  ],
  velari: [
    {
      id: "vel-ex001",
      languageId: "velari",
      type: "translate_to_english",
      prompt: "Translate: daneth loma",
      allowedVocabulary: ["dan", "-eth", "loma"],
      allowedRuleIds: ["vel-rule-fused-ending"],
      expectedAnswers: ["They ate berries.", "They ate berries"],
      adversarialAnswers: [
        { answer: "I ate berries.", reason: "Reads the third-person plural past ending as first person." },
        { answer: "They eat berries.", reason: "Drops the past tense carried by the fused ending." }
      ],
      gradingExplanation: "The ending -eth encodes third-person plural past."
    },
    {
      id: "vel-ex002",
      languageId: "velari",
      type: "segment",
      prompt: "Segment: miror",
      allowedVocabulary: ["mir", "-or"],
      allowedRuleIds: ["vel-rule-fused-ending"],
      expectedAnswers: ["mir|-or", "mir -or"],
      adversarialAnswers: [
        { answer: "mi|ror", reason: "Splits the fused surface at the wrong boundary." },
        { answer: "miror", reason: "Leaves the root and fused ending unsegmented." }
      ],
      gradingExplanation: "The form combines mir with the fused first-person present ending -or."
    },
    {
      id: "vel-ex003",
      languageId: "velari",
      type: "translate_to_english",
      prompt: "Translate: kelal sora",
      allowedVocabulary: ["kel", "-al", "sora"],
      allowedRuleIds: ["vel-rule-first-past-ending", "vel-rule-object-after-verb"],
      expectedAnswers: ["I arranged the lesson stone.", "I arranged the lesson stone"],
      adversarialAnswers: [
        { answer: "They arranged the lesson stone.", reason: "Reads the first-person past ending as third plural." },
        { answer: "I will arrange the lesson stone.", reason: "Reads the past ending as future." }
      ],
      gradingExplanation: "The fused ending -al marks first-person past, and sora is the object after the verb."
    },
    {
      id: "vel-ex004",
      languageId: "velari",
      type: "segment",
      prompt: "Segment: sarum",
      allowedVocabulary: ["sar", "-um"],
      allowedRuleIds: ["vel-rule-present-plural-ending"],
      expectedAnswers: ["sar|-um", "sar -um"],
      adversarialAnswers: [
        { answer: "sa|rum", reason: "Splits inside the root instead of before the fused ending." },
        { answer: "sarum", reason: "Leaves the present plural ending unsegmented." }
      ],
      gradingExplanation: "The form combines sar with -um, the fused third-person plural present ending."
    },
    {
      id: "vel-ex005",
      languageId: "velari",
      type: "segment",
      prompt: "Segment: kelun",
      allowedVocabulary: ["kel", "-un"],
      allowedRuleIds: ["vel-rule-future-fused-endings"],
      expectedAnswers: ["kel|-un", "kel -un"],
      adversarialAnswers: [
        { answer: "ke|lun", reason: "Splits the root at the wrong point." },
        { answer: "kelun", reason: "Leaves the future fused ending unsegmented." }
      ],
      gradingExplanation: "The form combines kel with -un, the fused third-person plural future ending."
    }
  ],
  ketharu: [
    {
      id: "ket-ex001",
      languageId: "ketharu",
      type: "segment",
      prompt: "Segment: na-mo-wan-tu",
      allowedVocabulary: ["na-", "mo-", "wan", "-tu"],
      allowedRuleIds: ["ket-rule-slot-order", "ket-rule-verb-as-clause"],
      expectedAnswers: ["na-|mo-|wan|-tu", "na- mo- wan -tu"],
      adversarialAnswers: [
        { answer: "na-mo|wan|-tu", reason: "Collapses subject and object prefixes into one segment." },
        { answer: "mo-|na-|wan|-tu", reason: "Reverses subject and object prefix slots." }
      ],
      gradingExplanation: "The slots are subject prefix, object prefix, verb root, and time suffix."
    },
    {
      id: "ket-ex002",
      languageId: "ketharu",
      type: "translate_to_target",
      prompt: "Translate: They told the story yesterday.",
      allowedVocabulary: ["ka-", "se-", "lom", "-ra"],
      allowedRuleIds: ["ket-rule-slot-order"],
      expectedAnswers: ["ka-se-lom-ra"],
      adversarialAnswers: [
        { answer: "se-ka-lom-ra", reason: "Places the object prefix before the subject prefix." },
        { answer: "ka-se-lom-tu", reason: "Uses today suffix instead of yesterday suffix." }
      ],
      gradingExplanation: "Use ka- for they, se- for story object, lom for tell, and -ra for yesterday."
    },
    {
      id: "ket-ex003",
      languageId: "ketharu",
      type: "segment",
      prompt: "Segment: wa-pi-se-tani-ra",
      allowedVocabulary: ["wa-", "pi-", "se-", "tani", "-ra"],
      allowedRuleIds: ["ket-rule-compound-object-stack"],
      expectedAnswers: ["wa-|pi-|se-|tani|-ra", "wa- pi- se- tani -ra"],
      adversarialAnswers: [
        { answer: "wa-|se-|pi-|tani|-ra", reason: "Reverses the compound object-prefix stack." },
        { answer: "wa-pi-se|tani|-ra", reason: "Collapses the object-prefix stack into one segment." }
      ],
      gradingExplanation: "The form stacks instructor subject, tile object, story object, arrange root, and past suffix."
    },
    {
      id: "ket-ex004",
      languageId: "ketharu",
      type: "translate_to_target",
      prompt: "Translate: They explain the lamp token today.",
      allowedVocabulary: ["ka-", "ki-", "ne", "-tu"],
      allowedRuleIds: ["ket-rule-slot-order"],
      expectedAnswers: ["ka-ki-ne-tu"],
      adversarialAnswers: [
        { answer: "ki-ka-ne-tu", reason: "Moves the object prefix before the subject prefix." },
        { answer: "ka-ki-ne-ra", reason: "Uses yesterday suffix instead of today suffix." }
      ],
      gradingExplanation: "Use ka- for they, ki- for lamp-token object, ne for explain, and -tu for today."
    },
    {
      id: "ket-ex005",
      languageId: "ketharu",
      type: "translate_to_target",
      prompt: "Translate: They arrange the clay tile at the display table.",
      allowedVocabulary: ["ka-", "pi-", "tani", "-su"],
      allowedRuleIds: ["ket-rule-slot-order", "ket-rule-display-aspect-suffix"],
      expectedAnswers: ["ka-pi-tani-su"],
      adversarialAnswers: [
        { answer: "pi-ka-tani-su", reason: "Moves the object prefix before the subject prefix." },
        { answer: "ka-pi-tani-tu", reason: "Uses today suffix instead of display-table aspect." }
      ],
      gradingExplanation: "Use ka- for they, pi- for clay tile, tani for arrange, and -su for the display-table aspect slot."
    },
    {
      id: "ket-ex006",
      languageId: "ketharu",
      type: "segment",
      prompt: "Segment: wa-se-ne-ra-tu-wa-ki-tani-ra",
      allowedVocabulary: ["wa-", "se-", "ne", "-ra", "-tu", "ki-", "tani"],
      allowedRuleIds: ["ket-rule-slot-order", "ket-rule-verb-as-clause", "ket-rule-linked-predicate-chain"],
      expectedAnswers: ["wa-|se-|ne|-ra|-tu|wa-|ki-|tani|-ra", "wa- se- ne -ra -tu wa- ki- tani -ra"],
      adversarialAnswers: [
        { answer: "wa-|se-|ne|-ra|wa-|ki-|tani|-ra", reason: "Omits the chaining suffix that links the two predicate words." },
        { answer: "wa-|se-|ne|-ra-tu|wa-|ki-|tani|-ra", reason: "Collapses the past suffix and chaining suffix into one segment." }
      ],
      gradingExplanation: "The linked form keeps the first predicate chain, the -tu chain marker, and the second predicate chain segmented in order."
    }
  ]
};

for (const fixture of syntheticLanguageFixtures) {
  fixture.exercisesAnswerKey = [
    ...(exerciseMap[fixture.language.id] ?? []),
    ...(fixtureRichnessExpansion[fixture.language.id]?.exercises ?? [])
  ];
}

for (const fixture of syntheticLanguageFixtures) {
  fixture.teachingSequences.push(...(fixtureRichnessExpansion[fixture.language.id]?.teachingSequences ?? []));
}
