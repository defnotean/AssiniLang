import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCurrentUser,
  fetchAuditEvents,
  fetchDashboardData,
  fetchEvaluationArtifact,
  fetchLanguageProfile,
  fetchLanguageSnapshot,
  fetchLlmStatus,
  fetchReviewPolicy,
  fetchReviewDispositions,
  generateDraftNotes,
  createExercise,
  importCorpusPassage,
  createGovernanceRecord,
  updateReviewPolicy,
  resolveReviewDisposition,
  reviewNote,
  applyElderCorrection,
  reviewElderCorrection,
  submitExerciseAnswer,
  createAiSession
} from "./api";

describe("fetchDashboardData", () => {
  afterEach(() => {
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

  const jsonRequest = {
    credentials: "include" as const,
    headers: { "Content-Type": "application/json" }
  };

  const actorRequest = {
    credentials: "include" as const,
    headers: {}
  };

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

  it("opens a reviewer prototype session before importing encoded corpus passages", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "imported-corpus-avenik-2" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
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

    await importCorpusPassage("avenik/test language", payload);

    expectPrototypeSession(fetchMock, "reviewer-1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/languages/avenik%2Ftest%20language/corpus", {
      method: "POST",
      ...jsonRequest,
      body: JSON.stringify(payload)
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

  it("fetches redacted LLM provider readiness without browser auth secrets", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ configured: true, apiKey: { configured: false } })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchLlmStatus();

    expect(fetchMock).toHaveBeenCalledWith("/api/llm/status", undefined);
  });

  it("fetches encoded synthetic language profiles", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        language: { id: "avenik/test language" },
        phonology: { consonants: [], vowels: [], syllableTemplate: "", stress: "", phonotactics: [] },
        paradigms: [],
        dialectVariants: [],
        vocabulary: [],
        grammarRules: [],
        stats: {
          vocabularyItems: 0,
          grammarRules: 0,
          paradigms: 0,
          dialectVariants: 0,
          corpusPassages: 0,
          notes: 0,
          exercises: 0,
          exerciseTypes: {}
        }
      })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await fetchLanguageProfile("avenik/test language");

    expect(fetchMock).toHaveBeenCalledWith("/api/languages/avenik%2Ftest%20language/profile", undefined);
  });

  it("includes server error bodies and status codes in query failures", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: "LLM provider is offline" })
    }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLlmStatus()).rejects.toThrow("Request failed: /llm/status (503): LLM provider is offline");
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
      content: "Synthetic outputs must cite reviewed notes.",
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
    expectPrototypeSession(fetchMock, "reviewer-1", 2);
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/languages/avenik%2Ftest%20language/review-policy", {
      method: "PUT",
      ...jsonRequest,
      body: JSON.stringify(payload)
    });
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

  it("fetches and resolves encoded review dispositions through role-aware prototype auth", async () => {
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
    expectPrototypeSession(fetchMock, "reviewer-1", 2);
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/review-dispositions/review%2Fdisposition%201/resolve", {
      method: "PATCH",
      ...jsonRequest,
      body: JSON.stringify({ resolutionSummary: "Resolved after Elder review." })
    });
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
        exportVersion: "synthetic-language-snapshot-v1",
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
        exportVersion: "synthetic-evaluation-artifact-v1",
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
});
