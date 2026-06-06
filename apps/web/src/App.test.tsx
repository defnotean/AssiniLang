import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, getInitialTheme } from "./App";

const apiMock = vi.hoisted(() => ({
  applyElderCorrection: vi.fn(),
  createAiSession: vi.fn(),
  fetchAuditEvents: vi.fn(),
  createGovernanceRecord: vi.fn(),
  createExercise: vi.fn(),
  fetchCurrentUser: vi.fn(),
  fetchDashboardData: vi.fn(),
  fetchEvaluationArtifact: vi.fn(),
  fetchExerciseSubmissions: vi.fn(),
  fetchGovernance: vi.fn(),
  fetchLanguageProfile: vi.fn(),
  fetchLanguageSnapshot: vi.fn(),
  fetchLlmStatus: vi.fn(),
  fetchObservability: vi.fn(),
  fetchReviewDispositions: vi.fn(),
  fetchReviewPolicy: vi.fn(),
  generateDraftNotes: vi.fn(),
  importCorpusPassage: vi.fn(),
  resolveReviewDisposition: vi.fn(),
  reviewElderCorrection: vi.fn(),
  runEvaluation: vi.fn(),
  reviewNote: vi.fn(),
  submitElderCorrection: vi.fn(),
  fetchElderContext: vi.fn(),
  submitExerciseAnswer: vi.fn(),
  updateReviewPolicy: vi.fn()
}));

