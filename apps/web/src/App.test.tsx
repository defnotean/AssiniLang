import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, getInitialTheme } from "./App";
import { ApiError } from "./lib/apiClient";

const apiMock = vi.hoisted(() => ({
  acceptExtractionDraft: vi.fn(),
  applyElderCorrection: vi.fn(),
  checkLlmReachability: vi.fn(),
  createAiSession: vi.fn(),
  createLanguage: vi.fn(),
  deleteLanguage: vi.fn(),
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
  fetchObservability: vi.fn(),
  fetchRuntimeSettings: vi.fn(),
  fetchReviewDispositions: vi.fn(),
  fetchReviewPolicy: vi.fn(),
  generateDraftNotes: vi.fn(),
  generateModelDraftNotes: vi.fn(),
  generateModelExercise: vi.fn(),
  importCorpusPassage: vi.fn(),
  resolveReviewDisposition: vi.fn(),
  reviewElderCorrection: vi.fn(),
  runEvaluation: vi.fn(),
  reviewNote: vi.fn(),
  submitElderCorrection: vi.fn(),
  fetchElderContext: vi.fn(),
  submitExerciseAnswer: vi.fn(),
  updateRuntimeSettings: vi.fn(),
  updateReviewPolicy: vi.fn(),
  validateExerciseAuthoring: vi.fn()
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    ...apiMock
  };
});

