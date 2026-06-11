import {
  appStateSchema,
  corpusPassageToAnswerKey,
  LOCAL_PROTOTYPE_USERS,
  type AppState,
  type CorpusPassage,
  type Exercise,
  type Language,
  type Lexeme,
  type Note
} from "./schema.js";
import { createEmptyState } from "./store.js";

/**
 * Minimal valid workspace used by unit and integration tests across the
 * monorepo. This is deliberately tiny test data, not product content:
 * the application itself starts with an empty workspace and builds
 * language data from user-provided raw sources.
 */

export const TEST_LANGUAGE_ID = "testlang";

const TEST_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const testConsent = {
  use: "testing-only" as const,
  restrictions: ["test-fixture-only"]
};

const testSourceMetadata = {
  author: "Test fixture builder",
  year: 2026,
  license: "Internal test data",
  consentRecord: "test-fixture-consent"
};

export function buildTestLanguage(overrides: Partial<Language> = {}): Language {
  return {
    id: TEST_LANGUAGE_ID,
    name: "Testlang",
    typology: "agglutinative",
    description: "Small invented language used only by automated tests.",
    orthography: "Lowercase Latin with hyphenated suffix boundaries.",
    status: "active",
    phonology: {
      consonants: ["t", "k", "s", "m", "n", "l", "r"],
      vowels: ["a", "e", "i", "o", "u"],
      syllableTemplate: "CV",
      stress: "word-initial",
      notes: ["No consonant clusters in native roots."]
    },
    createdBy: "system-seed",
    createdAt: TEST_TIMESTAMP,
    ...overrides
  };
}

