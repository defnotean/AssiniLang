import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  checkLlmReachability,
  closePrototypeSession,
  fetchCurrentUser,
  fetchAuditEvents,
  fetchDashboardData,
  fetchEvaluationArtifact,
  fetchExerciseSubmissions,
  fetchLanguageProfile,
  fetchLanguageSnapshot,
  fetchDiscoveredModels,
  fetchLlmStatus,
  fetchRuntimeSettings,
  fetchReviewPolicy,
  fetchReviewDispositions,
  generateDraftNotes,
  createExercise,
  generateModelExercise,
  importCorpusPassage,
  importCorpusBulk,
  validateCorpusImport,
  validateCorpusBulk,
  validateExerciseAuthoring,
  createGovernanceRecord,
  updateReviewPolicy,
  resolveReviewDisposition,
  reviewNote,
  applyElderCorrection,
  reviewElderCorrection,
  submitExerciseAnswer,
  fetchRecommendedExercises,
  createAiSession,
  bulkReviewExtractionDrafts,
  acceptExtractionDraft,
  fetchExtractionDrafts,
  fetchGovernance,
  fetchSources,
  processSource,
  registerSource,
  rejectExtractionDraft,
  uploadSourceFile,
  updateRuntimeSettings
} from "./api";
import {
  assertOk,
  fetchAsActor,
  resetPrototypeSessionCache,
  actorRequest as buildActorRequest
} from "./lib/apiClient";

