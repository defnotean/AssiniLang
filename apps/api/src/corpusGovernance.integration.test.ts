import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTestWorkspaceState,
  createEmptyState,
  JsonStore,
  TEST_LANGUAGE_ID,
  type AppState,
  type EvaluationRun,
  type Note
} from "@assini/db";
import { createServer } from "./server.js";

describe("corpus and governance integration", () => {
  const reviewedNoteId = "testlang-note-basic-order";
  const submissionExerciseId = "testlang-ex-002";
  const existingRun: EvaluationRun = {
    id: "existing-run",
    languageId: "archived-language",
    createdAt: "2026-06-03T00:00:00.000Z",
    systemVersion: "test-system",
    fixtureVersion: "test-fixture",
    scores: { retained: 1 },
    failures: [],
    summary: "Existing evaluation run."
  };

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  it("returns languages and corpus", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(1);

    const corpus = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()[0].languageId).toBe(TEST_LANGUAGE_ID);
  });

  it("imports validated corpus passages with provenance and audit metadata", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["learning", "imported"],
        consentStatus: {
          use: "testing-only",
          restrictions: ["local prototype import"]
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      source: "local-import",
      textTarget: "saku nemi-na",
      textTranslation: "The child teaches me.",
      topicTags: ["learning", "imported"],
      consentStatus: { use: "testing-only" }
    });
    expect(response.json().id).toMatch(/^imported-corpus-testlang-/);

    const corpus = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: response.json().id,
          textTarget: "saku nemi-na"
        })
      ])
    );

    const persisted = await store.read();
    expect(persisted.corpusAnswerKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passageId: response.json().id,
          languageId: TEST_LANGUAGE_ID,
          textTarget: "saku nemi-na",
          textTranslation: "The child teaches me.",
          morphologicalSegmentation: [
            { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
            { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
            { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
          ]
        })
      ])
    );

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "corpus.imported",
          entityType: "corpus",
          entityId: response.json().id,
          metadata: expect.objectContaining({
            source: "local-import",
            morphemeCount: 3,
            tagCount: 2,
            consentUse: "testing-only"
          })
        })
      ])
    );
  });

  it("rejects invalid corpus segmentation imports without mutating corpus", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [{ surface: "ghost", lemma: "ghost", gloss: "ghost", features: ["noun"] }],
        topicTags: ["learning"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Corpus segmentation surface is not present in target text: ghost",
      i18nKey: "errors.corpusImportValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports when segmentation omits a target token", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] }
        ],
        topicTags: ["learning"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Corpus segmentation does not cover target token: nemi-na",
      i18nKey: "errors.corpusImportValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports with morphemes outside the selected language lexicon", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "noru talo-na",
        textTranslation: "I walk near the invented token.",
        morphologicalSegmentation: [
          { surface: "noru", lemma: "noru", gloss: "invented-token", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Corpus morpheme is not grounded in the Testlang lexicon: noru",
      i18nKey: "errors.corpusImportValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports with target text outside the selected language phonology", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "mira-z talo-na",
        textTranslation: "I walk by the altered river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Corpus target text uses z outside Testlang phonology inventory: mira-z talo-na",
      i18nKey: "errors.corpusImportValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it.each([
    [
      "topic tags",
      {
        topicTags: ["learning", "imported", "learning"],
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ]
      },
      "Corpus topic tag is duplicated: learning"
    ],
    [
      "morpheme features",
      {
        topicTags: ["learning", "imported"],
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun", "noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ]
      },
      "Corpus morpheme feature is duplicated for saku: noun"
    ]
  ])("rejects corpus imports with duplicate %s without mutating corpus", async (_, overrides, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        ...overrides,
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error,
      i18nKey: "errors.corpusImportValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  const validCorpusImportPayload = {
    source: "local-import",
    sourceMetadata: {
      author: "Local Reviewer",
      year: 2026,
      license: "local-test-data",
      consentRecord: "local import consent"
    },
    textTarget: "saku nemi-na",
    textTranslation: "The child teaches me.",
    morphologicalSegmentation: [
      { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
      { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
      { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
    ],
    topicTags: ["learning", "imported"],
    consentStatus: {
      use: "testing-only",
      restrictions: ["local prototype import"]
    }
  };

  it("dry-runs corpus import validation without persisting", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });
    const before = await store.read();

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: validCorpusImportPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      errors: [],
      warnings: [],
      preview: validCorpusImportPayload
    });

    const after = await store.read();
    expect(after.corpus).toEqual(before.corpus);
    expect(after.auditEvents).toEqual(before.auditEvents);
  });

  it("dry-runs corpus import validation with body dryRun flag", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validCorpusImportPayload,
        dryRun: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      errors: [],
      preview: validCorpusImportPayload
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("returns validation errors from corpus dry-run without persisting", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validCorpusImportPayload,
        morphologicalSegmentation: [{ surface: "ghost", lemma: "ghost", gloss: "ghost", features: ["noun"] }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      errors: ["Corpus segmentation surface is not present in target text: ghost"],
      warnings: [],
      preview: null
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it.each(["corpus", "notes", "exercises"] as const)(
    "returns 404 for unknown language %s requests",
    async (resource) => {
      const app = createServer({ initialState: buildTestWorkspaceState() });

      const response = await app.inject({ method: "GET", url: `/languages/not-a-language/${resource}` });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "Language not found: not-a-language",
        i18nKey: "errors.languageNotFound"
      });
    }
  );

  it("runs evaluations and appends them to state", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);

    const evaluations = await app.inject({ method: "GET", url: "/evaluations", headers: authHeaders("reviewer-1") });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toHaveLength(1);
  });

  it.each([
    ["elders", "elder-1", 403, "Forbidden"],
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects evaluation list and run from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const list = await app.inject({
      method: "GET",
      url: "/evaluations",
      headers: authHeaders(userId)
    });
    expect(list.statusCode).toBe(statusCode);
    expect(list.json()).toEqual({ error });

    const run = await app.inject({
      method: "POST",
      url: "/evaluations/run",
      headers: authHeaders(userId)
    });
    expect(run.statusCode).toBe(statusCode);
    expect(run.json()).toEqual({ error });
  });

  it("returns a client error for evaluations without languages and preserves prior runs", async () => {
    const initialState: AppState = {
      ...createEmptyState(),
      evaluationRuns: [existingRun]
    };
    const app = createServer({ initialState });

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "No languages available to evaluate. Create a language from the sidebar first, then run System Eval.",
      i18nKey: "errors.noLanguagesToEvaluate"
    });

    const evaluations = await app.inject({ method: "GET", url: "/evaluations", headers: authHeaders("reviewer-1") });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toEqual([existingRun]);
  });

  it("reads and writes evaluation state through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(1);

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);

    const persisted = await store.read();
    expect(persisted.evaluationRuns).toHaveLength(1);
  });

  it("lets leads create auditable governance records for an existing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        policyType: "generation",
        content: "Generated Testlang outputs must cite reviewed notes before learner use.",
        effectiveDate: "2026-06-05"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      policyType: "generation",
      content: "Generated Testlang outputs must cite reviewed notes before learner use.",
      effectiveDate: "2026-06-05",
      approvedBy: "lead-1"
    });
    expect(response.json().id).toMatch(/^governance-testlang-generation-/);

    const governance = await app.inject({ method: "GET", url: "/governance", headers: authHeaders("lead-1") });
    expect(governance.statusCode).toBe(200);
    expect(governance.json()).toEqual([response.json()]);
  });

  it.each([
    ["elders", "elder-1", 200],
    ["reviewers", "reviewer-1", 200]
  ])("lets %s list governance records", async (_, userId, statusCode) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/governance",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual([]);
  });

  it.each([
    ["programmers", "programmer-1", 403, "Forbidden"],
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects governance list reads from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/governance",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("records protected data mutations in a role-gated audit trail", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const governance = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        policyType: "generation",
        content: "Generated outputs must cite reviewed notes.",
        effectiveDate: "2026-06-06"
      }
    });
    expect(governance.statusCode).toBe(201);

    const reviewed = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "Approved for audit trail coverage."
      }
    });
    expect(reviewed.statusCode).toBe(200);

    const submission = await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });
    expect(submission.statusCode).toBe(200);

    const evaluation = await app.inject({
      method: "POST",
      url: "/evaluations/run",
      headers: authHeaders("programmer-1")
    });
    expect(evaluation.statusCode).toBe(200);

    const learnerAudit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("learner-1")
    });
    expect(learnerAudit.statusCode).toBe(403);
    expect(learnerAudit.json()).toEqual({ error: "Forbidden" });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });

    expect(audit.statusCode).toBe(200);
    const events = audit.json() as Array<{
      id: string;
      at: string;
      actorId: string;
      actorRole: string;
      action: string;
      entityType: string;
      entityId: string;
      languageId: string;
      metadata: Record<string, unknown>;
    }>;
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(events.every((event) => Date.parse(event.at) > 0)).toBe(true);
    expect(events.every((event) => event.languageId === TEST_LANGUAGE_ID)).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "lead-1",
          actorRole: "lead",
          action: "governance_record.created",
          entityType: "governance_record",
          entityId: governance.json().id,
          languageId: TEST_LANGUAGE_ID,
          metadata: expect.objectContaining({ policyType: "generation" })
        }),
        expect.objectContaining({
          actorId: "reviewer-1",
          actorRole: "reviewer",
          action: "note.reviewed",
          entityType: "note",
          entityId: reviewedNoteId,
          languageId: TEST_LANGUAGE_ID,
          metadata: expect.objectContaining({
            requestedStatus: "approved",
            status: "under_review",
            approvalCount: 1,
            approvalThreshold: 2
          })
        }),
        expect.objectContaining({
          actorId: "learner-1",
          actorRole: "learner",
          action: "exercise_submission.created",
          entityType: "exercise_submission",
          languageId: TEST_LANGUAGE_ID,
          metadata: expect.objectContaining({ accepted: true, exerciseId: submissionExerciseId })
        }),
        expect.objectContaining({
          actorId: "programmer-1",
          actorRole: "programmer",
          action: "evaluation_run.created",
          entityType: "evaluation_run",
          languageId: TEST_LANGUAGE_ID
        })
      ])
    );
    expect(JSON.stringify(events)).not.toContain("saku talo-ki");
  });

  it("enforces per-language review policy assignments and approval thresholds", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const policy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      id: "review-policy-testlang",
      languageId: TEST_LANGUAGE_ID,
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedBy: "lead-1"
    });

    const fetchedPolicy = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("reviewer-1")
    });
    expect(fetchedPolicy.statusCode).toBe(200);
    expect(fetchedPolicy.json()).toEqual(policy.json());

    const firstApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "First assigned reviewer approves."
      }
    });

    expect(firstApproval.statusCode).toBe(200);
    expect(firstApproval.json()).toMatchObject({
      id: reviewedNoteId,
      status: "under_review",
      reviewer: expect.objectContaining({ lastReviewedBy: "reviewer-1" })
    });

    const unassignedApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("lead-1"),
      payload: {
        status: "approved",
        reviewerComment: "Lead is not assigned for this note."
      }
    });
    expect(unassignedApproval.statusCode).toBe(403);
    expect(unassignedApproval.json()).toEqual({
      error: `Reviewer is not assigned to approve notes for language: ${TEST_LANGUAGE_ID}`,
      i18nKey: "errors.reviewerNotAssigned"
    });

    const finalApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: {
        status: "approved",
        reviewerComment: "Second assigned reviewer approves."
      }
    });

    expect(finalApproval.statusCode).toBe(200);
    expect(finalApproval.json()).toMatchObject({
      id: reviewedNoteId,
      status: "approved",
      reviewer: expect.objectContaining({ lastReviewedBy: "elder-1" })
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "review_policy.upserted",
          entityType: "review_policy",
          entityId: "review-policy-testlang",
          metadata: expect.objectContaining({ approvalThreshold: 2 })
        }),
        expect.objectContaining({
          action: "note.reviewed",
          entityType: "note",
          entityId: reviewedNoteId,
          metadata: expect.objectContaining({
            requestedStatus: "approved",
            status: "under_review",
            approvalCount: 1,
            approvalThreshold: 2
          })
        }),
        expect.objectContaining({
          action: "note.reviewed",
          entityType: "note",
          entityId: reviewedNoteId,
          metadata: expect.objectContaining({
            requestedStatus: "approved",
            status: "approved",
            approvalCount: 2,
            approvalThreshold: 2
          })
        })
      ])
    );
  });

  it("trims review policy reviewer ids and defaults assignment enforcement", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const policy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: [" reviewer-1 ", " elder-1 "],
        approvalThreshold: 2
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true
    });
  });

  it("lets prototype reviewers update review policies while preserving lead policy authority", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store, enablePrototypeAuth: true });

    const session = await app.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "reviewer-1" }
    });
    expect(session.statusCode).toBe(200);
    const setCookie = session.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    const policy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: { cookie: cookieHeader?.split(";")[0] ?? "" },
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      id: "review-policy-testlang",
      languageId: TEST_LANGUAGE_ID,
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedBy: "lead-1"
    });

    const persisted = await store.read();
    expect(persisted.reviewPolicies.find((item) => item.languageId === TEST_LANGUAGE_ID)).toMatchObject({
      updatedBy: "lead-1"
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "reviewer-1",
          actorRole: "reviewer",
          action: "review_policy.upserted",
          entityType: "review_policy",
          entityId: "review-policy-testlang"
        })
      ])
    );
  });

  it("rejects review policies with impossible open reviewer quorum thresholds without mutation", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1")
    });

    const response = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 10,
        requiresAssignedReviewer: false
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Review policy approvalThreshold cannot exceed assignable reviewers" });

    const after = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1")
    });
    expect(after.json()).toEqual(before.json());
  });

  it("does not count stale approvals after review policy assignments change", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const originalPolicy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });
    expect(originalPolicy.statusCode).toBe(200);

    const staleApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "Approval before assignment changed."
      }
    });
    expect(staleApproval.statusCode).toBe(200);
    expect(staleApproval.json().status).toBe("under_review");

    const reassignedPolicy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["elder-1", "lead-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });
    expect(reassignedPolicy.statusCode).toBe(200);

    const firstCurrentApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: {
        status: "approved",
        reviewerComment: "First current assigned reviewer approves."
      }
    });
    expect(firstCurrentApproval.statusCode).toBe(200);
    expect(firstCurrentApproval.json().status).toBe("under_review");

    const finalCurrentApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("lead-1"),
      payload: {
        status: "approved",
        reviewerComment: "Second current assigned reviewer approves."
      }
    });
    expect(finalCurrentApproval.statusCode).toBe(200);
    expect(finalCurrentApproval.json().status).toBe("approved");
  });

  it("clears pending approval quorum when a note is deferred", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    const firstApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "First approval before deferral."
      }
    });
    expect(firstApproval.statusCode).toBe(200);
    expect(firstApproval.json().status).toBe("under_review");

    const deferred = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Defer until Elder confirms dialect scope."
      }
    });
    expect(deferred.statusCode).toBe(200);
    expect(deferred.json().status).toBe("deferred");

    const elderApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: {
        status: "approved",
        reviewerComment: "Elder approves after deferral."
      }
    });
    expect(elderApproval.statusCode).toBe(200);
    expect(elderApproval.json().status).toBe("under_review");

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "note.reviewed",
          entityId: reviewedNoteId,
          metadata: expect.objectContaining({
            requestedStatus: "approved",
            status: "under_review",
            approvalCount: 1,
            approvalThreshold: 2
          })
        })
      ])
    );
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects governance writes from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders(userId),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        policyType: "access",
        content: "Only reviewers may approve lesson notes.",
        effectiveDate: "2026-06-05"
      }
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });

    const governance = await app.inject({ method: "GET", url: "/governance", headers: authHeaders("lead-1") });
    expect(governance.json()).toEqual([]);
  });

  it.each([
    [
      "missing content",
      { languageId: TEST_LANGUAGE_ID, policyType: "consent", effectiveDate: "2026-06-05" },
      "Invalid governance body"
    ],
    [
      "invalid policy type",
      { languageId: TEST_LANGUAGE_ID, policyType: "retention", content: "Policy.", effectiveDate: "2026-06-05" },
      "Invalid governance body"
    ],
    [
      "unparseable effective date",
      { languageId: TEST_LANGUAGE_ID, policyType: "consent", content: "Policy.", effectiveDate: "not-a-date" },
      "Invalid governance body"
    ],
    [
      "unknown language",
      { languageId: "not-a-language", policyType: "consent", content: "Policy.", effectiveDate: "2026-06-05" },
      "Language not found: not-a-language"
    ]
  ])("rejects %s governance writes without mutating records", async (_, payload, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload
    });

    expect(response.statusCode).toBe(error.startsWith("Language not found") ? 404 : 400);
    expect(response.json()).toEqual({ error });

    const governance = await app.inject({ method: "GET", url: "/governance", headers: authHeaders("lead-1") });
    expect(governance.json()).toEqual([]);
  });
});