vi.mock("./api", () => apiMock);

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
        description: "Synthetic agglutinative language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      },
      {
        id: "solari",
        name: "Solari",
        typology: "isolating",
        description: "Synthetic isolating language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      }
    ],
    corpus: [
      {
        id: "avn-c001",
        languageId: "avenik",
        source: "synthetic-fixture",
        sourceMetadata: {
          author: "fixture-author",
          year: 2026,
          license: "synthetic-only",
          consentRecord: "synthetic"
        },
        textTarget: "mira talo-mi-na",
        textTranslation: "I walk by the river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "river", gloss: "river", features: [] },
          { surface: "talo", lemma: "walk", gloss: "walk", features: [] }
        ],
        topicTags: ["movement"],
        consentStatus: {
          use: "synthetic-testing-only",
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
        dialectScope: "synthetic baseline",
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
        dialectScope: "synthetic baseline",
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
        summary: "Avenik synthetic evaluation completed."
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

async function renderReady() {
  apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
  render(<App />);
  await screen.findByRole("heading", { level: 1, name: "Corpus Browser" });
}

function createLanguageProfile() {
  return {
    language: {
      id: "avenik",
      name: "Avenik",
      typology: "agglutinative",
      description: "Synthetic agglutinative language.",
      orthography: "Latin",
      status: "synthetic",
      fixtureSource: "test"
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
      phonotactics: [
        "Consonant clusters are disallowed inside native roots.",
        "Suffixes attach with explicit hyphen boundaries."
      ]
    },
    paradigms: [
      {
        id: "avn-paradigm-verb-chain",
        title: "Finite verb chain",
        description: "Transparent Avenik finite verbs combine root + tense suffix + person suffix.",
        rows: [
          {
            label: "present first singular",
            form: "talo-mi-na",
            gloss: "walk-present-1sg",
            morphemes: ["talo", "-mi", "-na"]
          }
        ]
      }
    ],
    dialectVariants: [
      {
        id: "avn-dialect-river",
        name: "River teaching register",
        regionLabel: "river-side workshop register",
        phonologyNotes: ["First-person endings may lengthen in careful teaching speech."],
        lexicalNotes: ["mira remains the preferred public form for river."],
        grammarNotes: ["Person suffixes stay transparent after tense markers."],
        examplePhrases: [
          {
            standard: "mira talo-mi-na",
            variant: "mira talo-mi-nena",
            translation: "I walk by the river."
          }
        ]
      }
    ],
    grammarRules: [
      {
        id: "avn-rule-verb-chain",
        topic: "morphology/verb/tense-person-suffix-chain",
        explanation: "Avenik finite verbs use root + tense + person suffixes.",
        evidencePassageIds: ["avn-c001", "avn-c002"],
        confidence: "high"
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
      paradigms: 1,
      dialectVariants: 1,
      corpusPassages: 1,
      notes: 2,
      exercises: 2,
      exerciseTypes: { translate_to_target: 1, segment: 1 }
    }
  };
}

describe("App", () => {
  beforeEach(() => {
    apiMock.fetchCurrentUser.mockResolvedValue({ id: "local-reviewer", name: "Local Reviewer", role: "reviewer" });
    apiMock.fetchExerciseSubmissions.mockResolvedValue([]);
    apiMock.fetchLlmStatus.mockResolvedValue({
      provider: "deterministic",
      mode: "deterministic",
      configured: true,
      activeProviderName: "deterministic",
      timeoutMs: 30000,
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
      warnings: ["No LLM provider configured; using deterministic fallback for safe local development."]
    });
    apiMock.fetchLanguageProfile.mockResolvedValue(createLanguageProfile());
    apiMock.createAiSession.mockResolvedValue({
      messages: [{ role: "assistant", content: "Safe practice prompt from provider." }]
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
        content: "Only reviewers may approve synthetic notes.",
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
      content: "Synthetic outputs must cite reviewed notes.",
      effectiveDate: "2026-06-06",
      approvedBy: "lead-1"
    });
    apiMock.fetchEvaluationArtifact.mockResolvedValue({
      exportVersion: "synthetic-evaluation-artifact-v1",
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
      exportVersion: "synthetic-language-snapshot-v1",
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
        description: "Synthetic agglutinative language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      },
      linguisticProfile: {
        phonology: {
          consonants: ["p", "t", "k"],
          vowels: ["a", "i", "o"],
          syllableTemplate: "CV",
          stress: "word-initial",
          phonotactics: ["Consonant clusters are disallowed inside native roots."]
        },
        paradigms: [
          {
            id: "avn-paradigm-verb-chain",
            title: "Finite verb chain",
            description: "Transparent Avenik finite verbs combine root + tense suffix + person suffix.",
            rows: [
              {
                label: "present first singular",
                form: "talo-mi-na",
                gloss: "walk-present-1sg",
                morphemes: ["talo", "-mi", "-na"]
              }
            ]
          }
        ],
        dialectVariants: [
          {
            id: "avn-dialect-river",
            name: "River teaching register",
            regionLabel: "river-side workshop register",
            phonologyNotes: ["First-person endings may lengthen in careful teaching speech."],
            lexicalNotes: ["mira remains the preferred public form for river."],
            grammarNotes: ["Person suffixes stay transparent after tense markers."],
            examplePhrases: [
              {
                standard: "mira talo-mi-na",
                variant: "mira talo-mi-nena",
                translation: "I walk by the river."
              }
            ]
          }
        ],
        vocabulary: [
          { id: "avn-s-001", form: "-mi", gloss: "present tense", partOfSpeech: "suffix", tags: ["tense"] },
          { id: "avn-v-001", form: "talo", gloss: "walk", partOfSpeech: "verb", tags: ["motion"] }
        ],
        grammarRules: [
          {
            id: "avn-rule-verb-chain",
            topic: "morphology/verb/tense-person-suffix-chain",
            explanation: "Avenik finite verbs use root + tense + person suffixes.",
            evidencePassageIds: ["avn-c001"],
            confidence: "high"
          }
        ],
        stats: {
          vocabularyItems: 2,
          grammarRules: 1,
          paradigms: 1,
          dialectVariants: 1,
          corpusPassages: 1,
          notes: 2,
          exercises: 2,
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
          content: "Only reviewers may approve synthetic notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ],
      evaluations: createDashboardData().evaluations
    });
    apiMock.generateDraftNotes.mockResolvedValue([]);
    apiMock.runEvaluation.mockResolvedValue([]);
    apiMock.reviewNote.mockResolvedValue({});
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Accepted synthetic exercise submission."
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Atlas language sidebar, synthetic notice, and corpus surface", async () => {
    await renderReady();

    expect(await screen.findByText("Local Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Synthetic prototype")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Avenik.*agglutinative/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Solari.*isolating/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Corpus Browser" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Note Review Queue" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Learning Lab" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evaluation Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model Setup" })).toBeInTheDocument();
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

  it("imports corpus passages from the Corpus Browser and refreshes the source list", async () => {
    const initialData = createDashboardData();
    const createdPassage = {
      id: "imported-corpus-avenik-2",
      languageId: "avenik",
      source: "synthetic-field-lab",
      sourceMetadata: {
        author: "reviewer-1",
        year: 2026,
        license: "synthetic-only",
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
        use: "synthetic-testing-only" as const,
        restrictions: ["synthetic-only"]
      }
    };

    apiMock.fetchDashboardData
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce({
        ...initialData,
        corpus: [...initialData.corpus, createdPassage]
      });
    apiMock.importCorpusPassage.mockResolvedValue(createdPassage);

    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Corpus Browser" });

    fireEvent.change(screen.getByLabelText("Corpus target text"), {
      target: { value: "mira lumo-ke talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("English translation"), {
      target: { value: "I walk by the river near the practice mat." }
    });
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "synthetic-field-lab" }
    });
    fireEvent.change(screen.getByLabelText("Author"), {
      target: { value: "reviewer-1" }
    });
    fireEvent.change(screen.getByLabelText("Year"), {
      target: { value: "2026" }
    });
    fireEvent.change(screen.getByLabelText("License"), {
      target: { value: "synthetic-only" }
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
      target: { value: "synthetic-only" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import passage" }));

    await waitFor(() => expect(apiMock.importCorpusPassage).toHaveBeenCalledWith("avenik", {
      source: "synthetic-field-lab",
      sourceMetadata: {
        author: "reviewer-1",
        year: 2026,
        license: "synthetic-only",
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
        use: "synthetic-testing-only",
        restrictions: ["synthetic-only"]
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
    expect(status).toHaveTextContent("Loading synthetic data...");

    initialLoad.resolve(createDashboardData());
    expect(await screen.findByRole("heading", { level: 1, name: "Corpus Browser" })).toBeInTheDocument();
  });

  it("announces load errors through an alert region", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Synthetic data unavailable"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic data unavailable");
  });

  it("navigates between review, learner, evaluation, governance, and model views", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Note Review Queue" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Review queue" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Learning Lab" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Learner Exercise Preview" })).toBeInTheDocument();
    expect(screen.getByLabelText("Exercise answer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Evaluation Dashboard" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Evaluation Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run System Eval" })).toBeInTheDocument();
    expect(screen.getByText("Avenik synthetic evaluation completed.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Governance" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Governance & Policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Synthetic-Only Policy" })).toBeInTheDocument();
    expect(await screen.findByText("Only reviewers may approve synthetic notes.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Model Setup" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Model Setup" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "LLM provider readiness" })).toBeInTheDocument();
  });

  it("loads a language profile with grammar rules and vocabulary", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Language Profile" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Language Profile" })).toBeInTheDocument();
    expect(apiMock.fetchLanguageProfile).toHaveBeenCalledWith("avenik");
    expect(await screen.findByRole("region", { name: "Grammar inventory" })).toBeInTheDocument();
    expect(screen.getByText("morphology/verb/tense-person-suffix-chain")).toBeInTheDocument();
    expect(screen.getByText("Avenik finite verbs use root + tense + person suffixes.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Phonology profile" })).toBeInTheDocument();
    expect(screen.getByText("word-initial")).toBeInTheDocument();
    expect(screen.getByText("Consonant clusters are disallowed inside native roots.")).toBeInTheDocument();
    const paradigmTables = screen.getByRole("region", { name: "Paradigm tables" });
    expect(paradigmTables).toBeInTheDocument();
    expect(screen.getByText("Finite verb chain")).toBeInTheDocument();
    expect(within(paradigmTables).getByText("talo-mi-na")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dialect variants" })).toBeInTheDocument();
    expect(screen.getByText("River teaching register")).toBeInTheDocument();
    expect(screen.getByText("river-side workshop register")).toBeInTheDocument();
    expect(screen.getByText("mira talo-mi-nena")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vocabulary inventory" })).toBeInTheDocument();
    expect(screen.getByText("-mi")).toBeInTheDocument();
    expect(screen.getByText("present tense")).toBeInTheDocument();
    const morphemeInventory = screen.getByRole("region", { name: "Morpheme inventory" });
    expect(within(morphemeInventory).getAllByText("mira").length).toBeGreaterThan(0);
    expect(within(morphemeInventory).getByText("3 corpus uses")).toBeInTheDocument();
    expect(within(morphemeInventory).getAllByText("avn-c001").length).toBeGreaterThan(0);
  });

  it("runs a model provider smoke test without exposing browser-side keys", async () => {
    await renderReady();

    fireEvent.click(screen.getByRole("button", { name: "Model Setup" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run provider smoke test" }));

    await waitFor(() => expect(apiMock.createAiSession).toHaveBeenCalledWith({
      languageId: "avenik",
      mode: "learner_practice",
      seedPrompt: "Create one concise, safe practice prompt using only the provided public synthetic context.",
      contextNoteIds: ["avn-rule-verb-chain-note", "avn-rule-case-note"],
      contextPassageIds: ["avn-c001"]
    }));
    expect(await screen.findByText("Safe practice prompt from provider.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Model Setup" }));
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
          content: "Only reviewers may approve synthetic notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "governance-1",
          languageId: "avenik",
          policyType: "access",
          content: "Only reviewers may approve synthetic notes.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        },
        {
          id: "governance-2",
          languageId: "avenik",
          policyType: "generation",
          content: "Synthetic outputs must cite reviewed notes.",
          effectiveDate: "2026-06-06",
          approvedBy: "lead-1"
        }
      ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

    expect(await screen.findByText("Only reviewers may approve synthetic notes.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Policy type"), { target: { value: "generation" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText("Policy content"), {
      target: { value: "Synthetic outputs must cite reviewed notes." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create policy record" }));

    await waitFor(() => expect(apiMock.createGovernanceRecord).toHaveBeenCalledWith({
      languageId: "avenik",
      policyType: "generation",
      content: "Synthetic outputs must cite reviewed notes.",
      effectiveDate: "2026-06-06"
    }));
    expect(await screen.findByText("Governance policy recorded.")).toBeInTheDocument();
    expect(await screen.findByText("Synthetic outputs must cite reviewed notes.")).toBeInTheDocument();
  });

  it("updates the review policy for the selected language", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

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
        summary: "Reviewed synthetic note avn-rule-verb-chain-note.",
        metadata: { status: "under_review" }
      }
    ]);

    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

    fireEvent.click(await screen.findByRole("button", { name: "Export review snapshot" }));

    await waitFor(() => expect(apiMock.fetchLanguageSnapshot).toHaveBeenCalledWith("avenik"));
    expect(await screen.findByText("Snapshot ready: 1 corpus passage, 2 notes, 2 exercises, 2 vocabulary items, 1 grammar rule, 1 paradigm table, 1 dialect variant, integrity sha256:0123456789ab.")).toBeInTheDocument();
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
    expect(await screen.findByText("Solari / Corpus Browser")).toBeInTheDocument();
  });

  it("generates draft notes for the selected language and refreshes the review queue", async () => {
    const draftRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.generateDraftNotes.mockReturnValue(draftRun.promise);

    render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Corpus Browser" });
    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));
    const languageButton = await screen.findByRole("button", { name: /Avenik.*agglutinative/i });
    fireEvent.click(screen.getByRole("button", { name: "Generate AI Drafts" }));

    await waitFor(() => expect(languageButton).toBeDisabled());
    expect(screen.getByRole("button", { name: "Drafting..." })).toBeDisabled();

    draftRun.resolve([]);

    await waitFor(() => expect(apiMock.generateDraftNotes).toHaveBeenCalledWith("avenik"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate AI Drafts" })).toBeEnabled());
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("runs evaluation from the eval view and disables language switching while refresh is in flight", async () => {
    const evaluationRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockReturnValue(evaluationRun.promise);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Evaluation Dashboard" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Evaluation Dashboard" }));

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
        summary: "Avenik synthetic evaluation completed."
      }
    ];
    apiMock.fetchDashboardData.mockResolvedValue(dashboardData);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Evaluation Dashboard" }));

    expect(await screen.findByRole("region", { name: "Evaluation trends" })).toBeInTheDocument();
    expect(screen.getByText("Avenik regressed by 10 pts since previous run.")).toBeInTheDocument();
    expect(screen.getByText("noteQuality -10 pts")).toBeInTheDocument();
    expect(screen.getByText("corpusCoverage -10 pts")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Elder workspace" }));

    expect(await screen.findByText("Mention suffix order before approval.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept correction elder-correction-1" }));

    await waitFor(() => expect(apiMock.reviewElderCorrection).toHaveBeenCalledWith("elder-correction-1", "accepted"));
    expect(await screen.findByText("Status: accepted")).toBeInTheDocument();
    expect(screen.getByText("Reviewed by lead-1")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Elder workspace" }));

    const explanationInput = await screen.findByLabelText("Revised explanation for elder-correction-1");
    fireEvent.change(explanationInput, { target: { value: revisedExplanation } });
    fireEvent.click(screen.getByRole("button", { name: "Apply correction elder-correction-1" }));

    await waitFor(() =>
      expect(apiMock.applyElderCorrection).toHaveBeenCalledWith("elder-correction-1", revisedExplanation)
    );
    expect(await screen.findByText("Status: applied")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));

    fireEvent.click(await screen.findByRole("button", { name: reviewCase.buttonName }));

    await waitFor(() =>
      expect(apiMock.reviewNote).toHaveBeenCalledWith("avn-rule-verb-chain-note", {
        status: reviewCase.status,
        reviewerComment: reviewCase.reviewerComment
      })
    );
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("edits the selected note explanation from the review queue", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));

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
    await screen.findByRole("heading", { level: 1, name: "Corpus Browser" });
    fireEvent.click(screen.getByRole("button", { name: "Note Review Queue" }));

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
      explanation: "Accepted synthetic exercise submission."
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Learning Lab" }));

    const answerBox = await screen.findByLabelText("Exercise answer");
    fireEvent.change(answerBox, { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.submitExerciseAnswer).toHaveBeenCalledWith("avn-ex001", "mira talo-mi-na"));
    expect(await screen.findByText("Accepted synthetic exercise submission.")).toBeInTheDocument();
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
          explanation: "Answer did not match the synthetic exercise key.",
          submittedAt: "2026-06-03T15:00:00.000Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "submission-2",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: true,
          explanation: "Accepted synthetic exercise submission.",
          submittedAt: "2026-06-03T15:01:00.000Z"
        }
      ]);
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Accepted synthetic exercise submission."
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Learning Lab" }));

    const history = await screen.findByRole("region", { name: "Exercise submission history" });
    expect(await within(history).findByText("Answer did not match the synthetic exercise key.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Exercise answer"), { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex001"));
    expect(await within(history).findByText("Accepted synthetic exercise submission.")).toBeInTheDocument();
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
      .mockResolvedValueOnce(refreshedData);
    apiMock.createExercise.mockResolvedValue(createdExercise);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Learning Lab" }));

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
    fireEvent.change(screen.getByLabelText("Adversarial answer"), {
      target: { value: "talo-mi-na mira" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason"), {
      target: { value: "Moves the finite verb before the locative noun." }
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
        { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." }
      ],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    }));
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
    expect(await screen.findByText("Exercise authored.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Translate into Avenik: I walk by the river./ })).toBeInTheDocument();
  });

  it("switches learner exercise selection and loads that exercise history", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Learning Lab" }));
    fireEvent.click(await screen.findByRole("button", { name: /Segment: nemi-lo-ki/ }));

    expect(await screen.findByRole("heading", { name: "Segment: nemi-lo-ki" })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex002"));
  });
});