describe("fetchDashboardData", () => {
  afterEach(() => {
    resetPrototypeSessionCache();
    vi.unstubAllGlobals();
  });

  function expectPrototypeSession(fetchMock: ReturnType<typeof vi.fn>, userId: string, callIndex = 0) {
    expect(fetchMock).toHaveBeenNthCalledWith(callIndex + 1, "/api/auth/prototype-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
  }

  function prototypeSessionPostCount(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter((call) =>
      String((call as unknown as [unknown])[0]).includes("/auth/prototype-session")
    ).length;
  }

  const jsonRequest = {
    credentials: "include" as const,
    headers: { "Content-Type": "application/json" }
  };

  const actorRequest = {
    credentials: "include" as const,
    headers: {}
  };

  async function expectApiError(
    promise: Promise<unknown>,
    expected: { message: string; status: number; requestId?: string }
  ) {
    let caught: unknown;

    try {
      await promise;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.message).toBe(expected.message);
    expect(error.status).toBe(expected.status);
    expect(error.requestId).toBe(expected.requestId);
  }

  it("encodes language ids before building language routes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchDashboardData("avenik/test language");

    expect(fetchMock).toHaveBeenCalledWith("/api/languages", undefined);
    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/corpus", undefined);
    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/notes", undefined);
    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/exercises", undefined);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/prototype-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "reviewer-1" })
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/evaluations", actorRequest);
  });

  it("opens an httpOnly prototype session before patching encoded note reviews", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "note/1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await reviewNote("note/1", {
      status: "approved",
      reviewerComment: "Approved in local prototype."
    });

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/notes/note%2F1/review", {
      method: "PATCH",
      ...jsonRequest,
      body: JSON.stringify({
        status: "approved",
        reviewerComment: "Approved in local prototype."
      })
    });
  });

  it("opens a learner prototype session before posting encoded exercise submissions", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ accepted: true })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await submitExerciseAnswer("exercise/1", "mira talo-mi-na");

    expectPrototypeSession(fetchMock, "learner-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/exercises/exercise%2F1/submissions", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ answer: "mira talo-mi-na" })
    });
  });

  it("opens a learner prototype session before fetching encoded exercise submission history", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchExerciseSubmissions("exercise/1");

    expectPrototypeSession(fetchMock, "learner-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/exercises/exercise%2F1/submissions", actorRequest);
  });

  it("opens a reviewer prototype session before creating encoded exercises", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "authored-exercise-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      type: "translate_to_target" as const,
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["mira talo-mi-na"],
      adversarialAnswers: [
        { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." }
      ],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    };

    await createExercise("avenik/test language", payload);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/exercises", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
  });

  it("posts exercise dry-run validation requests with the dryRun query flag", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        errors: [],
        warnings: [],
        preview: {
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
        }
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      type: "translate_to_target" as const,
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"],
      expectedAnswers: ["mira talo-mi-na"],
      adversarialAnswers: [
        { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." },
        { answer: "mira talo-na-mi", reason: "Reverses tense and person suffix order." }
      ],
      gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    };

    await validateExerciseAuthoring("avenik/test language", payload);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/exercises?dryRun=1", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
  });

  it("opens a reviewer prototype session before generating encoded model exercises", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ exercise: { type: "translate_to_target" }, warnings: [] })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await generateModelExercise("avenik/test language", { type: " translate_to_target " });

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/exercises/generate", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ type: "translate_to_target" })
    });
  });

  it("sends an empty body when generating model exercises without a type", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ exercise: { type: "translate_to_target" }, warnings: [] })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await generateModelExercise("avenik", { type: "   " });

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik/exercises/generate", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({})
    });
  });

  it("opens a reviewer prototype session before importing encoded corpus passages", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "imported-corpus-avenik-2" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
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
        use: "testing-only" as const,
        restrictions: ["internal-only"]
      }
    };

    await importCorpusPassage("avenik/test language", payload);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/corpus", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
  });

  it("posts corpus dry-run validation requests with the dryRun query flag", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        errors: [],
        warnings: [],
        preview: null
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      source: "field-notebook",
      sourceMetadata: {
        author: "Local Reviewer",
        year: 2026,
        license: "user-provided",
        consentRecord: "local import consent"
      },
      textTarget: "mira lumo-ke talo-mi-na",
      textTranslation: "I walk by the river at the practice mat.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] }
      ],
      topicTags: ["movement"],
      consentStatus: {
        use: "testing-only" as const,
        restrictions: []
      }
    };

    await validateCorpusImport("avenik/test language", payload);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/corpus?dryRun=1", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
  });

  it("posts corpus bulk import requests with passages payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        dryRun: false,
        imported: 1,
        failed: 0,
        results: []
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
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
        { surface: "mira", lemma: "river", gloss: "river", features: ["noun"] }
      ],
      topicTags: ["movement"],
      consentStatus: {
        use: "testing-only" as const,
        restrictions: []
      }
    };

    await importCorpusBulk("avenik/test language", [payload]);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/corpus/bulk", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ passages: [payload] })
    });
  });

  it("posts corpus bulk dry-run validation with the dryRun query flag", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        dryRun: true,
        imported: 1,
        failed: 0,
        results: []
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      source: "field-notebook",
      sourceMetadata: {
        author: "Local Reviewer",
        year: 2026,
        license: "user-provided",
        consentRecord: "local import consent"
      },
      textTarget: "mira lumo-ke talo-mi-na",
      textTranslation: "I walk by the river at the practice mat.",
      morphologicalSegmentation: [
        { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] }
      ],
      topicTags: ["movement"],
      consentStatus: {
        use: "testing-only" as const,
        restrictions: []
      }
    };

    await validateCorpusBulk("avenik/test language", [payload]);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/corpus/bulk?dryRun=1", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ passages: [payload] })
    });
  });

  it("posts draft generation requests for the selected language", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await generateDraftNotes("avenik/test language");

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/study-loop/draft", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ languageId: "avenik/test language" })
    });
  });

  it("fetches the current user profile through a prototype session cookie", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "local-reviewer", name: "Local Reviewer", role: "reviewer" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchCurrentUser();

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/users/me", actorRequest);
  });

  it("fetches redacted LLM provider readiness through a programmer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ configured: true, apiKey: { configured: false } })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchLlmStatus();

    expectPrototypeSession(fetchMock, "programmer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/llm/status", actorRequest);
  });

  it("fetches runtime settings through a programmer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ settings: { provider: "deterministic" }, status: { configured: true } })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchRuntimeSettings();

    expectPrototypeSession(fetchMock, "programmer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/llm/settings", actorRequest);
  });

  it("fetches discovered models through a programmer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ model: "irene-fusion" }], errors: [] })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchDiscoveredModels("http://irene-box:8080/v1");

    expectPrototypeSession(fetchMock, "programmer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^\/api\/llm\/models\?baseUrl=http%3A%2F%2Firene-box%3A8080%2Fv1&refresh=\d+$/),
      {
        ...actorRequest,
        cache: "no-store"
      }
    );
  });

  it("updates runtime settings through a programmer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ settings: { provider: "openai-compatible" }, status: { configured: true } })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      provider: "openai-compatible" as const,
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "irene-fusion",
      apiKey: "local-secret"
    };
    await updateRuntimeSettings(payload);

    expectPrototypeSession(fetchMock, "programmer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/llm/settings", {
      method: "PUT",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("x-assini-dev-token");
  });

  it("checks LLM reachability through a programmer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, status: "reachable" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await checkLlmReachability();

    expectPrototypeSession(fetchMock, "programmer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/llm/health-check", {
      method: "POST",
      ...actorRequest
    });
  });

  it("fetches encoded language profiles", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        language: { id: "avenik/test language" },
        phonology: { consonants: [], vowels: [], syllableTemplate: "", stress: "", phonotactics: [] },
        vocabulary: [],
        morphemeInventory: [],
        grammarRules: [],
        stats: {
          vocabularyItems: 0,
          grammarRules: 0,
          corpusPassages: 0,
          notes: 0,
          exercises: 0,
          sourceAssets: 0,
          pendingExtractionDrafts: 0,
          exerciseTypes: {}
        }
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchLanguageProfile("avenik/test language");

    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/profile", undefined);
  });

  it("includes server error bodies and status codes in query failures without request ids", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: "LLM provider is offline" })
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expectApiError(fetchLlmStatus(), {
      message: "Request failed: /llm/status (503): LLM provider is offline",
      status: 503,
      requestId: undefined
    });
  });

  it("includes x-request-id response headers in API error messages and properties", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: false,
        status: 503,
        headers: new Headers({ "x-request-id": "req-header-123" }),
        json: async () => ({ error: "LLM provider is offline" })
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expectApiError(fetchLlmStatus(), {
      message: "Request failed: /llm/status (503): LLM provider is offline (request id: req-header-123)",
      status: 503,
      requestId: "req-header-123"
    });
  });

  it("uses JSON requestId fields when API error headers are absent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: false,
        status: 413,
        json: async () => ({ error: "Payload is too large", requestId: "req-body-413" })
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await fetchLlmStatus();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.message).toBe(
      "Request failed: /llm/status (413): Payload is too large (request id: req-body-413)"
    );
    expect(error.status).toBe(413);
    expect(error.requestId).toBe("req-body-413");
    expect(error.i18nKey).toBe("errors.payloadTooLarge");
  });

  it("includes Retry-After guidance when rate-limited responses carry the header", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "12" }),
        json: async () => ({ error: "Rate limit exceeded" })
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await fetchLlmStatus();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.message).toBe(
      "Request failed: /llm/status (429): Rate limit exceeded Retry after 12 seconds."
    );
    expect(error.status).toBe(429);
    expect(error.requestId).toBeUndefined();
    expect(error.i18nKey).toBe("app.rateLimitExceeded");
    expect(error.i18nParams).toEqual({ seconds: 12 });
  });

  it("preserves body i18nParams seconds over Retry-After for rate limits", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "99" }),
        json: async () => ({
          error: "Rate limit exceeded",
          i18nKey: "app.rateLimitExceeded",
          i18nParams: { seconds: 7 }
        })
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await fetchLlmStatus();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.i18nKey).toBe("app.rateLimitExceeded");
    expect(error.i18nParams).toEqual({ seconds: 7 });
  });

  it("creates AI sessions with role-aware prototype auth and no browser API key", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "ai-session-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      languageId: "avenik",
      mode: "learner_practice" as const,
      seedPrompt: "Practice safely.",
      contextNoteIds: ["note-1"],
      contextPassageIds: ["passage-1"]
    };
    await createAiSession(payload);

    expectPrototypeSession(fetchMock, "learner-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/ai/sessions", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("x-assini-dev-token");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("ASSINI_LLM_API_KEY");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("OPENAI_API_KEY");
  });

  it("opens an elder prototype session before creating governance policy records", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "governance-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      languageId: "avenik",
      policyType: "generation" as const,
      content: "Generated outputs must cite reviewed notes.",
      effectiveDate: "2026-06-05"
    };
    await createGovernanceRecord(payload);

    expectPrototypeSession(fetchMock, "elder-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/governance", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
  });

  it("fetches and updates encoded review policies through role-aware prototype auth", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "review-policy-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchReviewPolicy("avenik/test language");
    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/languages/avenik%2Ftest%20language/review-policy",
      actorRequest
    );

    const payload = {
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true
    };
    await updateReviewPolicy("avenik/test language", payload);
    // Same actor reuses the open prototype session (no second POST).
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/languages/avenik%2Ftest%20language/review-policy", {
      method: "PUT",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
    expect(prototypeSessionPostCount(fetchMock)).toBe(1);
  });

  it("fetches encoded audit events through programmer prototype auth", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchAuditEvents("avenik/test language");

    expectPrototypeSession(fetchMock, "programmer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/audit/events?languageId=avenik%2Ftest%20language",
      actorRequest
    );
  });

  it("fetches and resolves review dispositions through role-aware prototype auth", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "review-disposition-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchReviewDispositions("avenik/test language");
    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/languages/avenik%2Ftest%20language/review-dispositions",
      actorRequest
    );

    await resolveReviewDisposition("review/disposition 1", "Resolved after Elder review.");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/review-dispositions/resolve", {
      method: "PATCH",
      ...jsonRequest,
      body: JSON.stringify({
        dispositionId: "review/disposition 1",
        resolutionSummary: "Resolved after Elder review."
      })
    });
    expect(prototypeSessionPostCount(fetchMock)).toBe(1);
  });

  it("opens an elder prototype session before reviewing encoded elder corrections", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "elder/correction 1", status: "accepted" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await reviewElderCorrection("elder/correction 1", "accepted");

    expectPrototypeSession(fetchMock, "elder-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/elder/corrections/elder%2Fcorrection%201/review", {
      method: "PATCH",
      ...jsonRequest,
      body: JSON.stringify({ status: "accepted" })
    });
  });

  it("opens an elder prototype session before applying encoded elder corrections", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ correction: { id: "elder/correction 1", status: "applied" }, note: { id: "note-1" } })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await applyElderCorrection("elder/correction 1", "Updated note explanation.");

    expectPrototypeSession(fetchMock, "elder-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/elder/corrections/elder%2Fcorrection%201/apply", {
      method: "PATCH",
      ...jsonRequest,
      body: JSON.stringify({ explanation: "Updated note explanation." })
    });
  });

  it("opens a reviewer prototype session before fetching encoded language snapshot exports", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        exportVersion: "language-snapshot-v2",
        language: { id: "avenik/test language" },
        corpus: [],
        notes: [],
        exercises: [],
        governance: [],
        evaluations: []
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchLanguageSnapshot("avenik/test language");

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/exports/languages/avenik%2Ftest%20language/snapshot", actorRequest);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("x-assini-dev-token");
  });

  it("opens a reviewer prototype session before fetching evaluation artifact exports", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        exportVersion: "evaluation-artifact-v2",
        exportedAt: "2026-06-06T00:00:00.000Z",
        summary: { languages: 4, totalRuns: 4, latestRuns: 4, failedLatestRuns: 0, averageLatestScore: 1, passed: true, failureCount: 0 },
        latestRuns: [],
        runsByLanguage: {},
        failureLines: []
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchEvaluationArtifact();

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/exports/evaluations/artifact", actorRequest);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("x-assini-dev-token");
  });

  it("includes server validation messages in mutation failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Contested notes require a substantive reviewer comment." })
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(reviewNote("note-1", { status: "contested" })).rejects.toThrow(
      "Note review failed (400): Contested notes require a substantive reviewer comment."
    );
  });

  it("fetches encoded source lists through a reviewer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchSources("avenik/test language");

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/sources", actorRequest);
  });

  it("fetches governance records through a reviewer prototype session", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchGovernance();

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/governance", actorRequest);
  });

  it("opens a reviewer prototype session before registering encoded sources", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "source-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      kind: "text" as const,
      title: "Elder story",
      rawText: "mira talo-mi-na",
      url: "https://example.test/story"
    };
    await registerSource("avenik/test language", payload);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/sources", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
  });

  it("uploads encoded source files as multipart without a manual content-type", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "source-upload-1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["audio-bytes"], "elder recording.wav", { type: "audio/wav" });
    await uploadSourceFile("avenik/test language", file, "  Elder recording  ");

    expectPrototypeSession(fetchMock, "reviewer-1");
    const uploadCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(uploadCall[0]).toBe("/api/languages/avenik%2Ftest%20language/sources/upload");
    const request = uploadCall[1];
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.headers).toEqual({});
    expect(request.body).toBeInstanceOf(FormData);
    const formData = request.body as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("title")).toBe("Elder recording");
  });

  it("processes encoded sources synchronously without a JSON body by default", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ asset: { id: "source-1" }, drafts: [], warnings: [] })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await processSource("source/1");

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sources/source%2F1/process", {
      method: "POST",
      ...actorRequest
    });
  });

  it("processes encoded sources asynchronously with the async JSON flag", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ asset: { id: "source-1" }, drafts: [], warnings: [] })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await processSource("source/1", { async: true });

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sources/source%2F1/process", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ async: true })
    });
  });

  it("opens a reviewer prototype session before fetching encoded proposed extraction drafts", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => []
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchExtractionDrafts("avenik/test language", "proposed");

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/languages/avenik%2Ftest%20language/extraction-drafts?status=proposed",
      actorRequest
    );
  });

  it("opens a reviewer prototype session before accepting and rejecting encoded drafts", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "draft/1" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await acceptExtractionDraft("draft/1");
    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/extraction-drafts/draft%2F1/accept", {
      method: "POST",
      ...actorRequest
    });

    await acceptExtractionDraft("draft/3", { preferLexiconSegmentation: true });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/extraction-drafts/draft%2F3/accept", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ preferLexiconSegmentation: true })
    });

    const editedSegmentation = [
      { surface: "mira", lemma: "mira", gloss: "stream", features: ["noun"] }
    ];
    await acceptExtractionDraft("draft/4", { morphologicalSegmentation: editedSegmentation });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/extraction-drafts/draft%2F4/accept", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify({ morphologicalSegmentation: editedSegmentation })
    });

    await rejectExtractionDraft("draft/2");
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/extraction-drafts/draft%2F2/reject", {
      method: "POST",
      ...actorRequest
    });
    expect(prototypeSessionPostCount(fetchMock)).toBe(1);
  });

  it("posts bulk extraction draft reviews as a reviewer", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ draftId: "draft-1", ok: true, committedEntityId: "lex-1" }],
        accepted: 1,
        rejected: 0,
        failed: 0
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await bulkReviewExtractionDrafts("avenik/test language", "accept", ["draft-1"]);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/extraction-drafts/bulk-review", {
      ...jsonRequest,
      method: "POST",
      body: JSON.stringify({ action: "accept", draftIds: ["draft-1"] })
    });
    expect(result.accepted).toBe(1);
    expect(result.results[0]).toMatchObject({ draftId: "draft-1", ok: true });
  });

  it("includes server validation messages in bulk review failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Too many draftIds: at most 50 per request." })
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(bulkReviewExtractionDrafts("avenik", "accept", ["a"])).rejects.toThrow(
      "Bulk extraction draft review failed (400): Too many draftIds: at most 50 per request."
    );
  });

  it("opens a learner prototype session before fetching encoded recommended exercises", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ exercises: [], rationale: [] })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRecommendedExercises("avenik/test language");

    expectPrototypeSession(fetchMock, "learner-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/languages/avenik%2Ftest%20language/exercises/recommended",
      actorRequest
    );
    expect(result).toEqual({ exercises: [], rationale: [] });
  });

  it("closes the prototype session with a credentialed DELETE request", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => undefined
    }));

    vi.stubGlobal("fetch", fetchMock);

    await closePrototypeSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/prototype-session", {
      method: "DELETE",
      credentials: "include"
    });
  });

  it("reuses one prototype session for repeated same-actor calls", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({ id: "reviewer-1" }) };
      }
      return { ok: true, json: async () => ({ id: "me" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCurrentUser();
    await fetchCurrentUser();

    expect(prototypeSessionPostCount(fetchMock)).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/users/me", actorRequest);
  });

  it("reopens once on 401 then succeeds, and again after sign-out", async () => {
    let sessionPosts = 0;
    let meCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/prototype-session") && init?.method === "POST") {
        sessionPosts += 1;
        return { ok: true, json: async () => ({ id: "reviewer-1" }) };
      }
      if (url.includes("/auth/prototype-session") && init?.method === "DELETE") {
        return { ok: true, status: 204, json: async () => undefined };
      }
      if (url.includes("/users/me")) {
        meCalls += 1;
        // First attempt after the initial open is stale; retry after reopen succeeds.
        if (meCalls === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Unauthorized" })
          };
        }
        return { ok: true, json: async () => ({ id: "me" }) };
      }
      return { ok: true, json: async () => ({ id: "me" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentUser()).resolves.toEqual({ id: "me" });
    expect(sessionPosts).toBe(2);
    expect(meCalls).toBe(2);

    await closePrototypeSession();
    await fetchCurrentUser();
    expect(sessionPosts).toBe(3);
  });

  it("surfaces 401 after a single reopen retry still fails", async () => {
    let sessionPosts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/prototype-session") && init?.method === "POST") {
        sessionPosts += 1;
        return { ok: true, json: async () => ({ id: "reviewer-1" }) };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentUser()).rejects.toMatchObject({
      name: "ApiError",
      status: 401
    });
    // Initial open + one reopen; no third POST (single retry only).
    expect(sessionPosts).toBe(2);
  });

  it("opens a new prototype session when the actor changes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchAsActor("learner", "/api/users/me");
    await fetchAsActor("reviewer", "/api/users/me");
    await fetchAsActor("learner", "/api/users/me");

    const sessionPosts = fetchMock.mock.calls
      .map((call) => call as unknown as [unknown, RequestInit?])
      .filter((call) => String(call[0]).includes("/auth/prototype-session"));
    expect(sessionPosts).toHaveLength(3);
    expect(JSON.parse(String(sessionPosts[0]?.[1]?.body))).toEqual({ userId: "learner-1" });
    expect(JSON.parse(String(sessionPosts[1]?.[1]?.body))).toEqual({ userId: "reviewer-1" });
    expect(JSON.parse(String(sessionPosts[2]?.[1]?.body))).toEqual({ userId: "learner-1" });
  });

  it("does not revive the reuse cache when a 401 invalidates during an in-flight open", async () => {
    let resolvePost: (() => void) | undefined;
    const postGate = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    let sessionPosts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/prototype-session") && init?.method === "POST") {
        sessionPosts += 1;
        await postGate;
        return { ok: true, json: async () => ({ id: "reviewer-1" }) };
      }
      return { ok: true, json: async () => ({ id: "me" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const openPromise = buildActorRequest("reviewer");
    // Wait until the POST is gated, then invalidate via a parallel 401.
    await Promise.resolve();
    await Promise.resolve();
    await expect(
      assertOk(
        {
          ok: false,
          status: 401,
          headers: { get: () => null },
          json: async () => ({ error: "Unauthorized" })
        } as unknown as Response,
        "stale"
      )
    ).rejects.toBeInstanceOf(ApiError);

    resolvePost?.();
    await openPromise;
    expect(sessionPosts).toBe(1);

    // Generation bumped during POST, so the completed open must not mark the session reusable.
    await buildActorRequest("reviewer");
    expect(sessionPosts).toBe(2);
  });

  it("serializes concurrent actorRequest opens so overlapping actors do not race", async () => {
    let inFlightPosts = 0;
    let maxInFlightPosts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        inFlightPosts += 1;
        maxInFlightPosts = Math.max(maxInFlightPosts, inFlightPosts);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightPosts -= 1;
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([buildActorRequest("learner"), buildActorRequest("reviewer")]);

    expect(maxInFlightPosts).toBe(1);
    expect(prototypeSessionPostCount(fetchMock)).toBe(2);
  });

  it("serializes fetchAsActor the same way as actorRequest", async () => {
    let inFlightPosts = 0;
    let maxInFlightPosts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/auth/prototype-session")) {
        inFlightPosts += 1;
        maxInFlightPosts = Math.max(maxInFlightPosts, inFlightPosts);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightPosts -= 1;
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchAsActor("learner", "/api/users/me"),
      fetchAsActor("reviewer", "/api/users/me")
    ]);

    expect(maxInFlightPosts).toBe(1);
    expect(prototypeSessionPostCount(fetchMock)).toBe(2);
  });

  it("serializes sign-out with actor opens so DELETE cannot overlap a POST", async () => {
    let inFlightAuth = 0;
    let maxInFlightAuth = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/auth/prototype-session")) {
        inFlightAuth += 1;
        maxInFlightAuth = Math.max(maxInFlightAuth, inFlightAuth);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightAuth -= 1;
        return {
          ok: true,
          status: init?.method === "DELETE" ? 204 : 200,
          json: async () => ({})
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([buildActorRequest("learner"), closePrototypeSession()]);

    expect(maxInFlightAuth).toBe(1);
  });

  it("includes server error details when prototype sign-out fails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "session store unavailable" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(closePrototypeSession()).rejects.toThrow(
      "Prototype sign-out failed (500): session store unavailable"
    );
  });
});
