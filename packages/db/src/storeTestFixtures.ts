import type {
  AuditEvent,
  AiSession,
  CorpusAnswerKey,
  CorpusPassage,
  ElderCorrection,
  EvaluationRun,
  Exercise,
  ExerciseSubmission,
  GovernanceRecord,
  Language,
  Note,
  ReviewDisposition
} from "./schema.js";

export function createTestLanguage(overrides: Partial<Language> = {}): Language {
  return {
    id: "avenik",
    name: "Avenik",
    typology: "agglutinative",
    description: "Test language.",
    orthography: "Latin test orthography",
    status: "draft",
    ...overrides
  };
}

export function createTestNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    languageId: "avenik",
    topic: "syntax/test",
    explanation: "Test note explanation.",
    examples: [],
    evidencePassageIds: [],
    evidenceCount: 0,
    confidence: "medium",
    status: "draft",
    reviewer: {
      lastReviewedBy: null,
      lastReviewedAt: null,
      comments: []
    },
    dialectScope: "test-default",
    editHistory: [],
    ...overrides
  };
}

export function createTestCorpusPassage(overrides: Partial<CorpusPassage> = {}): CorpusPassage {
  return {
    id: "passage-1",
    languageId: "avenik",
    source: "unit-test",
    sourceMetadata: {
      author: "Test Author",
      year: 2026,
      license: "internal-test-data",
      consentRecord: "unit-test-consent"
    },
    textTarget: "mira talo-mi-na",
    textTranslation: "I walk by the river.",
    morphologicalSegmentation: [
      {
        surface: "mira",
        lemma: "mira",
        gloss: "river",
        features: ["noun"]
      },
      {
        surface: "talo-mi-na",
        lemma: "talo",
        gloss: "walk.present.1sg",
        features: ["verb", "present", "1sg"]
      }
    ],
    topicTags: ["motion"],
    consentStatus: {
      use: "testing-only",
      restrictions: ["unit-test"]
    },
    ...overrides
  };
}

export function createTestCorpusAnswerKey(overrides: Partial<CorpusAnswerKey> = {}): CorpusAnswerKey {
  const passage = createTestCorpusPassage();
  return {
    passageId: passage.id,
    languageId: passage.languageId,
    textTarget: passage.textTarget,
    textTranslation: passage.textTranslation,
    morphologicalSegmentation: passage.morphologicalSegmentation.map((morpheme) => ({
      ...morpheme,
      features: [...morpheme.features]
    })),
    ...overrides
  };
}

export function createTestElderCorrection(overrides: Partial<ElderCorrection> = {}): ElderCorrection {
  return {
    id: "elder-correction-1",
    languageId: "avenik",
    noteId: "note-1",
    correction: "Clarify that tense appears before person in the verb suffix chain.",
    rationale: "Elder review should preserve suffix-order teaching notes.",
    severity: "major",
    status: "pending_review",
    proposedBy: "elder-1",
    proposedAt: "2026-06-06T00:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    ...overrides
  };
}

export function createTestExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "exercise-1",
    languageId: "avenik",
    type: "translate_to_target",
    prompt: "Translate: I walk by the river.",
    allowedVocabulary: ["mira", "talo"],
    allowedRuleIds: ["rule-1"],
    expectedAnswers: ["mira talo-mi-na"],
    adversarialAnswers: [
      {
        answer: "talo mira",
        reason: "Wrong target-language order."
      },
      {
        answer: "mira talo",
        reason: "Missing required verb suffixes."
      }
    ],
    gradingExplanation: "Accepted answer matches the exercise answer key.",
    ...overrides
  };
}

export function createTestSubmission(overrides: Partial<ExerciseSubmission> = {}): ExerciseSubmission {
  return {
    id: "submission-1",
    exerciseId: "exercise-1",
    languageId: "avenik",
    answer: "mira talo-mi-na",
    accepted: true,
    explanation: "Accepted answer matches the exercise answer key.",
    submittedAt: "2026-06-06T00:00:00.000Z",
    learnerId: "learner-1",
    ...overrides
  };
}

export function createTestGovernanceRecord(overrides: Partial<GovernanceRecord> = {}): GovernanceRecord {
  return {
    id: "governance-1",
    languageId: "avenik",
    policyType: "generation",
    content: "Generation policy for local testing.",
    effectiveDate: "2026-06-06",
    approvedBy: "lead-1",
    ...overrides
  };
}

export function createTestAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "audit-test-1",
    at: "2026-06-06T00:00:00.000Z",
    actorId: "lead-1",
    actorRole: "lead",
    action: "governance_record.created",
    entityType: "governance_record",
    entityId: "governance-1",
    languageId: "avenik",
    summary: "Created governance record.",
    metadata: { policyType: "generation" },
    ...overrides
  };
}

export function createTestAiSession(overrides: Partial<AiSession> = {}): AiSession {
  const messages: AiSession["messages"] = [
    {
      id: "ai-session-1-message-1",
      role: "user",
      content: "Trace the note safely.",
      createdAt: "2026-06-06T00:00:00.000Z",
      createdBy: "programmer-1"
    },
    {
      id: "ai-session-1-message-2",
      role: "assistant",
      content: "Safe assistant response.",
      createdAt: "2026-06-06T00:00:00.000Z",
      createdBy: "local-ai"
    }
  ];

  return {
    id: "ai-session-1",
    languageId: "avenik",
    mode: "programmer_debug",
    status: "active",
    createdBy: "programmer-1",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    contextNoteIds: ["note-1"],
    contextPassageIds: ["passage-1"],
    messages,
    thinkingSummary: "Safe reasoning summary: observable trace for session context.",
    trace: [
      {
        id: "ai-session-1-trace-retrieval",
        kind: "retrieval",
        label: "Evidence selection",
        summary: "Linked selected notes and corpus passages as observable evidence.",
        referencedIds: ["note-1", "passage-1"],
        warnings: []
      }
    ],
    neuralMap: {
      nodes: [],
      edges: []
    },
    privacy: {
      redactions: ["hidden-chain-of-thought", "answer-keys"],
      exposesHiddenChainOfThought: false
    },
    ...overrides
  };
}

export function createTestAiMessage(
  overrides: Partial<AiSession["messages"][number]> = {}
): AiSession["messages"][number] {
  return {
    id: "ai-session-1-message-custom",
    role: "user",
    content: "Trace the note safely.",
    createdAt: "2026-06-06T00:00:00.000Z",
    createdBy: "programmer-1",
    ...overrides
  };
}

export function createTestEvaluationRun(overrides: Partial<EvaluationRun> = {}): EvaluationRun {
  return {
    id: "evaluation-run-1",
    languageId: "avenik",
    createdAt: "2026-06-06T00:00:00.000Z",
    systemVersion: "unit-test",
    fixtureVersion: "unit-test",
    scores: {
      noteCoverage: 1,
      noteAccuracy: 1
    },
    failures: [],
    summary: "Evaluation run for unit tests.",
    ...overrides
  };
}

export function createTestDisposition(overrides: Partial<ReviewDisposition> = {}): ReviewDisposition {
  return {
    id: "review-disposition-1",
    languageId: "avenik",
    noteId: "note-1",
    disposition: "escalated",
    status: "open",
    reason: "Escalate for lead review.",
    assignedTo: "lead-1",
    dueAt: "2026-06-20",
    openedAt: "2026-06-06T00:00:00.000Z",
    openedBy: "reviewer-1",
    resolvedAt: null,
    resolvedBy: null,
    resolutionSummary: null,
    ...overrides
  };
}