export function buildTestCorpus(languageId = TEST_LANGUAGE_ID): CorpusPassage[] {
  return [
    {
      id: `${languageId}-c001`,
      languageId,
      source: "test corpus",
      sourceMetadata: { ...testSourceMetadata },
      textTarget: "mira talo-na",
      textTranslation: "I walk by the river.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
        { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
        { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
      ],
      topicTags: ["motion", "first-person"],
      consentStatus: { ...testConsent, restrictions: [...testConsent.restrictions] }
    },
    {
      id: `${languageId}-c002`,
      languageId,
      source: "test corpus",
      sourceMetadata: { ...testSourceMetadata },
      textTarget: "saku nemi-lo-ki",
      textTranslation: "The child taught.",
      morphologicalSegmentation: [
        { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
        { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
        { surface: "-lo", lemma: "-lo", gloss: "past", features: ["tense"] },
        { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
      ],
      topicTags: ["learning", "past"],
      consentStatus: { ...testConsent, restrictions: [...testConsent.restrictions] }
    },
    {
      id: `${languageId}-c003`,
      languageId,
      source: "test corpus",
      sourceMetadata: { ...testSourceMetadata },
      textTarget: "saku talo-ki",
      textTranslation: "The child walks.",
      morphologicalSegmentation: [
        { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
        { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
        { surface: "-ki", lemma: "-ki", gloss: "3sg", features: ["person"] }
      ],
      topicTags: ["motion", "third-person"],
      consentStatus: { ...testConsent, restrictions: [...testConsent.restrictions] }
    }
  ];
}

export function buildTestLexemes(languageId = TEST_LANGUAGE_ID): Lexeme[] {
  return [
    { id: `${languageId}-lex-001`, languageId, form: "mira", gloss: "river", partOfSpeech: "noun", tags: ["place"], sourceAssetIds: [] },
    { id: `${languageId}-lex-002`, languageId, form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"], sourceAssetIds: [] },
    { id: `${languageId}-lex-003`, languageId, form: "saku", gloss: "child", partOfSpeech: "noun", tags: ["person"], sourceAssetIds: [] },
    { id: `${languageId}-lex-004`, languageId, form: "nemi", gloss: "teach", partOfSpeech: "verb", tags: ["learning"], sourceAssetIds: [] },
    { id: `${languageId}-lex-005`, languageId, form: "-na", gloss: "first person singular", partOfSpeech: "suffix", tags: ["person"], sourceAssetIds: [] },
    { id: `${languageId}-lex-006`, languageId, form: "-ki", gloss: "third person singular", partOfSpeech: "suffix", tags: ["person"], sourceAssetIds: [] },
    { id: `${languageId}-lex-007`, languageId, form: "-lo", gloss: "past tense", partOfSpeech: "suffix", tags: ["tense"], sourceAssetIds: [] }
  ];
}

export function buildTestNoteAnswerKeys(languageId = TEST_LANGUAGE_ID): Note[] {
  return [
    {
      id: `${languageId}-note-basic-order`,
      languageId,
      topic: "syntax/basic-order",
      explanation: "Subjects precede verbs in simple clauses, and person suffixes close the verb form.",
      examples: [
        {
          passageId: `${languageId}-c001`,
          target: "mira talo-na",
          translation: "I walk by the river."
        }
      ],
      evidencePassageIds: [`${languageId}-c001`, `${languageId}-c002`],
      evidenceCount: 2,
      confidence: "high",
      status: "approved",
      reviewer: {
        lastReviewedBy: null,
        lastReviewedAt: null,
        comments: []
      },
      dialectScope: "general",
      editHistory: [
        {
          at: TEST_TIMESTAMP,
          by: "test-generator",
          action: "created",
          summary: "Created test note answer key."
        }
      ]
    },
    {
      id: `${languageId}-note-past-suffix`,
      languageId,
      topic: "morphology/verb/past-suffix",
      explanation: "The suffix -lo marks past tense and precedes the person suffix.",
      examples: [
        {
          passageId: `${languageId}-c002`,
          target: "saku nemi-lo-ki",
          translation: "The child taught."
        }
      ],
      evidencePassageIds: [`${languageId}-c002`],
      evidenceCount: 1,
      confidence: "medium",
      status: "approved",
      reviewer: {
        lastReviewedBy: null,
        lastReviewedAt: null,
        comments: []
      },
      dialectScope: "general",
      editHistory: [
        {
          at: TEST_TIMESTAMP,
          by: "test-generator",
          action: "created",
          summary: "Created test note answer key."
        }
      ]
    }
  ];
}

export function buildTestExercises(languageId = TEST_LANGUAGE_ID): Exercise[] {
  return [
    {
      id: `${languageId}-ex-001`,
      languageId,
      type: "choose_particle",
      prompt: "Choose the first-person suffix that completes talo-___.",
      allowedVocabulary: ["-na", "-ki", "-lo"],
      allowedRuleIds: [`${languageId}-note-basic-order`],
      expectedAnswers: ["-na"],
      adversarialAnswers: [
        { answer: "-ki", reason: "Third-person suffix, not first-person." },
        { answer: "-lo", reason: "Past-tense suffix, not a person suffix." }
      ],
      gradingExplanation: "The suffix -na marks first-person singular subjects."
    },
    {
      id: `${languageId}-ex-002`,
      languageId,
      type: "translate_to_target",
      prompt: "Translate to the target language: The child walks.",
      allowedVocabulary: ["saku", "talo", "-ki"],
      allowedRuleIds: [`${languageId}-note-basic-order`],
      expectedAnswers: ["saku talo-ki"],
      adversarialAnswers: [
        { answer: "saku talo-na", reason: "Uses first-person suffix for a third-person subject." },
        { answer: "talo saku-ki", reason: "Reverses subject and verb order." }
      ],
      gradingExplanation: "Subject saku precedes the verb talo with third-person suffix -ki."
    },
    {
      id: `${languageId}-ex-003`,
      languageId,
      type: "segment",
      prompt: "Segment: nemi-lo-ki",
      allowedVocabulary: ["nemi", "-lo", "-ki"],
      allowedRuleIds: [`${languageId}-note-past-suffix`],
      expectedAnswers: ["nemi -lo -ki"],
      adversarialAnswers: [
        { answer: "nemi-lo -ki", reason: "Collapses the tense suffix boundary." },
        { answer: "ne mi -lo -ki", reason: "Splits the verb root incorrectly." }
      ],
      gradingExplanation: "The verb root nemi is followed by past -lo and third-person -ki."
    }
  ];
}

export function buildTestWorkspaceState(): AppState {
  const state = createEmptyState();
  const language = buildTestLanguage();
  const corpus = buildTestCorpus(language.id);
  const noteAnswerKeys = buildTestNoteAnswerKeys(language.id);

  state.users.push(...LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user })));
  state.languages.push(language);
  state.corpus.push(...corpus);
  state.corpusAnswerKeys = corpus.map(corpusPassageToAnswerKey);
  state.lexemes.push(...buildTestLexemes(language.id));
  state.noteAnswerKeys.push(...noteAnswerKeys);
  state.notes.push(
    ...noteAnswerKeys.map((note) => ({
      ...note,
      examples: note.examples.map((example) => ({ ...example })),
      evidencePassageIds: [...note.evidencePassageIds],
      reviewer: { ...note.reviewer, comments: [...note.reviewer.comments] },
      editHistory: note.editHistory.map((entry) => ({ ...entry })),
      status: "draft" as const
    }))
  );
  state.exercises.push(...buildTestExercises(language.id));
  state.reviewPolicies.push({
    id: `review-policy-${language.id}`,
    languageId: language.id,
    assignedReviewerIds: ["reviewer-1", "elder-1"],
    approvalThreshold: 2,
    requiresAssignedReviewer: true,
    updatedAt: TEST_TIMESTAMP,
    updatedBy: "system-seed"
  });

  return appStateSchema.parse(state);
}
