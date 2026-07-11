import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";

const apiMock = vi.hoisted(() => ({
  acceptExtractionDraft: vi.fn(),
  activateModelProfile: vi.fn(),
  applyElderCorrection: vi.fn(),
  checkLlmReachability: vi.fn(),
  createAiSession: vi.fn(),
  createLanguage: vi.fn(),
  deleteLanguage: vi.fn(),
  deleteModelProfile: vi.fn(),
  fetchExtractionDrafts: vi.fn(),
  fetchSources: vi.fn(),
  processSource: vi.fn(),
  registerSource: vi.fn(),
  rejectExtractionDraft: vi.fn(),
  uploadSourceFile: vi.fn(),
  fetchAuditEvents: vi.fn(),
  createGovernanceRecord: vi.fn(),
  createExercise: vi.fn(),
  fetchCurrentUser: vi.fn(),
  fetchDashboardData: vi.fn(),
  fetchDiscoveredModels: vi.fn(),
  fetchEvaluationArtifact: vi.fn(),
  fetchExerciseSubmissions: vi.fn(),
  fetchRecommendedExercises: vi.fn(),
  fetchGovernance: vi.fn(),
  fetchLanguageProfile: vi.fn(),
  fetchLanguageSnapshot: vi.fn(),
  fetchLlmStatus: vi.fn(),
  fetchObsidianMcpSettings: vi.fn(),
  fetchObservability: vi.fn(),
  fetchRuntimeSettings: vi.fn(),
  fetchReviewDispositions: vi.fn(),
  fetchReviewPolicy: vi.fn(),
  generateDraftNotes: vi.fn(),
  generateModelDraftNotes: vi.fn(),
  generateModelExercise: vi.fn(),
  importCorpusPassage: vi.fn(),
  importCorpusBulk: vi.fn(),
  resolveReviewDisposition: vi.fn(),
  reviewElderCorrection: vi.fn(),
  runEvaluation: vi.fn(),
  reviewNote: vi.fn(),
  saveModelProfile: vi.fn(),
  submitElderCorrection: vi.fn(),
  fetchElderContext: vi.fn(),
  submitExerciseAnswer: vi.fn(),
  testObsidianMcpConnection: vi.fn(),
  updateObsidianMcpSettings: vi.fn(),
  updateRuntimeSettings: vi.fn(),
  updateReviewPolicy: vi.fn(),
  updateLanguage: vi.fn(),
  validateExerciseAuthoring: vi.fn()
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    ...apiMock
  };
});

export function getApiMock() {
  return apiMock;
}