const SNAPSHOT_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const EVALUATION_ARTIFACT_HASH = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];
function createDashboardData() {
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function selectAvenik() {
  await screen.findByRole("heading", { level: 1, name: "Start" });
  fireEvent.click(screen.getByRole("button", { name: /Avenik.*agglutinative/i }));
  await screen.findByText("Avenik / Start");
}

async function renderReady() {
  apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
  render(<App />);
  await selectAvenik();
}

function createLanguageProfile() {
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

function createTextSource() {
  return {
    id: "src-1",
    languageId: "avenik",
    kind: "text",
    title: "Field notebook page",
    rawText: "tala = water",
    status: "pending",
    createdBy: "reviewer-1",
    createdAt: "2026-06-08T00:00:00.000Z"
  };
}

function createAudioSource() {
  return {
    id: "src-2",
    languageId: "avenik",
    kind: "audio",
    title: "Elder recording",
    originalName: "elder.mp3",
    mimeType: "audio/mpeg",
    filePath: "uploads/elder.mp3",
    transcript: "tala mira",
    status: "processed",
    createdBy: "reviewer-1",
    createdAt: "2026-06-08T00:05:00.000Z",
    processedAt: "2026-06-08T00:10:00.000Z"
  };
}

function createDeterministicLlmStatus() {
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
      localExamples: ["ASSINI_LLM_PROVIDER=openai-compatible ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1 ASSINI_LLM_MODEL=llama3.1"],
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

function createRealLlmStatus() {
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

function createRuntimeSettingsResponse(status = createDeterministicLlmStatus()) {
  return {
    settings: {
      provider: status.provider,
      baseUrl: status.baseUrl ?? "",
      model: status.model ?? "",
      apiKeyConfigured: status.apiKey.configured,
      timeoutMs: status.timeoutMs,
      maxTokens: 4096,
      jsonMode: false,
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
    persisted: true
  };
}

function createModelDiscoveryResponse(models: unknown[] = [], endpoints: unknown[] = []) {
  return {
    scannedAt: "2026-07-06T00:00:00.000Z",
    models,
    endpoints,
    errors: []
  };
}

function createTextSourceWithWarnings() {
  return {
    ...createTextSource(),
    status: "processed",
    processedAt: "2026-06-08T00:20:00.000Z",
    warnings: ["Processing fell back to offline heuristics; review extracted drafts carefully."]
  };
}

function createLexemeDraft() {
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

function createGrammarDraft() {
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

describe("App", () => {
  beforeEach(() => {
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
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse());
    apiMock.updateRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
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
  });

  afterEach(() => {
    cleanup();
    delete (window as any).assiniDesktop;
    delete (window.navigator as any).clipboard;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders the Atlas language sidebar, local prototype notice, and corpus surface", async () => {
    await renderReady();

    expect(await screen.findByText("Local Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Local prototype")).toBeInTheDocument();
    expect(screen.getByText("all data stays on this machine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Avenik.*agglutinative/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Solari.*isolating/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Build" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corpus Browser" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Note Review Queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Model Setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Corpus passages" })).toBeInTheDocument();
    expect(screen.getByText("mira talo-mi-na")).toBeInTheDocument();
    expect(apiMock.fetchCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("reads the initial theme from injected browser storage without requiring Node web storage", () => {
    expect(getInitialTheme({ getItem: () => "light" })).toBe("light");
    expect(getInitialTheme({ getItem: () => "dark" })).toBe("dark");
    expect(getInitialTheme({ getItem: () => "unexpected" })).toBe("dark");
    expect(getInitialTheme()).toBe("dark");
  });

  it("exposes theme toggle pressed state and flips the document theme", async () => {
    await renderReady();

    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(toggle);

    const lightToggle = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(lightToggle).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(lightToggle).toHaveTextContent("Dark");

    fireEvent.click(lightToggle);

    const darkToggle = screen.getByRole("button", { name: "Switch to light theme" });
    expect(darkToggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("filters corpus passages and renders morpheme chips from API data", async () => {
    await renderReady();

    const search = screen.getByRole("searchbox", { name: "Search corpus" });
    fireEvent.change(search, { target: { value: "river" } });

    expect(screen.getByText("1 of 1 passages")).toBeInTheDocument();
    expect(screen.getByText("mira")).toBeInTheDocument();
    expect(screen.getByText("river")).toBeInTheDocument();
    expect(screen.getByText("talo")).toBeInTheDocument();
    expect(screen.getByText("walk")).toBeInTheDocument();
  });

  it("imports corpus passages from the Start and refreshes the source list", async () => {
    const initialData = createDashboardData();
    const createdPassage = {
      id: "imported-corpus-avenik-2",
      languageId: "avenik",
      source: "field-lab",
      sourceMetadata: {
        author: "reviewer-1",
        year: 2026,
        license: "cc-by",
        consentRecord: "local-review"
      },
      textTarget: "mira lumo-ke talo-mi-na",
      textTranslation: "I walk by the river near the practice mat.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "river", gloss: "river", features: ["noun"] },
        { surface: "lumo-ke", lemma: "practice mat", gloss: "mat-near", features: ["locative"] },
        { surface: "talo-mi-na", lemma: "walk", gloss: "walk-present-1sg", features: ["present", "1sg"] }
      ],
      topicTags: ["movement", "locative"],
      consentStatus: {
        use: "community-approved" as const,
        restrictions: ["internal-only"]
      }
    };

    apiMock.fetchDashboardData
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce({
        ...initialData,
        corpus: [...initialData.corpus, createdPassage]
      });
    apiMock.importCorpusPassage.mockResolvedValue(createdPassage);

    render(<App />);
    await selectAvenik();

    fireEvent.click(screen.getByRole("button", { name: /add source passage/i }));
    fireEvent.change(screen.getByLabelText("Corpus target text"), {
      target: { value: "mira lumo-ke talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("English translation"), {
      target: { value: "I walk by the river near the practice mat." }
    });
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "field-lab" }
    });
    fireEvent.change(screen.getByLabelText("Author"), {
      target: { value: "reviewer-1" }
    });
    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2026" }
    });
    fireEvent.change(screen.getByLabelText("License"), {
      target: { value: "cc-by" }
    });
    fireEvent.change(screen.getByLabelText("Consent record"), {
      target: { value: "local-review" }
    });
    fireEvent.change(screen.getByLabelText("Topic tags"), {
      target: { value: "movement, locative" }
    });
    fireEvent.change(screen.getByLabelText("Morpheme segmentation"), {
      target: {
        value: [
          "mira | river | river | noun",
          "lumo-ke | practice mat | mat-near | locative",
          "talo-mi-na | walk | walk-present-1sg | present, 1sg"
        ].join("\n")
      }
    });
    fireEvent.change(screen.getByLabelText("Access restrictions"), {
      target: { value: "internal-only" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import passage" }));

    await waitFor(() => expect(apiMock.importCorpusPassage).toHaveBeenCalledWith("avenik", {
      source: "field-lab",
      sourceMetadata: {
        author: "reviewer-1",
        year: 2026,
        license: "cc-by",
        consentRecord: "local-review"
      },
      textTarget: "mira lumo-ke talo-mi-na",
      textTranslation: "I walk by the river near the practice mat.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "river", gloss: "river", features: ["noun"] },
        { surface: "lumo-ke", lemma: "practice mat", gloss: "mat-near", features: ["locative"] },
        { surface: "talo-mi-na", lemma: "walk", gloss: "walk-present-1sg", features: ["present", "1sg"] }
      ],
      topicTags: ["movement", "locative"],
      consentStatus: {
        use: "community-approved",
        restrictions: ["internal-only"]
      }
    }));
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
    expect(await screen.findByText("Corpus passage imported.")).toBeInTheDocument();
    expect(await screen.findByText("mira lumo-ke talo-mi-na")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 passages")).toBeInTheDocument();
  });

  it("announces loading state through a live status region", async () => {
    const initialLoad = createDeferred<ReturnType<typeof createDashboardData>>();
    apiMock.fetchDashboardData.mockReturnValue(initialLoad.promise);

    render(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading workspace...");

    initialLoad.resolve(createDashboardData());
    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
  });

  it("announces load errors through an alert region", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Workspace data unavailable"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace data unavailable");
  });

  it("localizes expired prototype sessions when dashboard load is unauthorized", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(
      new ApiError("Request failed: /dashboard (401): Unauthorized", { status: 401 })
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
  });

  it("does not show desktop reconnect guidance for expired sessions in AssiniLang Desktop", async () => {
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        authToken: "desktop-token",
        prototypeAuth: true
      }
    });
    apiMock.fetchDashboardData.mockRejectedValue(
      new ApiError("Request failed: /dashboard (401): Unauthorized", { status: 401 })
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
    expect(screen.queryByText(
      "AssiniLang Desktop could not reach the local API. Restart the app or open Settings → Desktop app to verify the data folder."
    )).not.toBeInTheDocument();
  });

  it("shows desktop reconnect guidance when the workspace fails to load in AssiniLang Desktop", async () => {
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        authToken: "desktop-token",
        prototypeAuth: true
      }
    });
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Could not connect to the local API"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect to the local API");
    expect(screen.getByText(
      "AssiniLang Desktop could not reach the local API. Restart the app or open Settings → Desktop app to verify the data folder."
    )).toBeInTheDocument();
  });

  it("shows a desktop offline banner when the browser reports no network", async () => {
    const onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false
    });
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        authToken: "desktop-token",
        prototypeAuth: true
      }
    });

    await renderReady();

    const banner = screen.getByText("Network offline").closest("[role='status']");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveTextContent(
      "AssiniLang Desktop keeps data local, but the workspace needs the embedded API. Reconnect, then press Retry if loading fails."
    );

    if (onlineDescriptor) {
      Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
    }
  });

  it("navigates between the four simplified tabs", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Build" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Review queue" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Registered sources" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Extraction draft queue" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Practice" })).toBeInTheDocument();
    expect(screen.getByLabelText("Exercise answer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run System Eval" })).toBeInTheDocument();
    expect(screen.getByText("Avenik evaluation completed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Data Stewardship Policy" })).toBeInTheDocument();
    expect(await screen.findByText("Only reviewers may approve community notes.")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "LLM provider readiness" })).toBeInTheDocument();
  });

  it("renders the simplified Start overview with saved examples", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
    expect(apiMock.fetchLanguageProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Language overview" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saved examples" })).toBeInTheDocument();
    expect(screen.getByText("Agglutinative test language.")).toBeInTheDocument();
    expect(screen.getByText("Read and search what you have")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Corpus passages" })).toBeInTheDocument();
    expect(screen.getByText("mira talo-mi-na")).toBeInTheDocument();
  });

  it("does not require language profile data to render Start", async () => {
    apiMock.fetchLanguageProfile.mockResolvedValue({
      ...createLanguageProfile(),
      phonology: null
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Start" })).toBeInTheDocument();
    expect(apiMock.fetchLanguageProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Saved examples" })).toBeInTheDocument();
  });

  it("renders registered sources and the extraction draft queue for the selected language", async () => {
    apiMock.fetchSources.mockResolvedValue([createTextSource(), createAudioSource()]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([createLexemeDraft(), createGrammarDraft()]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Build" })).toBeInTheDocument();
    const sourcesRegion = await screen.findByRole("region", { name: "Registered sources" });
    await waitFor(() => expect(apiMock.fetchSources).toHaveBeenCalledWith("avenik"));
    expect(apiMock.fetchExtractionDrafts).toHaveBeenCalledWith("avenik", "proposed");
    expect(within(sourcesRegion).getByText("2 sources")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("Field notebook page")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("Elder recording")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("text")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("audio")).toBeInTheDocument();
    expect(within(sourcesRegion).getByText("transcript ready")).toBeInTheDocument();

    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(within(draftQueue).getByText("2 proposed drafts")).toBeInTheDocument();
    expect(within(draftQueue).getByText("tala — water")).toBeInTheDocument();
    expect(within(draftQueue).getByText("high confidence")).toBeInTheDocument();
    expect(within(draftQueue).getByText("Equals sign indicates a gloss pair.")).toBeInTheDocument();
    expect(within(draftQueue).getByText("noun phrases — Nouns precede their modifiers in elicited speech.")).toBeInTheDocument();
    expect(within(draftQueue).getByText("medium confidence")).toBeInTheDocument();
  });

  it("renders per-source processing warnings only for sources that carry them", async () => {
    apiMock.fetchSources.mockResolvedValue([createTextSourceWithWarnings(), createAudioSource()]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const sourcesRegion = await screen.findByRole("region", { name: "Registered sources" });
    await waitFor(() => expect(apiMock.fetchSources).toHaveBeenCalledWith("avenik"));

    const warnedSource = within(sourcesRegion).getByRole("list", {
      name: "Processing warnings for Field notebook page"
    });
    expect(
      within(warnedSource).getByText(
        "Processing fell back to offline heuristics; review extracted drafts carefully."
      )
    ).toBeInTheDocument();

    expect(
      within(sourcesRegion).queryByRole("list", { name: "Processing warnings for Elder recording" })
    ).not.toBeInTheDocument();
  });

  it("registers a text source from the intake form and refreshes the source list", async () => {
    apiMock.fetchSources
      .mockResolvedValueOnce([])
      .mockResolvedValue([createTextSource()]);
    apiMock.registerSource.mockResolvedValue(createTextSource());

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const intakeForm = await screen.findByRole("form", { name: "Register source" });
    fireEvent.change(within(intakeForm).getByLabelText("Source kind"), { target: { value: "text" } });
    fireEvent.change(within(intakeForm).getByLabelText("Source title"), {
      target: { value: "Field notebook page" }
    });
    fireEvent.change(within(intakeForm).getByLabelText("Raw text"), {
      target: { value: "tala = water" }
    });
    fireEvent.click(within(intakeForm).getByRole("button", { name: "Register source" }));

    await waitFor(() => expect(apiMock.registerSource).toHaveBeenCalledWith("avenik", {
      kind: "text",
      title: "Field notebook page",
      rawText: "tala = water"
    }));
    expect(await screen.findByText("Source registered: Field notebook page.")).toBeInTheDocument();
    const sourcesRegion = screen.getByRole("region", { name: "Registered sources" });
    expect(await within(sourcesRegion).findByText("Field notebook page")).toBeInTheDocument();
  });

  it("uploads a source file and lets the API decide the source kind", async () => {
    apiMock.fetchSources
      .mockResolvedValueOnce([])
      .mockResolvedValue([createAudioSource()]);
    apiMock.uploadSourceFile.mockResolvedValue(createAudioSource());

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const uploadForm = await screen.findByRole("form", { name: "Upload source file" });
    const file = new File(["audio-bytes"], "elder.mp3", { type: "audio/mpeg" });
    fireEvent.change(within(uploadForm).getByLabelText("Upload title (optional)"), {
      target: { value: "Elder recording" }
    });
    fireEvent.change(within(uploadForm).getByLabelText("Source file"), {
      target: { files: [file] }
    });
    fireEvent.click(within(uploadForm).getByRole("button", { name: "Upload source file" }));

    await waitFor(() => expect(apiMock.uploadSourceFile).toHaveBeenCalledWith("avenik", file, "Elder recording"));
    expect(await screen.findByText("File uploaded as audio source: Elder recording.")).toBeInTheDocument();
    const sourcesRegion = screen.getByRole("region", { name: "Registered sources" });
    expect(await within(sourcesRegion).findByText("Elder recording")).toBeInTheDocument();
  });

  it("starts background processing, polls until the source is processed, and refreshes the draft queue", async () => {
    apiMock.fetchSources
      .mockResolvedValueOnce([createTextSource()])
      .mockResolvedValue([{ ...createTextSource(), status: "processed" }]);
    apiMock.fetchExtractionDrafts
      .mockResolvedValueOnce([])
      .mockResolvedValue([createLexemeDraft()]);
    apiMock.processSource.mockResolvedValue({
      asset: { ...createTextSource(), status: "processing" },
      drafts: [],
      warnings: []
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Process Field notebook page" }));

    await waitFor(() => expect(apiMock.processSource).toHaveBeenCalledWith("src-1", { async: true }));
    expect(await screen.findByText("Processing Field notebook page finished.")).toBeInTheDocument();
    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(await within(draftQueue).findByText("tala — water")).toBeInTheDocument();
    expect(apiMock.fetchSources).toHaveBeenLastCalledWith("avenik");
    expect(apiMock.fetchExtractionDrafts).toHaveBeenLastCalledWith("avenik", "proposed");
    const sourcesRegion = screen.getByRole("region", { name: "Registered sources" });
    expect(within(sourcesRegion).getByRole("button", { name: "Process Field notebook page" })).toBeEnabled();
  });

  it("keeps the source marked as processing while polling and surfaces the stored error on failure", async () => {
    const pendingPoll = createDeferred<unknown>();
    apiMock.fetchSources
      .mockResolvedValueOnce([createTextSource()])
      .mockImplementationOnce(() => pendingPoll.promise)
      .mockResolvedValue([{
        ...createTextSource(),
        status: "failed",
        error: "The document contains no extractable text."
      }]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.processSource.mockResolvedValue({
      asset: { ...createTextSource(), status: "processing" },
      drafts: [],
      warnings: []
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Process Field notebook page" }));

    await waitFor(() => expect(apiMock.processSource).toHaveBeenCalledWith("src-1", { async: true }));

    // The first poll is still in flight: the row stays busy and disabled.
    await waitFor(() => expect(apiMock.fetchSources).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Processing..." })).toBeDisabled();

    // The poll reports "processing", so polling continues; the next poll
    // returns the stored failure.
    pendingPoll.resolve([{ ...createTextSource(), status: "processing" }]);

    const failureMessages = await screen.findAllByText(
      "The document contains no extractable text.",
      undefined,
      { timeout: 4000 }
    );
    expect(failureMessages.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Process Field notebook page" })).toBeEnabled();
  }, 10000);

  it("surfaces the localized max-attempt error through the App ingest flow", async () => {
    const MAX_ATTEMPTS = 5;
    apiMock.fetchSources.mockResolvedValue([{
      ...createTextSource(),
      status: "failed",
      processingAttempts: MAX_ATTEMPTS
    }]);
    apiMock.fetchExtractionDrafts.mockResolvedValue([]);
    apiMock.processSource.mockRejectedValue(
      new ApiError(`Source processing attempt limit reached (${MAX_ATTEMPTS}).`, {
        status: 409,
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: MAX_ATTEMPTS, count: MAX_ATTEMPTS }
      })
    );

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Process Field notebook page" }));

    expect(await screen.findByText(
      `Processing stopped after ${MAX_ATTEMPTS} attempts. Review the source error or contact an operator.`
    )).toBeInTheDocument();
  });

  it("shows a duplicate warning badge on flagged drafts and none on unflagged drafts", async () => {
    apiMock.fetchExtractionDrafts.mockResolvedValue([
      { ...createLexemeDraft(), duplicate: { kind: "exact", entityId: "lex-9" } },
      createGrammarDraft()
    ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const draftQueue = await screen.findByRole("region", { name: "Extraction draft queue" });
    const flaggedRow = await within(draftQueue).findByRole("article", { name: "Extraction draft draft-1" });
    expect(within(flaggedRow).getByText("Duplicate of existing entry")).toBeInTheDocument();

    const unflaggedRow = within(draftQueue).getByRole("article", { name: "Extraction draft draft-2" });
    expect(
      within(unflaggedRow).queryByText(/Duplicate of existing entry|Same form, different gloss|Duplicate topic|Duplicates another pending draft/)
    ).not.toBeInTheDocument();
  });

  it("accepts a proposed extraction draft and refreshes the queue", async () => {
    apiMock.fetchExtractionDrafts
      .mockResolvedValueOnce([createLexemeDraft()])
      .mockResolvedValue([]);
    apiMock.acceptExtractionDraft.mockResolvedValue({
      draft: { ...createLexemeDraft(), status: "accepted", committedEntityId: "lex-1" },
      entity: {
        id: "lex-1",
        languageId: "avenik",
        form: "tala",
        gloss: "water",
        partOfSpeech: "noun",
        tags: [],
        sourceAssetIds: ["src-1"]
      }
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Accept draft draft-1" }));

    await waitFor(() => expect(apiMock.acceptExtractionDraft).toHaveBeenCalledWith("draft-1"));
    expect(await screen.findByText("Draft accepted: Lexeme committed.")).toBeInTheDocument();
    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(await within(draftQueue).findByText("0 proposed drafts")).toBeInTheDocument();
    expect(apiMock.rejectExtractionDraft).not.toHaveBeenCalled();
  });

  it("rejects a proposed extraction draft and refreshes the queue", async () => {
    apiMock.fetchExtractionDrafts
      .mockResolvedValueOnce([createGrammarDraft()])
      .mockResolvedValue([]);
    apiMock.rejectExtractionDraft.mockResolvedValue({
      ...createGrammarDraft(),
      status: "rejected"
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Reject draft draft-2" }));

    await waitFor(() => expect(apiMock.rejectExtractionDraft).toHaveBeenCalledWith("draft-2"));
    expect(await screen.findByText("Draft rejected: Grammar note.")).toBeInTheDocument();
    const draftQueue = screen.getByRole("region", { name: "Extraction draft queue" });
    expect(await within(draftQueue).findByText("0 proposed drafts")).toBeInTheDocument();
    expect(apiMock.acceptExtractionDraft).not.toHaveBeenCalled();
  });

  it("creates a language from the sidebar and selects the new workspace", async () => {
    const createdLanguage = {
      id: "rivertongue",
      name: "Rivertongue",
      typology: "isolating",
      description: "Community river language.",
      orthography: "Latin",
      status: "draft"
    };
    apiMock.createLanguage.mockResolvedValue(createdLanguage);
    apiMock.fetchDashboardData.mockImplementation(async (languageId?: string) => {
      const base = createDashboardData();
      if (languageId === "rivertongue") {
        return {
          ...base,
          languages: [...base.languages, createdLanguage],
          corpus: [],
          notes: [],
          exercises: []
        };
      }
      return base;
    });

    render(<App />);
    await screen.findByText("Avenik / Start");

    fireEvent.click(screen.getByRole("button", { name: "New language" }));
    const createForm = await screen.findByRole("form", { name: "Create language" });
    fireEvent.change(within(createForm).getByLabelText("Language name"), {
      target: { value: "Rivertongue" }
    });
    fireEvent.change(within(createForm).getByLabelText("Description"), {
      target: { value: "Community river language." }
    });
    fireEvent.change(within(createForm).getByLabelText("Orthography"), {
      target: { value: "Latin" }
    });
    fireEvent.change(within(createForm).getByLabelText("Typology"), {
      target: { value: "isolating" }
    });
    fireEvent.click(within(createForm).getByRole("button", { name: "Create language" }));

    await waitFor(() => expect(apiMock.createLanguage).toHaveBeenCalledWith({
      name: "Rivertongue",
      description: "Community river language.",
      orthography: "Latin",
      typology: "isolating"
    }));
    await waitFor(() => expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("rivertongue"));
    expect(await screen.findByText("Rivertongue / Start")).toBeInTheDocument();
  });

  it("deletes a language from the sidebar after name confirmation", async () => {
    let deleted = false;
    apiMock.deleteLanguage.mockImplementation(async (languageId: string) => {
      deleted = true;
      return {
        id: languageId,
        name: "Avenik",
        deleted: true as const
      };
    });
    apiMock.fetchDashboardData.mockImplementation(async (languageId?: string) => {
      const base = createDashboardData();
      if (deleted && languageId === undefined) {
        return {
          ...base,
          languages: [],
          corpus: [],
          notes: [],
          exercises: []
        };
      }
      return base;
    });

    render(<App />);
    await selectAvenik();

    fireEvent.click(screen.getByRole("button", { name: "Delete language" }));
    const deleteForm = await screen.findByRole("form", { name: "Delete language" });
    fireEvent.change(within(deleteForm).getByLabelText("Type the language name to confirm"), {
      target: { value: "Avenik" }
    });
    fireEvent.click(within(deleteForm).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(apiMock.deleteLanguage).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(apiMock.fetchDashboardData).toHaveBeenCalled());
  });

  it("runs a model provider smoke test without exposing browser-side keys", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    await waitFor(() => expect(apiMock.createAiSession).toHaveBeenCalledWith({
      languageId: "avenik",
      mode: "learner_practice",
      seedPrompt: "Create one concise, safe practice prompt using only the provided public workspace context.",
      contextNoteIds: ["avn-rule-verb-chain-note", "avn-rule-case-note"],
      contextPassageIds: ["avn-c001"]
    }));
    expect(await screen.findByText("Safe practice prompt from provider.")).toBeInTheDocument();
  });

  it("flags the smoke-test result as an offline placeholder in deterministic mode", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    expect(await screen.findByText("Safe practice prompt from provider.")).toBeInTheDocument();
    expect(await screen.findByText(/Offline placeholder/)).toBeInTheDocument();
    expect(
      screen.getByText(/no model is configured, so this is a canned response, not a real model reply/)
    ).toBeInTheDocument();
  });

  it("treats the smoke-test result as a real model reply when a provider is configured", async () => {
    apiMock.fetchLlmStatus.mockResolvedValue(createRealLlmStatus());
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
    apiMock.createAiSession.mockResolvedValue({
      messages: [{ role: "assistant", content: "Genuine model practice prompt." }],
      trace: []
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    expect(await screen.findByText("Genuine model practice prompt.")).toBeInTheDocument();
    expect(screen.queryByText(/Offline placeholder/)).not.toBeInTheDocument();
  });

  it("saves runtime model settings from the Settings screen", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Provider"), {
      target: { value: "openai-compatible" }
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "http://127.0.0.1:11434/v1" }
    });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "irene-fusion" }
    });
    fireEvent.change(screen.getByLabelText("Replace API key"), {
      target: { value: "local-secret" }
    });
    fireEvent.change(screen.getByLabelText("Timeout"), {
      target: { value: "180000" }
    });
    fireEvent.change(screen.getByLabelText("Max tokens"), {
      target: { value: "8192" }
    });
    fireEvent.click(screen.getByLabelText("JSON mode"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "irene-fusion",
      apiKey: "local-secret",
      timeoutMs: 180000,
      maxTokens: 8192,
      jsonMode: true
    })));
    expect(await screen.findByText("Settings saved and applied.")).toBeInTheDocument();
  });

  it("surfaces desktop shell actions in the Settings screen", async () => {
    const openDataFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened data folder." });
    const openSettingsFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened settings folder." });
    const openBackupsFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened backups folder." });
    const openAppFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened app folder." });
    const openDiagnosticsFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened diagnostics folder." });
    const openLatestBackupFolder = vi.fn().mockResolvedValue({ ok: true, message: "Opened latest backup backup-2026-07-07T21-00-00-000Z." });
    const resetWindowLayout = vi.fn().mockResolvedValue({ ok: true, message: "Reset window layout." });
    const pruneOldDataBackups = vi.fn().mockImplementation(async () => {
      currentBackupSummary = {
        ...currentBackupSummary,
        count: 5
      };
      return { ok: true, message: "Pruned 1 old backup.", backupSummary: currentBackupSummary };
    });
    let currentShortcutSummary = {
      desktopExists: false,
      desktopPath: "C:\\Users\\Demon\\Desktop\\AssiniLang.lnk",
      startMenuExists: false,
      startMenuPath: "C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk"
    };
    const createDesktopShortcut = vi.fn().mockImplementation(async () => {
      currentShortcutSummary = {
        ...currentShortcutSummary,
        desktopExists: true
      };
      return { ok: true, message: "Created desktop shortcut.", shortcutSummary: currentShortcutSummary };
    });
    const createStartMenuShortcut = vi.fn().mockImplementation(async () => {
      currentShortcutSummary = {
        ...currentShortcutSummary,
        startMenuExists: true
      };
      return { ok: true, message: "Created Start Menu shortcut.", shortcutSummary: currentShortcutSummary };
    });
    const createAppShortcuts = vi.fn().mockImplementation(async () => {
      currentShortcutSummary = {
        ...currentShortcutSummary,
        desktopExists: true,
        startMenuExists: true
      };
      return { ok: true, message: "Created app shortcuts.", shortcutSummary: currentShortcutSummary };
    });
    let currentBackupSummary = {
      backupsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups",
      count: 1,
      latestCreatedAt: "2026-07-07T20:00:00.000Z",
      latestName: "backup-2026-07-07T20-00-00-000Z",
      latestPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups\\backup-2026-07-07T20-00-00-000Z"
    };
    const createDataBackup = vi.fn().mockImplementation(async () => {
      currentBackupSummary = {
        ...currentBackupSummary,
        count: 6,
        latestCreatedAt: "2026-07-07T21:00:00.000Z",
        latestName: "backup-2026-07-07T21-00-00-000Z",
        latestPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups\\backup-2026-07-07T21-00-00-000Z"
      };
      return { ok: true, message: "Created backup at C:\\Backups\\assini.", backupSummary: currentBackupSummary };
    });
    const restoreLatestDataBackup = vi.fn().mockResolvedValue({
      ok: true,
      message: "Restored latest backup. Reloading workspace...",
      backupSummary: currentBackupSummary
    });
    const refreshBackupSummary = vi.fn().mockImplementation(async () => ({ ok: true, backupSummary: currentBackupSummary }));
    const refreshShortcutSummary = vi.fn().mockImplementation(async () => ({ ok: true, shortcutSummary: currentShortcutSummary }));
    const saveDiagnosticsReport = vi.fn().mockResolvedValue({
      ok: true,
      message: "Saved diagnostics report at C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics\\diagnostics-2026-07-07.txt",
      diagnosticsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
      diagnosticsPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics\\diagnostics-2026-07-07.txt"
    });
    let currentDesktopPreferences = {
      hideToTray: false,
      hideToTraySupported: true,
      launchAtLogin: false,
      launchAtLoginSupported: true
    };
    const setDesktopPreferences = vi.fn().mockImplementation(async (patch) => {
      currentDesktopPreferences = {
        ...currentDesktopPreferences,
        ...patch
      };
      return {
        ok: true,
        message: "Desktop preference saved.",
        preferences: currentDesktopPreferences
      };
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    apiMock.fetchLlmStatus.mockResolvedValue(createRealLlmStatus());
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse(createRealLlmStatus()));
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse([
      {
        id: "openai-compatible|http://127.0.0.1:11434/v1|llama3.1",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        source: "Requested endpoint",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
        requiresApiKey: false
      }
    ], [
      {
        source: "Requested endpoint",
        baseUrl: "http://127.0.0.1:11434/v1",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        connected: true,
        modelCount: 1,
        status: 200
      }
    ]));
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    Object.defineProperty(window, "assiniDesktop", {
      configurable: true,
      value: {
        apiBaseUrl: "http://127.0.0.1:4567",
        appFolder: "C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang",
        appPath: "C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang\\AssiniLang.exe",
        appVersion: "0.1.0",
        authToken: "desktop-token",
        get backupSummary() {
          return currentBackupSummary;
        },
        createAppShortcuts,
        createDataBackup,
        createDesktopShortcut,
        createStartMenuShortcut,
        dataDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data",
        diagnosticsDir: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics",
        get desktopPreferences() {
          return currentDesktopPreferences;
        },
        isPackaged: true,
        openAppFolder,
        openBackupsFolder,
        openDataFolder,
        openDiagnosticsFolder,
        openLatestBackupFolder,
        openSettingsFolder,
        pruneOldDataBackups,
        prototypeAuth: true,
        refreshBackupSummary,
        refreshShortcutSummary,
        restoreLatestDataBackup,
        resetWindowLayout,
        saveDiagnosticsReport,
        setDesktopPreferences,
        get shortcutSummary() {
          return currentShortcutSummary;
        },
        settingsPath: "C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env"
      }
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Desktop app")).toBeInTheDocument();
    expect(screen.getByText("App version")).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText("App folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang")).toBeInTheDocument();
    expect(screen.getByText("Data folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data")).toBeInTheDocument();
    expect(screen.getByText("Settings file")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env")).toBeInTheDocument();
    expect(screen.getByText("Backups folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics folder")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Backups saved")).toBeInTheDocument();
    expect(screen.getByText("1 backups")).toBeInTheDocument();
    expect(screen.getByText("Latest backup")).toBeInTheDocument();
    expect(screen.getByText("backup-2026-07-07T20-00-00-000Z")).toBeInTheDocument();
    expect(await screen.findByText("Desktop shortcut")).toBeInTheDocument();
    const desktopShortcutStatus = screen.getByText("Desktop shortcut").closest("div")!;
    const startMenuShortcutStatus = screen.getByText("Start Menu shortcut").closest("div")!;
    expect(within(desktopShortcutStatus).getByText("Not installed")).toBeInTheDocument();
    expect(within(desktopShortcutStatus).getByText("C:\\Users\\Demon\\Desktop\\AssiniLang.lnk")).toBeInTheDocument();
    expect(within(startMenuShortcutStatus).getByText("Not installed")).toBeInTheDocument();
    expect(within(startMenuShortcutStatus).getByText("C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prune old backups" })).toBeDisabled();
    await waitFor(() => expect(refreshShortcutSummary).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Desktop app actions")).toBeInTheDocument();
    expect(screen.getByText("Recovery")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Folders")).toBeInTheDocument();
    expect(screen.getByText("Backups")).toBeInTheDocument();
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='recovery']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='diagnostics']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='folders']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='backups']")).toBeInTheDocument();
    expect(document.querySelector("[data-desktop-action-group='shortcuts']")).toBeInTheDocument();

    expect(screen.getByLabelText("Launch at sign-in")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Launch at sign-in"));
    await waitFor(() => expect(setDesktopPreferences).toHaveBeenCalledWith({ launchAtLogin: true }));
    expect(await screen.findByText("Desktop preference saved.")).toBeInTheDocument();
    expect(screen.getByLabelText("Launch at sign-in")).toBeChecked();

    expect(screen.getByLabelText("Hide to tray on close")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Hide to tray on close"));
    await waitFor(() => expect(setDesktopPreferences).toHaveBeenLastCalledWith({ hideToTray: true }));
    expect(screen.getByLabelText("Hide to tray on close")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Reset window layout" }));
    await waitFor(() => expect(resetWindowLayout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Reset window layout.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Replace API key"), {
      target: { value: "local-secret" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const diagnostics = writeText.mock.calls[0][0] as string;
    expect(diagnostics).toContain("AssiniLang Desktop diagnostics");
    expect(diagnostics).toContain("App version: 0.1.0");
    expect(diagnostics).toContain("App executable: C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang\\AssiniLang.exe");
    expect(diagnostics).toContain("App folder: C:\\Users\\Demon\\AppData\\Local\\Programs\\AssiniLang");
    expect(diagnostics).toContain("Data folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\data");
    expect(diagnostics).toContain("Settings file: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\.env");
    expect(diagnostics).toContain("Backups folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\backups");
    expect(diagnostics).toContain("Diagnostics folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics");
    expect(diagnostics).toContain("Backups available: 1");
    expect(diagnostics).toContain("Latest backup: backup-2026-07-07T20-00-00-000Z");
    expect(diagnostics).toContain("Desktop shortcut: not installed");
    expect(diagnostics).toContain("Desktop shortcut path: C:\\Users\\Demon\\Desktop\\AssiniLang.lnk");
    expect(diagnostics).toContain("Start Menu shortcut: not installed");
    expect(diagnostics).toContain("Start Menu shortcut path: C:\\Users\\Demon\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\AssiniLang.lnk");
    expect(diagnostics).toContain("Launch at sign-in: yes");
    expect(diagnostics).toContain("Hide to tray on close: yes");
    expect(diagnostics).toContain("Provider: openai-compatible");
    expect(diagnostics).toContain("Model: llama3.1");
    expect(diagnostics).toContain("Models: 1");
    expect(diagnostics).toContain("connected http://127.0.0.1:11434/v1");
    expect(diagnostics).not.toContain("local-secret");
    expect(await screen.findByText("Diagnostics copied to clipboard.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save diagnostics report" }));
    await waitFor(() => expect(saveDiagnosticsReport).toHaveBeenCalledTimes(1));
    const savedDiagnostics = saveDiagnosticsReport.mock.calls[0][0] as string;
    expect(savedDiagnostics).toContain("AssiniLang Desktop diagnostics");
    expect(savedDiagnostics).toContain("App version: 0.1.0");
    expect(savedDiagnostics).toContain("Diagnostics folder: C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics");
    expect(savedDiagnostics).not.toContain("local-secret");
    expect(await screen.findByText("Saved diagnostics report at C:\\Users\\Demon\\AppData\\Roaming\\AssiniLang\\diagnostics\\diagnostics-2026-07-07.txt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open app folder" }));
    await waitFor(() => expect(openAppFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened app folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open data folder" }));
    await waitFor(() => expect(openDataFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened data folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open diagnostics folder" }));
    await waitFor(() => expect(openDiagnosticsFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened diagnostics folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create data backup" }));
    await waitFor(() => expect(createDataBackup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created backup at C:\\Backups\\assini.")).toBeInTheDocument();
    expect(await screen.findByText("6 backups")).toBeInTheDocument();
    expect(screen.getByText("backup-2026-07-07T21-00-00-000Z")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prune old backups" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Prune old backups" }));
    const pruneDialog = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.click(within(pruneDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirmation" })).not.toBeInTheDocument());
    expect(pruneOldDataBackups).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Prune old backups" }));
    const pruneDialogRetry = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.click(within(pruneDialogRetry).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(pruneOldDataBackups).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Pruned 1 old backup.")).toBeInTheDocument();
    expect(await screen.findByText("5 backups")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
    const restoreDialog = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirmation" })).not.toBeInTheDocument());
    expect(restoreLatestDataBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Restore latest backup" }));
    const restoreDialogRetry = await screen.findByRole("dialog", { name: "Confirmation" });
    fireEvent.click(within(restoreDialogRetry).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(restoreLatestDataBackup).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Restored latest backup. Reloading workspace...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open backups folder" }));
    await waitFor(() => expect(openBackupsFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened backups folder.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open latest backup" }));
    await waitFor(() => expect(openLatestBackupFolder).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Opened latest backup backup-2026-07-07T21-00-00-000Z.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set up app shortcuts" }));
    await waitFor(() => expect(createAppShortcuts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created app shortcuts.")).toBeInTheDocument();
    expect(within(screen.getByText("Desktop shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();
    expect(within(screen.getByText("Start Menu shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create desktop shortcut" }));
    await waitFor(() => expect(createDesktopShortcut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created desktop shortcut.")).toBeInTheDocument();
    expect(within(screen.getByText("Desktop shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Start Menu shortcut" }));
    await waitFor(() => expect(createStartMenuShortcut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Created Start Menu shortcut.")).toBeInTheDocument();
    expect(within(screen.getByText("Start Menu shortcut").closest("div")!).getByText("Installed")).toBeInTheDocument();
    expect(openSettingsFolder).not.toHaveBeenCalled();
  });

  it("applies runtime model settings from a discovered model selection", async () => {
    const discoveredId = "openai-compatible|http://irene-box:8080/v1|irene-fusion";
    apiMock.updateRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "openai-compatible",
      baseUrl: "http://irene-box:8080/v1",
      model: "irene-fusion"
    }));
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse([
      {
        id: discoveredId,
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        source: "Requested endpoint",
        baseUrl: "http://irene-box:8080/v1",
        model: "irene-fusion",
        requiresApiKey: false
      },
      {
        id: "openai-compatible|http://irene-box:8080/v1|irene-small",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        source: "Requested endpoint",
        baseUrl: "http://irene-box:8080/v1",
        model: "irene-small",
        requiresApiKey: false
      }
    ], [
      {
        source: "Requested endpoint",
        baseUrl: "http://irene-box:8080/v1",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        connected: true,
        modelCount: 2,
        status: 200
      }
    ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("option", { name: /irene-fusion/ });
    expect(screen.getByText(/Last automatic model scan:/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Discovered models"), {
      target: { value: discoveredId }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Provider")).toHaveValue("openai-compatible");
      expect(screen.getByLabelText("Base URL")).toHaveValue("http://irene-box:8080/v1");
      expect(screen.getByLabelText("Model")).toHaveValue("irene-fusion");
    });
    expect(screen.getByText("Connected to 2 models at http://irene-box:8080/v1: irene-fusion, irene-small.")).toBeInTheDocument();

    await waitFor(() => expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({
      provider: "openai-compatible",
      baseUrl: "http://irene-box:8080/v1",
      model: "irene-fusion",
      timeoutMs: 180000,
      maxTokens: 4096
    })));
    expect(await screen.findByText("Settings saved and applied.")).toBeInTheDocument();
  });

  it("automatically applies one discovered no-key model when settings are empty", async () => {
    const discoveredId = "lm-studio|http://127.0.0.1:1234/v1|irene-fusion";
    apiMock.updateRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "irene-fusion"
    }));
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse([
      {
        id: discoveredId,
        provider: "lm-studio",
        providerLabel: "LM Studio",
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "irene-fusion",
        requiresApiKey: false
      }
    ], [
      {
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        provider: "lm-studio",
        providerLabel: "LM Studio",
        connected: true,
        modelCount: 1,
        status: 200
      }
    ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "irene-fusion",
      timeoutMs: 180000,
      maxTokens: 4096,
      jsonMode: false
    })));
    expect(await screen.findByText("Settings saved and applied.")).toBeInTheDocument();
    expect(screen.getByLabelText("Discovered models")).toHaveValue(discoveredId);
  });

  it("does not automatically apply discovered models when more than one model is available", async () => {
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse([
      {
        id: "lm-studio|http://127.0.0.1:1234/v1|irene-fusion",
        provider: "lm-studio",
        providerLabel: "LM Studio",
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "irene-fusion",
        requiresApiKey: false
      },
      {
        id: "lm-studio|http://127.0.0.1:1234/v1|irene-small",
        provider: "lm-studio",
        providerLabel: "LM Studio",
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "irene-small",
        requiresApiKey: false
      }
    ], [
      {
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        provider: "lm-studio",
        providerLabel: "LM Studio",
        connected: true,
        modelCount: 2,
        status: 200
      }
    ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /irene-fusion/ })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /irene-small/ })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Discovered models")).toHaveValue(""));
    expect(apiMock.updateRuntimeSettings).not.toHaveBeenCalled();
  });

  it("shows readable labels for path-like discovered model names without changing the saved value", async () => {
    const fullModelPath = "C:\\models\\Irene\\irene-fusion-Q4_K_M.gguf";
    const discoveredId = `lm-studio|http://127.0.0.1:1234/v1|${fullModelPath}`;
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: fullModelPath
    }));
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse([
      {
        id: discoveredId,
        provider: "lm-studio",
        providerLabel: "LM Studio",
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: fullModelPath,
        requiresApiKey: false
      }
    ], [
      {
        source: "LM Studio local",
        baseUrl: "http://127.0.0.1:1234/v1",
        provider: "lm-studio",
        providerLabel: "LM Studio",
        connected: true,
        modelCount: 1,
        status: 200
      }
    ]));

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const discoveredOption = await screen.findByRole("option", {
      name: "irene-fusion-Q4_K_M.gguf | LM Studio"
    });
    expect(discoveredOption).toBeInTheDocument();
    expect(discoveredOption).toHaveAttribute("title", `${fullModelPath} (LM Studio, http://127.0.0.1:1234/v1)`);
    expect(screen.getByText("Connected to irene-fusion-Q4_K_M.gguf at http://127.0.0.1:1234/v1.")).toBeInTheDocument();
    expect(screen.getAllByText("irene-fusion-Q4_K_M.gguf").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue(fullModelPath));
    expect(screen.getByLabelText("Discovered models")).toHaveValue(discoveredId);
  });

  it("replaces stale discovered models when the list is refreshed", async () => {
    const oldModelId = "lm-studio|http://127.0.0.1:1234/v1|old-loaded-model";
    const newModelId = "lm-studio|http://127.0.0.1:1234/v1|new-loaded-model";
    apiMock.updateRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "new-loaded-model"
    }));
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "old-loaded-model"
    }));
    apiMock.fetchDiscoveredModels
      .mockResolvedValueOnce(createModelDiscoveryResponse([
        {
          id: oldModelId,
          provider: "lm-studio",
          providerLabel: "LM Studio",
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "old-loaded-model",
          requiresApiKey: false
        }
      ], [
        {
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "lm-studio",
          providerLabel: "LM Studio",
          connected: true,
          modelCount: 1,
          status: 200
        }
      ]))
      .mockResolvedValueOnce(createModelDiscoveryResponse([
        {
          id: newModelId,
          provider: "lm-studio",
          providerLabel: "LM Studio",
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "new-loaded-model",
          requiresApiKey: false
        }
      ], [
        {
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "lm-studio",
          providerLabel: "LM Studio",
          connected: true,
          modelCount: 1,
          status: 200
        }
      ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /old-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Discovered models")).toHaveValue(oldModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("old-loaded-model");
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));

    expect(await screen.findByRole("option", { name: /new-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /old-loaded-model/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Discovered models")).toHaveValue(newModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("new-loaded-model");
    });
    expect(screen.getByText(
      "Saved model old-loaded-model is no longer loaded at http://127.0.0.1:1234/v1. The form now shows new-loaded-model; apply it to switch immediately."
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply loaded model" }));

    await waitFor(() => expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "new-loaded-model"
    })));
  });

  it("automatically refreshes discovered models when the Settings screen regains focus", async () => {
    const oldModelId = "lm-studio|http://127.0.0.1:1234/v1|old-loaded-model";
    const newModelId = "lm-studio|http://127.0.0.1:1234/v1|new-loaded-model";
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "old-loaded-model"
    }));
    apiMock.fetchDiscoveredModels
      .mockResolvedValueOnce(createModelDiscoveryResponse([
        {
          id: oldModelId,
          provider: "lm-studio",
          providerLabel: "LM Studio",
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "old-loaded-model",
          requiresApiKey: false
        }
      ], [
        {
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "lm-studio",
          providerLabel: "LM Studio",
          connected: true,
          modelCount: 1,
          status: 200
        }
      ]))
      .mockResolvedValueOnce(createModelDiscoveryResponse([
        {
          id: newModelId,
          provider: "lm-studio",
          providerLabel: "LM Studio",
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "new-loaded-model",
          requiresApiKey: false
        }
      ], [
        {
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "lm-studio",
          providerLabel: "LM Studio",
          connected: true,
          modelCount: 1,
          status: 200
        }
      ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /old-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Discovered models")).toHaveValue(oldModelId));

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await screen.findByRole("option", { name: /new-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /old-loaded-model/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Discovered models")).toHaveValue(newModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("new-loaded-model");
    });
  });

  it("clears the discovered model selection when a loaded model is unloaded", async () => {
    const oldModelId = "lm-studio|http://127.0.0.1:1234/v1|old-loaded-model";
    apiMock.updateRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createDeterministicLlmStatus(),
      provider: "deterministic",
      mode: "deterministic",
      configured: true,
      activeProviderName: "deterministic",
      baseUrl: undefined,
      model: undefined,
      warnings: ["Using deterministic fallback; no external LLM calls will be made."]
    }));
    apiMock.fetchRuntimeSettings.mockResolvedValue(createRuntimeSettingsResponse({
      ...createRealLlmStatus(),
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "old-loaded-model"
    }));
    apiMock.fetchDiscoveredModels
      .mockResolvedValueOnce(createModelDiscoveryResponse([
        {
          id: oldModelId,
          provider: "lm-studio",
          providerLabel: "LM Studio",
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          model: "old-loaded-model",
          requiresApiKey: false
        }
      ], [
        {
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "lm-studio",
          providerLabel: "LM Studio",
          connected: true,
          modelCount: 1,
          status: 200
        }
      ]))
      .mockResolvedValueOnce(createModelDiscoveryResponse([], [
        {
          source: "LM Studio local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "lm-studio",
          providerLabel: "LM Studio",
          connected: true,
          modelCount: 0,
          status: 200
        }
      ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("option", { name: /old-loaded-model/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Discovered models")).toHaveValue(oldModelId);
      expect(screen.getByLabelText("Model")).toHaveValue("old-loaded-model");
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /old-loaded-model/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Discovered models")).toHaveValue("");
      expect(screen.getByLabelText("Model")).toHaveValue("");
    });
    expect(screen.getByText("Connected to http://127.0.0.1:1234/v1, but it did not return any models.")).toBeInTheDocument();
    expect(screen.getByText(
      "Saved model old-loaded-model is no longer loaded at http://127.0.0.1:1234/v1. Choose another discovered model or switch back to offline mode."
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use offline mode" }));

    await waitFor(() => expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({
      provider: "deterministic",
      baseUrl: "",
      model: "",
      clearApiKey: true
    })));
  });

  it("reports a clear connection failure for an unreachable requested endpoint", async () => {
    apiMock.fetchDiscoveredModels.mockResolvedValue(createModelDiscoveryResponse([], [
      {
        source: "Requested endpoint",
        baseUrl: "http://offline-box:8080/v1",
        provider: "openai-compatible",
        providerLabel: "OpenAI-compatible",
        connected: false,
        modelCount: 0,
        detail: "Could not connect to the endpoint. Check that the model server is running."
      }
    ]));
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText(
      "Could not connect to http://offline-box:8080/v1: Could not connect to the endpoint. Check that the model server is running."
    )).toBeInTheDocument();
  });

  it("checks LLM reachability and reports a not-configured provider", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(apiMock.checkLlmReachability).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No external provider configured.")).toBeInTheDocument();
  });

  it("checks LLM reachability and reports a reachable provider with mode and latency", async () => {
    apiMock.checkLlmReachability.mockResolvedValue({
      reachable: true,
      checked: true,
      mode: "local-openai-compatible",
      status: 200,
      latencyMs: 142
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(apiMock.checkLlmReachability).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Reachable (local openai compatible, 142 ms)")).toBeInTheDocument();
  });

  it("checks LLM reachability and reports an unreachable provider with the sanitized detail", async () => {
    apiMock.checkLlmReachability.mockResolvedValue({
      reachable: false,
      checked: true,
      mode: "local-openai-compatible",
      detail: "Connection refused"
    });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Unreachable: Connection refused")).toBeInTheDocument();
  });

  it("refreshes model observability after a failed provider smoke test", async () => {
    apiMock.createAiSession.mockRejectedValueOnce(
      new Error("AI session creation failed (502): LLM generation failed: LLM provider request timed out after 25ms")
    );
    apiMock.fetchObservability
      .mockResolvedValueOnce({
        totals: {
          sessions: 0,
          activeSessions: 0,
          messages: 0,
          elderCorrections: 0
        },
        sessions: []
      })
      .mockResolvedValueOnce({
        totals: {
          sessions: 1,
          activeSessions: 0,
          messages: 1,
          elderCorrections: 0
        },
        sessions: [
          {
            id: "ai-session-avenik-failed",
            languageId: "avenik",
            mode: "learner_practice",
            status: "failed",
            createdBy: "learner-1",
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:01.000Z",
            messageCount: 1,
            contextNoteIds: ["avn-rule-verb-chain-note", "avn-rule-case-note"],
            contextPassageIds: ["avn-c001"],
            thinkingSummary: "Safe reasoning summary for observable failure.",
            privacy: {
              redactions: ["hidden-chain-of-thought", "answer-keys", "learner-identifiers"],
              exposesHiddenChainOfThought: false
            }
          }
        ]
      });
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("region", { name: "Model session observability" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    expect(await screen.findByText("AI session creation failed (502): LLM generation failed: LLM provider request timed out after 25ms")).toBeInTheDocument();
    expect(await screen.findByText("1 failed")).toBeInTheDocument();
    expect(screen.getByText("learner practice")).toBeInTheDocument();
    expect(screen.getByText("1 message")).toBeInTheDocument();
  });

  it("creates governance policy records for the selected language", async () => {
    apiMock.fetchGovernance
      .mockResolvedValueOnce([
        {
          id: "governance-1",
          languageId: "avenik",
          policyType: "access",
          content: "Only reviewers may approve community notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "governance-1",
          languageId: "avenik",
          policyType: "access",
          content: "Only reviewers may approve community notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        },
        {
          id: "governance-2",
          languageId: "avenik",
          policyType: "generation",
          content: "Generated outputs must cite reviewed notes.",
          effectiveDate: "2026-06-06",
          approvedBy: "lead-1"
        }
      ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Only reviewers may approve community notes.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Policy type"), { target: { value: "generation" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText("Policy content"), {
      target: { value: "Generated outputs must cite reviewed notes." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create policy record" }));

    await waitFor(() => expect(apiMock.createGovernanceRecord).toHaveBeenCalledWith({
      languageId: "avenik",
      policyType: "generation",
      content: "Generated outputs must cite reviewed notes.",
      effectiveDate: "2026-06-06"
    }));
    expect(await screen.findByText("Governance policy recorded.")).toBeInTheDocument();
    expect(await screen.findByText("Generated outputs must cite reviewed notes.")).toBeInTheDocument();
  });

  it("updates the review policy for the selected language", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByDisplayValue("reviewer-1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assigned reviewer IDs"), {
      target: { value: "reviewer-1, elder-1" }
    });
    fireEvent.change(screen.getByLabelText("Approval threshold"), {
      target: { value: "2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Update review policy" }));

    await waitFor(() => expect(apiMock.updateReviewPolicy).toHaveBeenCalledWith("avenik", {
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true
    }));
    expect(await screen.findByText("Review policy updated.")).toBeInTheDocument();
    expect(screen.getByText("2 approvals required")).toBeInTheDocument();
  });

  it("loads and resolves open review disposition work from governance", async () => {
    const openDisposition = {
      id: "review-disposition-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      disposition: "escalated",
      status: "open",
      reason: "Needs Elder confirmation before approval.",
      assignedTo: "elder-1",
      dueAt: "2026-06-20",
      openedAt: "2026-06-06T00:00:00.000Z",
      openedBy: "reviewer-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null
    };
    const resolvedDisposition = {
      ...openDisposition,
      status: "resolved",
      resolvedAt: "2026-06-06T00:05:00.000Z",
      resolvedBy: "lead-1",
      resolutionSummary: "Resolved from governance review."
    };
    apiMock.fetchReviewDispositions
      .mockResolvedValueOnce([openDisposition])
      .mockResolvedValueOnce([resolvedDisposition]);
    apiMock.resolveReviewDisposition.mockResolvedValue(resolvedDisposition);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const ledger = await screen.findByRole("region", { name: "Review disposition work" });
    expect(apiMock.fetchReviewDispositions).toHaveBeenCalledWith("avenik");
    expect(within(ledger).getByText("Escalated")).toBeInTheDocument();
    expect(within(ledger).getByText("Note: avn-rule-verb-chain-note")).toBeInTheDocument();
    expect(within(ledger).getByText("Assigned to elder-1")).toBeInTheDocument();
    expect(within(ledger).getByText("Due 2026-06-20")).toBeInTheDocument();
    expect(within(ledger).getByText("Needs Elder confirmation before approval.")).toBeInTheDocument();

    fireEvent.change(within(ledger).getByLabelText("Resolution summary for review-disposition-1"), {
      target: { value: "Resolved from governance review." }
    });
    fireEvent.click(within(ledger).getByRole("button", { name: "Resolve review-disposition-1" }));

    await waitFor(() =>
      expect(apiMock.resolveReviewDisposition).toHaveBeenCalledWith(
        "review-disposition-1",
        "Resolved from governance review."
      )
    );
    expect(await within(ledger).findByText("Review disposition resolved.")).toBeInTheDocument();
    expect(await within(ledger).findByText("Resolved by lead-1")).toBeInTheDocument();
    expect(apiMock.fetchReviewDispositions).toHaveBeenLastCalledWith("avenik");
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("loads the selected language audit ledger from governance", async () => {
    apiMock.fetchAuditEvents.mockResolvedValue([
      {
        id: "audit-1",
        at: "2026-06-06T00:10:00.000Z",
        actorId: "lead-1",
        actorRole: "lead",
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: "governance-1",
        languageId: "avenik",
        summary: "Created generation governance policy record.",
        metadata: { policyType: "generation" }
      },
      {
        id: "audit-2",
        at: "2026-06-06T00:11:00.000Z",
        actorId: "reviewer-1",
        actorRole: "reviewer",
        action: "note.reviewed",
        entityType: "note",
        entityId: "avn-rule-verb-chain-note",
        languageId: "avenik",
        summary: "Reviewed note avn-rule-verb-chain-note.",
        metadata: { status: "under_review" }
      }
    ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const auditLedger = await screen.findByRole("region", { name: "Audit event ledger" });
    expect(apiMock.fetchAuditEvents).toHaveBeenCalledWith("avenik");
    expect(within(auditLedger).getByText("governance_record.created")).toBeInTheDocument();
    expect(within(auditLedger).getByText("lead-1")).toBeInTheDocument();
    expect(within(auditLedger).getByText("governance_record / governance-1")).toBeInTheDocument();
    expect(within(auditLedger).getByText("Created generation governance policy record.")).toBeInTheDocument();
    expect(within(auditLedger).getByText("note.reviewed")).toBeInTheDocument();
    expect(within(auditLedger).getByText("reviewer-1")).toBeInTheDocument();
  });

  it("loads lead-only audit events after reviewer-scoped governance requests settle", async () => {
    const reviewPolicy = createDeferred<unknown>();
    const reviewDispositions = createDeferred<unknown[]>();
    apiMock.fetchReviewPolicy.mockReturnValue(reviewPolicy.promise);
    apiMock.fetchReviewDispositions.mockReturnValue(reviewDispositions.promise);
    apiMock.fetchAuditEvents.mockResolvedValue([]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => expect(apiMock.fetchReviewPolicy).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(apiMock.fetchReviewDispositions).toHaveBeenCalledWith("avenik"));
    expect(apiMock.fetchAuditEvents).not.toHaveBeenCalled();

    reviewPolicy.resolve({
      id: "review-policy-avenik",
      languageId: "avenik",
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedAt: "2026-06-06T00:00:00.000Z",
      updatedBy: "lead-1"
    });
    reviewDispositions.resolve([]);

    await waitFor(() => expect(apiMock.fetchAuditEvents).toHaveBeenCalledWith("avenik"));
  });

  it("exports a downloadable review snapshot for the selected language", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.click(await screen.findByRole("button", { name: "Export review snapshot" }));

    await waitFor(() => expect(apiMock.fetchLanguageSnapshot).toHaveBeenCalledWith("avenik"));
    expect(await screen.findByText("Snapshot ready: 1 corpus passage, 2 notes, 2 notes still need review, 2 exercises, 2 vocabulary items, 1 grammar rule, 1 source asset, integrity sha256:0123456789ab.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download snapshot JSON" });
    expect(link).toHaveAttribute("download", "assini-avenik-snapshot.json");
    expect(link.getAttribute("href")).toContain("data:application/json;charset=utf-8,");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).not.toContain("expectedAnswers");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(SNAPSHOT_HASH);
  });

  it("refreshes the selected language when the language selector changes", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: /Solari.*isolating/i }));

    await waitFor(() => expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("solari"));
    expect(await screen.findByText("Solari / Start")).toBeInTheDocument();
  });

  it("generates draft notes for the selected language and refreshes the review queue", async () => {
    const draftRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateDraftNotes.mockReturnValue(draftRun.promise);

    render(<App />);

    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    const languageButton = await screen.findByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Generate AI Drafts" }));

    await waitFor(() => expect(languageButton).toBeDisabled());
    expect(screen.getByRole("button", { name: "Drafting..." })).toBeDisabled();

    draftRun.resolve([]);

    await waitFor(() => expect(apiMock.generateDraftNotes).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate AI Drafts" })).toBeEnabled());
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("drafts notes with the model and refreshes the review queue", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelDraftNotes.mockResolvedValue({
      notes: [],
      warnings: ["Model returned fewer notes than requested."],
      generated: 2
    });

    render(<App />);

    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Draft notes with model" }));

    await waitFor(() => expect(apiMock.generateModelDraftNotes).toHaveBeenCalledWith("avenik"));
    expect(
      await screen.findByText(
        "Generated 2 model-backed draft notes. Model returned fewer notes than requested."
      )
    ).toBeInTheDocument();
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("shows the no-model error inline when drafting notes with the model fails", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelDraftNotes.mockRejectedValue(
      new Error("Model draft generation failed (400): No model is configured.")
    );

    render(<App />);

    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Draft notes with model" }));

    await waitFor(() => expect(apiMock.generateModelDraftNotes).toHaveBeenCalledWith("avenik"));
    expect(
      await screen.findByText("Model draft generation failed (400): No model is configured.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft notes with model" })).toBeEnabled();
  });

  it("runs evaluation from the eval view and disables language switching while refresh is in flight", async () => {
    const evaluationRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockReturnValue(evaluationRun.promise);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const languageButton = screen.getByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Run System Eval" }));

    await waitFor(() => expect(languageButton).toBeDisabled());
    expect(screen.getByRole("button", { name: "Evaluating..." })).toBeDisabled();

    evaluationRun.resolve([]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run System Eval" })).toBeEnabled());
    expect(languageButton).toBeEnabled();
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("exports a downloadable evaluation artifact from the eval view", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.click(await screen.findByRole("button", { name: "Export evaluation artifact" }));

    await waitFor(() => expect(apiMock.fetchEvaluationArtifact).toHaveBeenCalled());
    expect(await screen.findByText("Evaluation artifact ready: 1 latest run, 0 failed latest runs, 0 regressed latest runs, 0 failure lines, 85% average latest score, integrity sha256:fedcba987654.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Download evaluation artifact JSON" });
    expect(link).toHaveAttribute("download", "assini-evaluation-artifact.json");
    expect(link.getAttribute("href")).toContain("data:application/json;charset=utf-8,");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).not.toContain("expectedAnswers");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(EVALUATION_ARTIFACT_HASH);
  });

  it("shows latest evaluation trend deltas in the evaluation dashboard", async () => {
    const dashboardData = createDashboardData();
    dashboardData.evaluations = [
      {
        id: "eval-old",
        languageId: "avenik",
        createdAt: "2026-06-02T14:00:00.000Z",
        systemVersion: "test",
        fixtureVersion: "test",
        scores: {
          corpusCoverage: 1,
          noteQuality: 0.9
        },
        failures: [],
        summary: "Avenik previous evaluation completed."
      },
      {
        id: "eval-latest",
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
    ];
    apiMock.fetchDashboardData.mockResolvedValue(dashboardData);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("region", { name: "Evaluation trends" })).toBeInTheDocument();
    expect(screen.getByText("Avenik regressed by 10 pts since previous run.")).toBeInTheDocument();
    expect(screen.getByText("Note quality -10 pts")).toBeInTheDocument();
    expect(screen.getByText("Corpus coverage -10 pts")).toBeInTheDocument();
  });

  it("reviews elder corrections from the correction ledger", async () => {
    const dashboardData = createDashboardData();
    const pendingCorrection = {
      id: "elder-correction-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      correction: "Mention suffix order before approval.",
      rationale: "Elder review found the explanation underspecified.",
      severity: "major",
      status: "pending_review",
      proposedBy: "elder-1",
      proposedAt: "2026-06-06T00:00:00.000Z",
      reviewedBy: null,
      reviewedAt: null
    };
    const acceptedCorrection = {
      ...pendingCorrection,
      status: "accepted",
      reviewedBy: "lead-1",
      reviewedAt: "2026-06-06T00:01:00.000Z"
    };

    apiMock.fetchElderContext
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: dashboardData.notes,
        corrections: [pendingCorrection],
        governance: []
      })
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: dashboardData.notes,
        corrections: [acceptedCorrection],
        governance: []
      });
    apiMock.reviewElderCorrection.mockResolvedValue(acceptedCorrection);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(await screen.findByText("Mention suffix order before approval.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve this fix" }));

    await waitFor(() => expect(apiMock.reviewElderCorrection).toHaveBeenCalledWith("elder-correction-1", "accepted"));
    expect(await screen.findByText("Approved — we are using this")).toBeInTheDocument();
    expect(screen.getByText("Looked at by lead-1")).toBeInTheDocument();
  });

  it("applies accepted elder corrections to linked notes from the correction ledger", async () => {
    const dashboardData = createDashboardData();
    const revisedExplanation = "Avenik verbs use transparent suffix chains, and accepted elder review highlights tense before person.";
    const acceptedCorrection = {
      id: "elder-correction-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      correction: "Mention tense suffix order before person.",
      rationale: "Elder review found the explanation underspecified.",
      severity: "major",
      status: "accepted",
      proposedBy: "elder-1",
      proposedAt: "2026-06-06T00:00:00.000Z",
      reviewedBy: "lead-1",
      reviewedAt: "2026-06-06T00:01:00.000Z"
    };
    const appliedCorrection = {
      ...acceptedCorrection,
      status: "applied"
    };

    apiMock.fetchElderContext
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: dashboardData.notes,
        corrections: [acceptedCorrection],
        governance: []
      })
      .mockResolvedValueOnce({
        language: dashboardData.languages[0],
        corpus: dashboardData.corpus,
        notes: [{ ...dashboardData.notes[0], explanation: revisedExplanation }, dashboardData.notes[1]],
        corrections: [appliedCorrection],
        governance: []
      });
    apiMock.applyElderCorrection.mockResolvedValue({
      correction: appliedCorrection,
      note: { ...dashboardData.notes[0], explanation: revisedExplanation }
    });

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const explanationInput = await screen.findByLabelText("Updated wording for the lesson");
    fireEvent.change(explanationInput, { target: { value: revisedExplanation } });
    fireEvent.click(screen.getByRole("button", { name: "Save into the lesson" }));

    await waitFor(() =>
      expect(apiMock.applyElderCorrection).toHaveBeenCalledWith("elder-correction-1", revisedExplanation)
    );
    expect(await screen.findByText("Saved into the lesson")).toBeInTheDocument();
    expect(screen.getByText("Elder correction applied to linked note.")).toBeInTheDocument();
  });

  const reviewActionCases = [
    {
      action: "approval",
      buttonName: "Approve verb chains",
      reviewerComment: "Approved in local prototype.",
      status: "approved"
    },
    {
      action: "contest",
      buttonName: "Contest verb chains",
      reviewerComment: "Contested in local prototype.",
      status: "contested"
    },
    {
      action: "rejection",
      buttonName: "Reject verb chains",
      reviewerComment: "Rejected in local prototype.",
      status: "rejected"
    },
    {
      action: "deferral",
      buttonName: "Defer verb chains",
      reviewerComment: "Deferred in local prototype.",
      status: "deferred"
    },
    {
      action: "escalation",
      buttonName: "Escalate verb chains",
      reviewerComment: "Escalated in local prototype.",
      status: "escalated"
    }
  ] as const;

  it.each(reviewActionCases)("submits note $action actions and refreshes the selected language", async (reviewCase) => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: reviewCase.buttonName }));

    await waitFor(() =>
      expect(apiMock.reviewNote).toHaveBeenCalledWith("avn-rule-verb-chain-note", {
        status: reviewCase.status,
        reviewerComment: reviewCase.reviewerComment
      })
    );
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("localizes expired-session errors from note review instead of raw API text", async () => {
    apiMock.reviewNote.mockRejectedValue(
      new ApiError("Request failed: /notes/avn-rule-verb-chain-note/review (401): Unauthorized", { status: 401 })
    );

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve verb chains" }));

    expect(
      await screen.findByText(
        "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Unauthorized/i)).not.toBeInTheDocument();
  });

  it("edits the selected note explanation from the review queue", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const revisedExplanation = "Avenik verbs use suffix chains where tense appears before the person suffix.";
    const explanationInput = await screen.findByLabelText("Revised note explanation");
    expect(explanationInput).toHaveValue("Avenik verbs use transparent suffix chains.");

    fireEvent.change(explanationInput, { target: { value: revisedExplanation } });
    fireEvent.click(screen.getByRole("button", { name: "Save note explanation" }));

    await waitFor(() =>
      expect(apiMock.reviewNote).toHaveBeenCalledWith("avn-rule-verb-chain-note", {
        explanation: revisedExplanation,
        reviewerComment: "Edited note explanation in local prototype."
      })
    );
    expect(await screen.findByText("Note explanation updated.")).toBeInTheDocument();
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("shows selected note examples, evidence, reviewer info, comments, and edit history", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const detail = await screen.findByRole("article", { name: "Selected note detail" });
    expect(within(detail).getByRole("heading", { name: "verb chains" })).toBeInTheDocument();
    expect(within(detail).getByText("mira talo-mi-na")).toBeInTheDocument();
    expect(within(detail).getByText("I walk by the river.")).toBeInTheDocument();
    expect(within(detail).getByText("1 evidence link")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c001")).toBeInTheDocument();
    expect(within(detail).getByText("mentor-reviewer")).toBeInTheDocument();
    expect(within(detail).getByText("2026-06-02T15:30:00.000Z")).toBeInTheDocument();
    expect(within(detail).getByText("Check suffix boundaries before approval.")).toBeInTheDocument();
    expect(within(detail).getByText("draft-agent")).toBeInTheDocument();
    expect(within(detail).getByText("Generated from the Avenik grammar fixture.")).toBeInTheDocument();
  });

  it("switches the note detail panel when another note is selected", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: /case particles/ }));

    const detail = screen.getByRole("article", { name: "Selected note detail" });
    expect(within(detail).getByRole("heading", { name: "case particles" })).toBeInTheDocument();
    expect(within(detail).getByText("sela mora-ke")).toBeInTheDocument();
    expect(within(detail).getByText("2 evidence links")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c004")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c005")).toBeInTheDocument();
    expect(within(detail).getByText("Added a second evidence passage.")).toBeInTheDocument();
  });

  it("disables language switching while a note review refresh is in flight", async () => {
    const review = createDeferred<unknown>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.reviewNote.mockReturnValue(review.promise);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    const languageButton = await screen.findByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Approve verb chains" }));

    await waitFor(() => expect(languageButton).toBeDisabled());

    review.resolve({});

    await waitFor(() => expect(languageButton).toBeEnabled());
  });

  it("submits learner exercise answers through the API", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Accepted exercise submission."
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    const answerBox = await screen.findByLabelText("Exercise answer");
    fireEvent.change(answerBox, { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.submitExerciseAnswer).toHaveBeenCalledWith("avn-ex001", "mira talo-mi-na"));
    expect(await screen.findByText("Accepted exercise submission.")).toBeInTheDocument();
  });

  it("shows sanitized exercise submission history and refreshes it after grading", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.fetchExerciseSubmissions
      .mockResolvedValueOnce([
        {
          id: "submission-1",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: false,
          explanation: "Answer did not match the exercise key.",
          submittedAt: "2026-06-03T15:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "submission-2",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: true,
          explanation: "Accepted exercise submission.",
          submittedAt: "2026-06-03T15:01:00.000Z"
        }
      ]);
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Accepted exercise submission."
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    const history = await screen.findByRole("region", { name: "Exercise submission history" });
    expect(await within(history).findByText("Answer did not match the exercise key.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Exercise answer"), { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex001"));
    expect(await within(history).findByText("Accepted exercise submission.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();
  });

  it("authors a validated exercise from the learning lab", async () => {
    const createdExercise = {
      id: "authored-exercise-avenik-3",
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"]
    };
    const initialData = createDashboardData();
    const refreshedData = {
      ...initialData,
      exercises: [...initialData.exercises, createdExercise]
    };
    apiMock.fetchDashboardData
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(refreshedData);
    apiMock.createExercise.mockResolvedValue(createdExercise);

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.change(await screen.findByLabelText("Exercise prompt"), {
      target: { value: "Translate into Avenik: I walk by the river." }
    });
    fireEvent.change(screen.getByLabelText("Allowed vocabulary"), {
      target: { value: "mira, talo, -mi, -na" }
    });
    fireEvent.change(screen.getByLabelText("Allowed rule IDs"), {
      target: { value: "avn-rule-verb-chain" }
    });
    fireEvent.change(screen.getByLabelText("Expected answers"), {
      target: { value: "mira talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 1"), {
      target: { value: "talo-mi-na mira" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 1"), {
      target: { value: "Moves the finite verb before the locative noun." }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 2"), {
      target: { value: "mira talo-na-mi" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 2"), {
      target: { value: "Reverses tense and person suffix order." }
    });
    fireEvent.change(screen.getByLabelText("Grading explanation"), {
      target: { value: "Use mira for river, talo for walk, -mi for present, and -na for first person singular." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create exercise" }));

    await waitFor(() => expect(apiMock.createExercise).toHaveBeenCalledWith("avenik", {
      type: "translate_to_target",
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["mira talo-mi-na"],
      adversarialAnswers: [
        { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." },
        { answer: "mira talo-na-mi", reason: "Reverses tense and person suffix order." }
      ],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    }));
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
    expect(await screen.findByText("Exercise authored.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Translate into Avenik: I walk by the river./ })).toBeInTheDocument();
  });

  it("validates exercise authoring without creating it", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.validateExerciseAuthoring.mockResolvedValue({
      ok: false,
      errors: ["Exercise references unknown rule: missing-rule"],
      warnings: [],
      preview: null
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.change(await screen.findByLabelText("Exercise prompt"), {
      target: { value: "Translate into Avenik: I walk by the river." }
    });
    fireEvent.change(screen.getByLabelText("Allowed vocabulary"), {
      target: { value: "mira, talo, -mi, -na" }
    });
    fireEvent.change(screen.getByLabelText("Allowed rule IDs"), {
      target: { value: "missing-rule" }
    });
    fireEvent.change(screen.getByLabelText("Expected answers"), {
      target: { value: "mira talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 1"), {
      target: { value: "talo-mi-na mira" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 1"), {
      target: { value: "Moves the finite verb before the locative noun." }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 2"), {
      target: { value: "mira talo-na-mi" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 2"), {
      target: { value: "Reverses tense and person suffix order." }
    });
    fireEvent.change(screen.getByLabelText("Grading explanation"), {
      target: { value: "Use mira for river, talo for walk, -mi for present, and -na for first person singular." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate exercise authoring" }));

    await waitFor(() => expect(apiMock.validateExerciseAuthoring).toHaveBeenCalledWith("avenik", {
      type: "translate_to_target",
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["missing-rule"],
      expectedAnswers: ["mira talo-mi-na"],
      adversarialAnswers: [
        { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." },
        { answer: "mira talo-na-mi", reason: "Reverses tense and person suffix order." }
      ],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    }));
    expect(apiMock.createExercise).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("missing-rule");
  });

  it("pre-fills the authoring form from a model-generated exercise draft without auto-creating it", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelExercise.mockResolvedValue({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate into Avenik: The child sleeps.",
        allowedVocabulary: ["nemi", "lo", "-ki"],
        allowedRuleIds: ["avn-rule-verb-chain"],
        expectedAnswers: ["nemi lo-ki"],
        adversarialAnswers: [
          { answer: "lo-ki nemi", reason: "Fronts the verb ahead of the subject noun." },
          { answer: "nemi-ki lo", reason: "Attaches the tense suffix to the wrong stem." }
        ],
        gradingExplanation: "Use nemi for child and lo for sleep with the -ki present suffix."
      },
      warnings: ["Review the allowed vocabulary before saving."]
    });

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.click(await screen.findByRole("button", { name: "Generate with model" }));

    await waitFor(() => expect(apiMock.generateModelExercise).toHaveBeenCalledWith("avenik", {
      type: "translate_to_target"
    }));

    expect(await screen.findByLabelText("Exercise prompt")).toHaveValue("Translate into Avenik: The child sleeps.");
    expect(screen.getByLabelText("Allowed vocabulary")).toHaveValue("nemi, lo, -ki");
    expect(screen.getByLabelText("Expected answers")).toHaveValue("nemi lo-ki");
    expect(screen.getByLabelText("Adversarial answer 1")).toHaveValue("lo-ki nemi");
    expect(screen.getByLabelText("Grading explanation")).toHaveValue(
      "Use nemi for child and lo for sleep with the -ki present suffix."
    );
    expect(
      screen.getByText("Draft generated — review before saving. Review the allowed vocabulary before saving.")
    ).toBeInTheDocument();
    expect(apiMock.createExercise).not.toHaveBeenCalled();
  });

  it("shows the no-model error inline when generating an exercise with the model fails", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateModelExercise.mockRejectedValue(
      new Error("Model exercise generation failed (400): No model is configured.")
    );

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));

    fireEvent.click(await screen.findByRole("button", { name: "Generate with model" }));

    await waitFor(() => expect(apiMock.generateModelExercise).toHaveBeenCalledWith("avenik", {
      type: "translate_to_target"
    }));
    expect(
      await screen.findByText("Model exercise generation failed (400): No model is configured.")
    ).toBeInTheDocument();
    expect(apiMock.createExercise).not.toHaveBeenCalled();
  });

  it("switches learner exercise selection and loads that exercise history", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());

    render(<App />);
    await selectAvenik();
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    fireEvent.click(await screen.findByRole("button", { name: /Segment: nemi-lo-ki/ }));

    expect(await screen.findByRole("heading", { name: "Segment: nemi-lo-ki" })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex002"));
  });
});
