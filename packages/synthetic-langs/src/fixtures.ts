import type { CorpusPassage, Exercise, Language, Note } from "@assini/db";

export type SyntheticLanguageFixture = {
  language: Language;
  vocabulary: Array<{ id: string; form: string; gloss: string; partOfSpeech: string; tags: string[] }>;
  grammarRules: Array<{ id: string; topic: string; explanation: string; evidencePassageIds: string[]; confidence: "low" | "medium" | "high" }>;
  corpus: CorpusPassage[];
  notesAnswerKey: Note[];
  exercisesAnswerKey: Exercise[];
};

const consent = {
  use: "synthetic-testing-only" as const,
  restrictions: ["fake-language", "not-for-cultural-claims"]
};

const sourceMetadata = {
  author: "AssiniLang synthetic fixture generator",
  year: 2026,
  license: "Synthetic fixtures for local testing only",
  consentRecord: "synthetic-fixture-consent"
};

export const syntheticLanguageFixtures: SyntheticLanguageFixture[] = [
  {
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Synthetic agglutinative language with transparent suffix chains.",
      orthography: "Lowercase Latin with hyphenated morphology.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    vocabulary: [
      { id: "avn-v-001", form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"] },
      { id: "avn-v-002", form: "nemi", gloss: "teach", partOfSpeech: "verb", tags: ["learning"] },
      { id: "avn-n-001", form: "mira", gloss: "river", partOfSpeech: "noun", tags: ["place"] },
      { id: "avn-n-002", form: "saku", gloss: "child", partOfSpeech: "noun", tags: ["person"] },
      { id: "avn-s-001", form: "-mi", gloss: "present tense", partOfSpeech: "suffix", tags: ["tense"] },
      { id: "avn-s-002", form: "-lo", gloss: "past tense", partOfSpeech: "suffix", tags: ["tense"] },
      { id: "avn-s-003", form: "-na", gloss: "first person singular", partOfSpeech: "suffix", tags: ["person"] },
      { id: "avn-s-004", form: "-ki", gloss: "third person singular", partOfSpeech: "suffix", tags: ["person"] }
    ],
    grammarRules: [
      {
        id: "avn-rule-verb-chain",
        topic: "morphology/verb/tense-person-suffix-chain",
        explanation: "Avenik finite verbs use root + tense suffix + person suffix. The tense suffix comes before the person suffix.",
        evidencePassageIds: ["avn-c001", "avn-c002", "avn-c003"],
        confidence: "high"
      },
      {
        id: "avn-rule-noun-before-verb",
        topic: "syntax/basic-noun-before-verb",
        explanation: "Simple Avenik clauses place the topical noun before the finite verb.",
        evidencePassageIds: ["avn-c001", "avn-c004", "avn-c005"],
        confidence: "medium"
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
    vocabulary: [
      { id: "sol-p-001", form: "mi", gloss: "I", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-p-002", form: "ta", gloss: "they", partOfSpeech: "pronoun", tags: ["subject"] },
      { id: "sol-v-001", form: "len", gloss: "listen", partOfSpeech: "verb", tags: ["learning"] },
      { id: "sol-v-002", form: "ko", gloss: "make", partOfSpeech: "verb", tags: ["work"] },
      { id: "sol-n-001", form: "nua", gloss: "song", partOfSpeech: "noun", tags: ["object"] },
      { id: "sol-t-001", form: "pa", gloss: "past marker", partOfSpeech: "particle", tags: ["tense"] }
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
        textTarget: "ta len nua",
        textTranslation: "They listen to the song.",
        morphologicalSegmentation: [
          { surface: "ta", lemma: "ta", gloss: "3pl", features: ["pronoun"] },
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
        textTarget: "mi ko nua",
        textTranslation: "I make a song.",
        morphologicalSegmentation: [
          { surface: "mi", lemma: "mi", gloss: "1sg", features: ["pronoun"] },
          { surface: "ko", lemma: "ko", gloss: "make", features: ["verb"] },
          { surface: "nua", lemma: "nua", gloss: "song", features: ["noun"] }
        ],
        topicTags: ["present", "work"],
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
    vocabulary: [
      { id: "vel-v-001", form: "dan", gloss: "eat", partOfSpeech: "verb-root", tags: ["food"] },
      { id: "vel-v-002", form: "mir", gloss: "see", partOfSpeech: "verb-root", tags: ["perception"] },
      { id: "vel-n-001", form: "loma", gloss: "berry", partOfSpeech: "noun", tags: ["food"] },
      { id: "vel-n-002", form: "vesa", gloss: "star", partOfSpeech: "noun", tags: ["sky"] },
      { id: "vel-e-001", form: "-or", gloss: "1sg present", partOfSpeech: "ending", tags: ["fusional"] },
      { id: "vel-e-002", form: "-eth", gloss: "3sg past", partOfSpeech: "ending", tags: ["fusional"] }
    ],
    grammarRules: [
      {
        id: "vel-rule-fused-ending",
        topic: "morphology/verb/fused-person-tense-ending",
        explanation: "Velari verb endings encode person and tense in a single fused ending: -or is first-person present, while -eth is third-person past.",
        evidencePassageIds: ["vel-c001", "vel-c002", "vel-c004"],
        confidence: "high"
      },
      {
        id: "vel-rule-object-after-verb",
        topic: "syntax/object-after-finite-verb",
        explanation: "Velari places the object noun after the finite verb in simple clauses.",
        evidencePassageIds: ["vel-c001", "vel-c003", "vel-c005"],
        confidence: "medium"
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
          { surface: "-eth", lemma: "-eth", gloss: "3sg.past", features: ["person-tense"] },
          { surface: "vesa", lemma: "vesa", gloss: "star", features: ["noun"] }
        ],
        topicTags: ["sky", "past", "third-person"],
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
          { surface: "-eth", lemma: "-eth", gloss: "3sg.past", features: ["person-tense"] },
          { surface: "loma", lemma: "loma", gloss: "berry", features: ["noun"] }
        ],
        topicTags: ["food", "past", "third-person"],
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
      description: "Synthetic verb-centered language with person, object, tense, and root slots.",
      orthography: "Hyphenated Latin slot chains.",
      status: "synthetic",
      fixtureSource: "packages/synthetic-langs/src/fixtures.ts"
    },
    vocabulary: [
      { id: "ket-pr-001", form: "na-", gloss: "I", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-pr-002", form: "ka-", gloss: "they", partOfSpeech: "prefix", tags: ["subject"] },
      { id: "ket-ob-001", form: "mo-", gloss: "fish object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-ob-002", form: "se-", gloss: "story object", partOfSpeech: "object-prefix", tags: ["object"] },
      { id: "ket-v-001", form: "wan", gloss: "carry", partOfSpeech: "verb-root", tags: ["motion"] },
      { id: "ket-v-002", form: "lom", gloss: "tell", partOfSpeech: "verb-root", tags: ["speech"] },
      { id: "ket-t-001", form: "-tu", gloss: "today", partOfSpeech: "suffix", tags: ["time"] },
      { id: "ket-t-002", form: "-ra", gloss: "yesterday", partOfSpeech: "suffix", tags: ["time"] }
    ],
    grammarRules: [
      {
        id: "ket-rule-slot-order",
        topic: "morphology/verb/subject-object-root-time-slots",
        explanation: "Ketharu verb words follow subject prefix + object prefix + verb root + time suffix.",
        evidencePassageIds: ["ket-c001", "ket-c002", "ket-c003", "ket-c004"],
        confidence: "high"
      },
      {
        id: "ket-rule-verb-as-clause",
        topic: "syntax/polysynthetic-lite/verb-word-clause",
        explanation: "A single Ketharu verb word can express a full clause when subject, object, root, and time slots are present.",
        evidencePassageIds: ["ket-c001", "ket-c003", "ket-c005"],
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
        textTarget: "na-se-lom-tu",
        textTranslation: "I tell the story today.",
        morphologicalSegmentation: [
          { surface: "na-", lemma: "na-", gloss: "1sg.subject", features: ["subject"] },
          { surface: "se-", lemma: "se-", gloss: "story.object", features: ["object"] },
          { surface: "lom", lemma: "lom", gloss: "tell", features: ["verb-root"] },
          { surface: "-tu", lemma: "-tu", gloss: "today", features: ["time"] }
        ],
        topicTags: ["speech", "today", "first-person"],
        consentStatus: consent
      },
      {
        id: "ket-c004",
        languageId: "ketharu",
        source: "synthetic lesson corpus",
        sourceMetadata,
        textTarget: "ka-mo-wan-ra",
        textTranslation: "They carried the fish yesterday.",
        morphologicalSegmentation: [
          { surface: "ka-", lemma: "ka-", gloss: "3pl.subject", features: ["subject"] },
          { surface: "mo-", lemma: "mo-", gloss: "fish.object", features: ["object"] },
          { surface: "wan", lemma: "wan", gloss: "carry", features: ["verb-root"] },
          { surface: "-ra", lemma: "-ra", gloss: "yesterday", features: ["time"] }
        ],
        topicTags: ["motion", "yesterday", "third-person"],
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
      }
    ],
    notesAnswerKey: [],
    exercisesAnswerKey: []
  }
];

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
      lastReviewedBy: "synthetic-answer-key",
      lastReviewedAt: "2026-06-03T00:00:00.000Z",
      comments: ["Gold answer key for synthetic fixture evaluation."]
    },
    dialectScope: "synthetic-default",
    editHistory: [
      {
        at: "2026-06-03T00:00:00.000Z",
        by: "synthetic-fixture-generator",
        action: "created",
        summary: "Created approved answer-key note from fixture grammar rule."
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
      gradingExplanation: "The verb separates into root nemi, past suffix -lo, and third-person suffix -ki."
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
      gradingExplanation: "Use subject ta, past particle pa, verb ko, and object nua."
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
      gradingExplanation: "The ending -eth encodes third-person past."
    },
    {
      id: "vel-ex002",
      languageId: "velari",
      type: "segment",
      prompt: "Segment: miror",
      allowedVocabulary: ["mir", "-or"],
      allowedRuleIds: ["vel-rule-fused-ending"],
      expectedAnswers: ["mir|-or", "mir -or"],
      gradingExplanation: "The form combines mir with the fused first-person present ending -or."
    }
  ],
  ketharu: [
    {
      id: "ket-ex001",
      languageId: "ketharu",
      type: "segment",
      prompt: "Segment: na-mo-wan-tu",
      allowedVocabulary: ["na-", "mo-", "wan", "-tu"],
      allowedRuleIds: ["ket-rule-slot-order"],
      expectedAnswers: ["na-|mo-|wan|-tu", "na- mo- wan -tu"],
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
      gradingExplanation: "Use ka- for they, se- for story object, lom for tell, and -ra for yesterday."
    }
  ]
};

for (const fixture of syntheticLanguageFixtures) {
  fixture.exercisesAnswerKey = exerciseMap[fixture.language.id] ?? [];
}