export const SNAPSHOT_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const EVALUATION_ARTIFACT_HASH = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
export const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];
export function createDashboardData() {
  return {
    languages: [
      {
        id: "avenik",
        name: "Avenik",
        typology: "agglutinative",
        description: "Agglutinative test language.",
        orthography: "Latin",
        status: "active"
      },
      {
        id: "solari",
        name: "Solari",
        typology: "isolating",
        description: "Isolating test language.",
        orthography: "Latin",
        status: "active"
      }
    ],
    corpus: [
      {
        id: "avn-c001",
        languageId: "avenik",
        source: "field-recording",
        sourceMetadata: {
          author: "fixture-author",
          year: 2026,
          license: "cc-by",
          consentRecord: "community-consent-001"
        },
        textTarget: "mira talo-mi-na",
        textTranslation: "I walk by the river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "river", gloss: "river", features: [] },
          { surface: "talo", lemma: "walk", gloss: "walk", features: [] }
        ],
        topicTags: ["movement"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    ],
    notes: [
      {
        id: "avn-rule-verb-chain-note",
        languageId: "avenik",
        topic: "verb chains",
        explanation: "Avenik verbs use transparent suffix chains.",
        examples: [
          {
            passageId: "avn-c001",
            target: "mira talo-mi-na",
            translation: "I walk by the river."
          }
        ],
        evidencePassageIds: ["avn-c001"],
        evidenceCount: 1,
        confidence: "high",
        status: "draft",
        reviewer: {
          lastReviewedBy: "mentor-reviewer",
          lastReviewedAt: "2026-06-02T15:30:00.000Z",
          comments: ["Check suffix boundaries before approval."]
        },
        dialectScope: "baseline",
        editHistory: [
          {
            at: "2026-06-01T12:00:00.000Z",
            by: "draft-agent",
            action: "drafted",
            summary: "Generated from the Avenik grammar fixture."
          }
        ]
      },
      {
        id: "avn-rule-case-note",
        languageId: "avenik",
        topic: "case particles",
        explanation: "Avenik marks oblique roles with postposed particles.",
        examples: [
          {
            passageId: "avn-c004",
            target: "sela mora-ke",
            translation: "The child is near the house."
          }
        ],
        evidencePassageIds: ["avn-c004", "avn-c005"],
        evidenceCount: 2,
        confidence: "medium",
        status: "under_review",
        reviewer: {
          lastReviewedBy: null,
          lastReviewedAt: null,
          comments: []
        },
        dialectScope: "baseline",
        editHistory: [
          {
            at: "2026-06-01T13:00:00.000Z",
            by: "draft-agent",
            action: "revised",
            summary: "Added a second evidence passage."
          }
        ]
      }
    ],
    exercises: [
      {
        id: "avn-ex001",
        languageId: "avenik",
        type: "translate_to_target",
        prompt: "Translate: I walk by the river.",
        allowedVocabulary: ["mira", "talo", "-mi", "-na"],
        allowedRuleIds: ["avn-rule-verb-chain"]
      },
      {
        id: "avn-ex002",
        languageId: "avenik",
        type: "segment",
        prompt: "Segment: nemi-lo-ki",
        allowedVocabulary: ["nemi", "-lo", "-ki"],
        allowedRuleIds: ["avn-rule-verb-chain"]
      }
    ],
    evaluations: [
      {
        id: "eval-1",
        languageId: "avenik",
        createdAt: "2026-06-03T14:00:00.000Z",
        systemVersion: "test",
        fixtureVersion: "test",
        scores: {
          corpusCoverage: 0.9,
          noteQuality: 0.8
        },
        failures: [],
        summary: "Avenik evaluation completed."
      }
    ]
  };
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

export async function selectAvenik() {
  await screen.findByRole("heading", { level: 1, name: "Start" });
  fireEvent.click(screen.getByRole("button", { name: /Avenik.*agglutinative/i }));
  await screen.findByText("Avenik / Start");
}

export async function renderReady() {
  apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
  render(<App />);
  await selectAvenik();
}

export function createLanguageProfile() {
  return {
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Agglutinative test language.",
      orthography: "Latin",
      status: "active"
    },
    vocabulary: [
      { id: "avn-v-001", form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"] },
      { id: "avn-s-001", form: "-mi", gloss: "present tense", partOfSpeech: "suffix", tags: ["tense"] }
    ],
    phonology: {
      consonants: ["p", "t", "k", "s", "m", "n", "l", "y"],
      vowels: ["a", "i", "o", "u"],
      syllableTemplate: "CV",
      stress: "word-initial",
      notes: [
        "Consonant clusters are disallowed inside native roots.",
        "Suffixes attach with explicit hyphen boundaries."
      ]
    },
    grammarRules: [
      {
        id: "avn-rule-verb-chain",
        topic: "morphology/verb/tense-person-suffix-chain",
        explanation: "Avenik finite verbs use root + tense + person suffixes.",
        evidencePassageIds: ["avn-c001", "avn-c002"],
        confidence: "high",
        status: "approved"
      }
    ],
    morphemeInventory: [
      {
        surface: "mira",
        lemma: "mira",
        glosses: ["river"],
        features: ["noun"],
        occurrenceCount: 3,
        passageIds: ["avn-c001", "avn-c004", "avn-c005"],
        vocabulary: {
          id: "avn-n-001",
          form: "mira",
          gloss: "river",
          partOfSpeech: "noun",
          tags: ["place", "nature"]
        }
      },
      {
        surface: "talo-mi-na",
        lemma: "talo",
        glosses: ["walk-present-1sg"],
        features: ["verb", "present", "1sg"],
        occurrenceCount: 1,
        passageIds: ["avn-c001"],
        vocabulary: {
          id: "avn-v-001",
          form: "talo",
          gloss: "walk",
          partOfSpeech: "verb",
          tags: ["motion"]
        }
      }
    ],
    stats: {
      vocabularyItems: 2,
      grammarRules: 1,
      corpusPassages: 1,
      notes: 2,
      exercises: 2,
      sourceAssets: 1,
      pendingExtractionDrafts: 3,
      exerciseTypes: { translate_to_target: 1, segment: 1 }
    }
  };
}

export function createTextSource() {
  return {
    id: "src-1",
    languageId: "avenik",
    kind: "text",
    title: "Field notebook page",
    status: "pending",
    createdBy: "reviewer-1",
    createdAt: "2026-06-08T00:00:00.000Z",
    transcriptAvailable: false
  };
}

export function createAudioSource() {
  return {
    id: "src-2",
    languageId: "avenik",
    kind: "audio",
    title: "Elder recording",
    originalName: "elder.mp3",
    mimeType: "audio/mpeg",
    transcriptAvailable: true,
    status: "processed",
    createdBy: "reviewer-1",
    createdAt: "2026-06-08T00:05:00.000Z",
    processedAt: "2026-06-08T00:10:00.000Z"
  };
}

export function createDeterministicLlmStatus() {
  return {
    provider: "deterministic",
    mode: "deterministic",
    configured: true,
    activeProviderName: "deterministic",
    baseUrl: undefined as string | undefined,
    model: undefined as string | undefined,
    timeoutMs: 180000,
    apiKey: { required: false, configured: false, acceptedVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"] },
    environment: {
      providerVariable: "ASSINI_LLM_PROVIDER",
      baseUrlVariable: "ASSINI_LLM_BASE_URL",
      modelVariable: "ASSINI_LLM_MODEL",
      apiKeyVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"],
      timeoutVariable: "ASSINI_LLM_TIMEOUT_MS"
    },
    setup: {
      localExamples: [
        "ASSINI_LLM_PROVIDER=openai-compatible ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1 ASSINI_LLM_MODEL=llama3.1"
      ],
      remoteExamples: ["ASSINI_LLM_PROVIDER=openai ASSINI_LLM_MODEL=gpt-4o-mini ASSINI_LLM_API_KEY=<server-side-key>"]
    },
    transcription: {
      configured: false,
      baseUrl: undefined as string | undefined,
      model: undefined as string | undefined,
      baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
      modelVariable: "ASSINI_TRANSCRIBE_MODEL"
    },
    ocr: {
      configured: false,
      baseUrl: undefined as string | undefined,
      model: undefined as string | undefined,
      baseUrlVariable: "ASSINI_OCR_BASE_URL",
      modelVariable: "ASSINI_OCR_MODEL"
    },
    warnings: ["No LLM provider configured; using deterministic fallback for safe local development."]
  };
}

export function createRealLlmStatus() {
  return {
    ...createDeterministicLlmStatus(),
    provider: "openai-compatible",
    mode: "local-openai-compatible",
    activeProviderName: "local-openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
    warnings: []
  };
}

export function createModelProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "irene-local",
    name: "Irene local",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "irene-fusion",
    apiKeyConfigured: false,
    timeoutMs: 180000,
    maxTokens: 4096,
    jsonMode: false,
    embeddingBaseUrl: "",
    embeddingModel: "",
    embeddingApiKeyConfigured: false,
    embeddingTimeoutMs: 30000,
    transcriptionBaseUrl: "",
    transcriptionModel: "whisper-1",
    transcriptionApiKeyConfigured: false,
    ocrBaseUrl: "",
    ocrModel: "llava",
    ocrApiKeyConfigured: false,
    ocrLang: "eng",
    allowPrivateUrls: false,
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
    ...overrides
  };
}

export function createRuntimeSettingsResponse(
  status = createDeterministicLlmStatus(),
  extras: {
    profiles?: ReturnType<typeof createModelProfile>[];
    activeProfileId?: string;
  } = {}
) {
  return {
    settings: {
      provider: status.provider,
      baseUrl: status.baseUrl ?? "",
      model: status.model ?? "",
      apiKeyConfigured: status.apiKey.configured,
      timeoutMs: status.timeoutMs,
      maxTokens: 4096,
      jsonMode: false,
      embeddingBaseUrl: "",
      embeddingModel: "",
      embeddingApiKeyConfigured: false,
      embeddingTimeoutMs: 30000,
      transcriptionBaseUrl: "",
      transcriptionModel: "whisper-1",
      transcriptionApiKeyConfigured: false,
      ocrBaseUrl: "",
      ocrModel: "llava",
      ocrApiKeyConfigured: false,
      ocrLang: "eng",
      allowPrivateUrls: false
    },
    status,
    persisted: true,
    profiles: extras.profiles ?? [],
    ...(extras.activeProfileId ? { activeProfileId: extras.activeProfileId } : {})
  };
}

export function createModelDiscoveryResponse(models: unknown[] = [], endpoints: unknown[] = []) {
  return {
    scannedAt: "2026-07-06T00:00:00.000Z",
    models,
    endpoints,
    errors: []
  };
}

export function createTextSourceWithWarnings() {
  return {
    ...createTextSource(),
    status: "processed",
    processedAt: "2026-06-08T00:20:00.000Z",
    warnings: ["Processing fell back to offline heuristics; review extracted drafts carefully."]
  };
}

export function createLexemeDraft() {
  return {
    id: "draft-1",
    languageId: "avenik",
    sourceAssetId: "src-1",
    kind: "lexeme",
    payload: {
      form: "tala",
      gloss: "water",
      partOfSpeech: "noun",
      tags: [],
      morphologicalSegmentation: [],
      topicTags: []
    },
    confidence: "high",
    rationale: "Equals sign indicates a gloss pair.",
    status: "proposed",
    createdAt: "2026-06-08T00:15:00.000Z"
  };
}

export function createGrammarDraft() {
  return {
    id: "draft-2",
    languageId: "avenik",
    sourceAssetId: "src-2",
    kind: "grammar_note",
    payload: {
      tags: [],
      morphologicalSegmentation: [],
      topicTags: [],
      topic: "noun phrases",
      explanation: "Nouns precede their modifiers in elicited speech."
    },
    confidence: "medium",
    rationale: "Pattern repeats across transcript lines.",
    status: "proposed",
    createdAt: "2026-06-08T00:16:00.000Z"
  };
}

export function setupAppTest() {
  apiMock.fetchCurrentUser.mockResolvedValue({ id: "local-reviewer", name: "Local Reviewer", role: "reviewer" });
  apiMock.fetchExerciseSubmissions.mockResolvedValue([]);
  apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
  apiMock.fetchSources.mockResolvedValue([]);
  apiMock.fetchExtractionDrafts.mockResolvedValue([]);
  apiMock.fetchElderContext.mockResolvedValue({
    corpus: createDashboardData().corpus,
    notes: createDashboardData().notes,
    corrections: []
  });
  apiMock.fetchLlmStatus.mockResolvedValue(createDeterministicLlmStatus());
  apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse());
  apiMock.fetchObsidianMcpSettings.mockResolvedValue({
    endpointUrl: "",
    tokenConfigured: false,
    timeoutMs: 15000
  });
  apiMock.updateObsidianMcpSettings.mockResolvedValue({
    endpointUrl: "",
    tokenConfigured: false,
    timeoutMs: 15000
  });
  apiMock.testObsidianMcpConnection.mockResolvedValue({
    configured: false,
    connected: false,
    detail: "Obsidian MCP endpoint is not configured."
  });
  apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse());
  apiMock.updateRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
  apiMock.activateModelProfile.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
  apiMock.saveModelProfile.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
  apiMock.deleteModelProfile.mockResolvedValue(createRuntimeSettingsResponse());
  apiMock.checkLlmReachability.mockResolvedValue({
    reachable: false,
    checked: false,
    mode: "deterministic"
  });
  apiMock.fetchLanguageProfile.mockResolvedValue(createLanguageProfile());
  apiMock.createAiSession.mockResolvedValue({
    messages: [{ role: "assistant", content: "Safe practice prompt from provider." }],
    trace: []
  });
  apiMock.fetchObservability.mockResolvedValue({
    totals: {
      sessions: 0,
      activeSessions: 0,
      messages: 0,
      elderCorrections: 0
    },
    sessions: []
  });
  apiMock.fetchGovernance.mockResolvedValue([
    {
      id: "governance-1",
      languageId: "avenik",
      policyType: "access",
      content: "Only reviewers may approve community notes.",
      effectiveDate: "2026-06-05",
      approvedBy: "lead-1"
    }
  ]);
  apiMock.fetchAuditEvents.mockResolvedValue([]);
  apiMock.fetchReviewPolicy.mockResolvedValue({
    id: "review-policy-avenik",
    languageId: "avenik",
    assignedReviewerIds: ["reviewer-1"],
    approvalThreshold: 1,
    requiresAssignedReviewer: true,
    updatedAt: "2026-06-06T00:00:00.000Z",
    updatedBy: "lead-1"
  });
  apiMock.updateReviewPolicy.mockResolvedValue({
    id: "review-policy-avenik",
    languageId: "avenik",
    assignedReviewerIds: ["reviewer-1", "elder-1"],
    approvalThreshold: 2,
    requiresAssignedReviewer: true,
    updatedAt: "2026-06-06T00:01:00.000Z",
    updatedBy: "lead-1"
  });
  apiMock.fetchReviewDispositions.mockResolvedValue([]);
  apiMock.resolveReviewDisposition.mockResolvedValue({
    id: "review-disposition-1",
    languageId: "avenik",
    noteId: "avn-rule-verb-chain-note",
    disposition: "escalated",
    status: "resolved",
    reason: "Needs Elder confirmation before approval.",
    assignedTo: "elder-1",
    dueAt: "2026-06-20",
    openedAt: "2026-06-06T00:00:00.000Z",
    openedBy: "reviewer-1",
    resolvedAt: "2026-06-06T00:03:00.000Z",
    resolvedBy: "lead-1",
    resolutionSummary: "Resolved from governance review."
  });
  apiMock.createGovernanceRecord.mockResolvedValue({
    id: "governance-2",
    languageId: "avenik",
    policyType: "generation",
    content: "Generated outputs must cite reviewed notes.",
    effectiveDate: "2026-06-06",
    approvedBy: "lead-1"
  });
  apiMock.fetchEvaluationArtifact.mockResolvedValue({
    exportVersion: "evaluation-artifact-v2",
    exportedAt: "2026-06-06T00:00:00.000Z",
    integrity: {
      algorithm: "sha256",
      contentHash: EVALUATION_ARTIFACT_HASH,
      generatedBy: "assini-local-export-v1",
      redactionPolicy: EXPORT_REDACTION_POLICY
    },
    summary: {
      languages: 2,
      totalRuns: 1,
      latestRuns: 1,
      failedLatestRuns: 0,
      regressedLatestRuns: 0,
      improvedLatestRuns: 0,
      stableLatestRuns: 0,
      singleRunLanguages: 1,
      averageLatestScore: 0.85,
      passed: true,
      failureCount: 0
    },
    latestRuns: createDashboardData().evaluations,
    runsByLanguage: { avenik: ["eval-1"] },
    trends: [
      {
        languageId: "avenik",
        latestRunId: "eval-1",
        previousRunId: null,
        latestAverageScore: 0.85,
        previousAverageScore: null,
        averageDelta: null,
        status: "single-run",
        categoryDeltas: {
          corpusCoverage: { latestScore: 0.9, previousScore: null, delta: null },
          noteQuality: { latestScore: 0.8, previousScore: null, delta: null }
        }
      }
    ],
    failureLines: []
  });
  apiMock.fetchLanguageSnapshot.mockResolvedValue({
    exportVersion: "language-snapshot-v2",
    exportedAt: "2026-06-06T00:00:00.000Z",
    integrity: {
      algorithm: "sha256",
      contentHash: SNAPSHOT_HASH,
      generatedBy: "assini-local-export-v1",
      redactionPolicy: EXPORT_REDACTION_POLICY
    },
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Agglutinative test language.",
      orthography: "Latin",
      status: "active"
    },
    linguisticProfile: {
      phonology: {
        consonants: ["p", "t", "k"],
        vowels: ["a", "i", "o"],
        syllableTemplate: "CV",
        stress: "word-initial",
        notes: ["Consonant clusters are disallowed inside native roots."]
      },
      vocabulary: [
        { id: "avn-s-001", form: "-mi", gloss: "present tense", partOfSpeech: "suffix", tags: ["tense"] },
        { id: "avn-v-001", form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"] }
      ],
      morphemeInventory: [],
      grammarRules: [
        {
          id: "avn-rule-verb-chain",
          topic: "morphology/verb/tense-person-suffix-chain",
          explanation: "Avenik finite verbs use root + tense + person suffixes.",
          evidencePassageIds: ["avn-c001"],
          confidence: "high",
          status: "approved"
        }
      ],
      stats: {
        vocabularyItems: 2,
        grammarRules: 1,
        corpusPassages: 1,
        notes: 2,
        exercises: 2,
        sourceAssets: 1,
        pendingExtractionDrafts: 0,
        exerciseTypes: { translate_to_target: 1, segment: 1 }
      }
    },
    corpus: createDashboardData().corpus,
    notes: createDashboardData().notes,
    exercises: createDashboardData().exercises,
    governance: [
      {
        id: "governance-1",
        languageId: "avenik",
        policyType: "access",
        content: "Only reviewers may approve community notes.",
        effectiveDate: "2026-06-05",
        approvedBy: "lead-1"
      }
    ],
    evaluations: createDashboardData().evaluations
  });
  apiMock.generateDraftNotes.mockResolvedValue([]);
  apiMock.generateModelDraftNotes.mockResolvedValue({ notes: [], warnings: [], generated: 0 });
  apiMock.generateModelExercise.mockResolvedValue({
    exercise: {
      type: "translate_to_target",
      prompt: "",
      allowedVocabulary: [],
      allowedRuleIds: [],
      expectedAnswers: [],
      adversarialAnswers: [],
      gradingExplanation: ""
    },
    warnings: []
  });
  apiMock.runEvaluation.mockResolvedValue([]);
  apiMock.reviewNote.mockResolvedValue({});
  apiMock.submitExerciseAnswer.mockResolvedValue({
    accepted: true,
    explanation: "Accepted exercise submission."
  });
}

export function cleanupAppTest() {
  cleanup();
  delete (window as any).assiniDesktop;
  delete (window.navigator as any).clipboard;
  vi.restoreAllMocks();
  vi.clearAllMocks();
}
