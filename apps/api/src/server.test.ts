import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore, type AppState, type EvaluationRun, type Note } from "@assini/db";
import { draftNotesForLanguage } from "@assini/eval";
import { buildSeedState } from "@assini/synthetic-langs";
import { resolveRuntimeDbPath } from "./runtimePath";
import { createServer } from "./server";
import type { LlmProvider } from "./llmProvider";

const SHA_256_HEX = /^[a-f0-9]{64}$/;
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];

describe("api server", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const reviewedNoteId = "avn-rule-verb-chain-note";
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
  const authUsers: AppState["users"] = [
    { id: "learner-1", name: "Learner One", role: "learner" },
    { id: "elder-1", name: "Elder One", role: "elder" },
    { id: "reviewer-1", name: "Reviewer One", role: "reviewer" },
    { id: "lead-1", name: "Lead One", role: "lead" },
    { id: "programmer-1", name: "Programmer One", role: "programmer" },
    { id: "admin-1", name: "Admin One", role: "admin" }
  ];

  function stateWithAuthUsers(): AppState {
    return { ...buildSeedState(), users: [...authUsers] };
  }

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  async function fetchReviewedNote(app: ReturnType<typeof createServer>) {
    const notes = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    return notes.json().find((item: { id: string }) => item.id === reviewedNoteId);
  }

  it("resolves the runtime database path from the repository root with an env override", () => {
    const indexUrl = pathToFileURL(join(repoRoot, "apps", "api", "src", "index.ts")).href;
    const overridePath = join(repoRoot, "tmp", "override-db.json");

    expect(resolveRuntimeDbPath({ env: {}, moduleUrl: indexUrl })).toBe(join(repoRoot, "data", "local-db.json"));
    expect(resolveRuntimeDbPath({ env: { ASSINI_DB_PATH: overridePath }, moduleUrl: indexUrl })).toBe(overridePath);
  });

  it("returns health, notes, and exercises", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const llmStatus = await app.inject({ method: "GET", url: "/llm/status" });
    expect(llmStatus.statusCode).toBe(200);
    expect(llmStatus.json()).toMatchObject({ configured: true, apiKey: { configured: false } });
    expect(llmStatus.json().apiKey).not.toHaveProperty("value");
    expect(llmStatus.json().apiKey).not.toHaveProperty("redactedValue");

    const notes = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    expect(notes.statusCode).toBe(200);
    expect(notes.json()[0].languageId).toBe("avenik");
    expect(JSON.stringify(notes.json())).not.toContain("answer key");
    expect(JSON.stringify(notes.json())).not.toContain("synthetic fixture evaluation");
    expect(JSON.stringify(notes.json())).not.toContain("fixture grammar rule");

    const exercises = await app.inject({ method: "GET", url: "/languages/avenik/exercises" });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()[0].languageId).toBe("avenik");
    expect(exercises.json()[0]).not.toHaveProperty("expectedAnswers");
    expect(exercises.json()[0]).not.toHaveProperty("gradingExplanation");
    expect(exercises.json()[0]).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(exercises.json())).not.toContain("Use mira for river");
  });

  it("returns a rich synthetic language profile without answer-key fields", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const profile = await app.inject({ method: "GET", url: "/languages/avenik/profile" });

    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      language: { id: "avenik", name: "Avenik", typology: "agglutinative" },
      stats: {
        corpusPassages: 10,
        grammarRules: 5,
        notes: 5,
        exercises: 5,
        vocabularyItems: 20,
        dialectVariants: 2
      }
    });
    expect(profile.json().grammarRules[0]).toMatchObject({
      id: "avn-rule-verb-chain",
      topic: "morphology/verb/tense-person-suffix-chain",
      evidencePassageIds: ["avn-c001", "avn-c002", "avn-c003"]
    });
    expect(profile.json().phonology).toMatchObject({
      syllableTemplate: "CV",
      stress: "word-initial"
    });
    expect(profile.json().phonology.phonotactics).toContain("Consonant clusters are disallowed inside native roots.");
    expect(profile.json().paradigms[0]).toMatchObject({
      id: "avn-paradigm-verb-chain",
      title: "Finite verb chain"
    });
    expect(profile.json().paradigms[0].rows[0]).toMatchObject({
      label: "present first singular",
      form: "talo-mi-na",
      morphemes: ["talo", "-mi", "-na"]
    });
    expect(profile.json().dialectVariants[0]).toMatchObject({
      id: "avn-dialect-river",
      name: "River teaching register",
      regionLabel: "river-side workshop register"
    });
    expect(profile.json().dialectVariants[0].examplePhrases[0]).toMatchObject({
      standard: "mira talo-mi-na",
      variant: "mira talo-mi-nena",
      translation: "I walk by the river."
    });
    expect(profile.json().vocabulary.find((item: { form: string }) => item.form === "-mi")).toMatchObject({
      gloss: "present tense",
      partOfSpeech: "suffix"
    });
    expect(profile.json().morphemeInventory.find((item: { surface: string }) => item.surface === "mira")).toMatchObject({
      lemma: "mira",
      glosses: ["river"],
      features: ["noun"],
      occurrenceCount: expect.any(Number),
      passageIds: expect.arrayContaining(["avn-c001"]),
      vocabulary: expect.objectContaining({
        form: "mira",
        partOfSpeech: "noun"
      })
    });
    expect(profile.json().stats.exerciseTypes).toMatchObject({
      translate_to_target: 3,
      segment: 1,
      choose_particle: 1
    });
    expect(JSON.stringify(profile.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(profile.json())).not.toContain("gradingExplanation");

    const missing = await app.inject({ method: "GET", url: "/languages/not-a-language/profile" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("restricts browser CORS to configured local development origins", async () => {
    const app = createServer({ initialState: buildSeedState(), allowedOrigins: ["http://localhost:5173"] });

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://example.invalid" }
    });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps prototype session auth explicit, cookie scoped, and non-admin", async () => {
    const disabled = createServer({ initialState: stateWithAuthUsers() });

    const disabledResponse = await disabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "elder-1" }
    });
    expect(disabledResponse.statusCode).toBe(404);
    expect(disabledResponse.json()).toEqual({ error: "Prototype auth is disabled" });

    const enabled = createServer({ initialState: stateWithAuthUsers(), enablePrototypeAuth: true });
    const session = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "elder-1" }
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ id: "elder-1", role: "elder" });
    const setCookie = session.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain("assini_prototype_session=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).not.toContain("elder-1");

    const currentUser = await enabled.inject({
      method: "GET",
      url: "/users/me",
      headers: { cookie: cookieHeader?.split(";")[0] ?? "" }
    });
    expect(currentUser.statusCode).toBe(200);
    expect(currentUser.json()).toMatchObject({ id: "elder-1", role: "elder" });

    const leadSession = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "lead-1" }
    });
    expect(leadSession.statusCode).toBe(200);
    expect(leadSession.json()).toMatchObject({ id: "lead-1", role: "lead" });

    const adminSession = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "admin-1" }
    });
    expect(adminSession.statusCode).toBe(403);
  });

  it("returns languages and corpus", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(4);

    const corpus = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()[0].languageId).toBe("avenik");
  });

  it("imports validated corpus passages with provenance and audit metadata", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "POST",
      url: "/languages/avenik/corpus",
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "synthetic-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "synthetic-only",
          consentRecord: "local synthetic import consent"
        },
        textTarget: "mira lumo-ke talo-mi-na",
        textTranslation: "I walk by the river at the practice mat.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "lumo-ke", lemma: "lumo", gloss: "practice-mat.locative", features: ["noun", "case-loc"] },
          { surface: "talo-mi-na", lemma: "talo", gloss: "walk.present.1sg", features: ["verb", "present", "1sg"] }
        ],
        topicTags: ["motion", "place", "imported"],
        consentStatus: {
          use: "synthetic-testing-only",
          restrictions: ["local prototype import"]
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: "avenik",
      source: "synthetic-import",
      textTarget: "mira lumo-ke talo-mi-na",
      textTranslation: "I walk by the river at the practice mat.",
      topicTags: ["motion", "place", "imported"],
      consentStatus: { use: "synthetic-testing-only" }
    });
    expect(response.json().id).toMatch(/^imported-corpus-avenik-/);

    const corpus = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: response.json().id,
        textTarget: "mira lumo-ke talo-mi-na"
      })
    ]));

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "corpus.imported",
        entityType: "corpus",
        entityId: response.json().id,
        metadata: expect.objectContaining({
          source: "synthetic-import",
          morphemeCount: 3,
          tagCount: 3,
          consentUse: "synthetic-testing-only"
        })
      })
    ]));
  });

  it("rejects invalid corpus segmentation imports without mutating corpus", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });

    const response = await app.inject({
      method: "POST",
      url: "/languages/avenik/corpus",
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "synthetic-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "synthetic-only",
          consentRecord: "local synthetic import consent"
        },
        textTarget: "mira lumo-ke talo-mi-na",
        textTranslation: "I walk by the river at the practice mat.",
        morphologicalSegmentation: [
          { surface: "ghost", lemma: "ghost", gloss: "ghost", features: ["noun"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "synthetic-testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus segmentation surface is not present in target text: ghost" });

    const after = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports with morphemes outside the selected language vocabulary", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });

    const response = await app.inject({
      method: "POST",
      url: "/languages/avenik/corpus",
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "synthetic-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "synthetic-only",
          consentRecord: "local synthetic import consent"
        },
        textTarget: "noru talo-mi-na",
        textTranslation: "I walk near the invented token.",
        morphologicalSegmentation: [
          { surface: "noru", lemma: "noru", gloss: "invented-token", features: ["noun"] },
          { surface: "talo-mi-na", lemma: "talo", gloss: "walk.present.1sg", features: ["verb", "present", "1sg"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "synthetic-testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus morpheme is not grounded in Avenik vocabulary: noru" });

    const after = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports with target text outside the selected language phonology", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });

    const response = await app.inject({
      method: "POST",
      url: "/languages/avenik/corpus",
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "synthetic-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "synthetic-only",
          consentRecord: "local synthetic import consent"
        },
        textTarget: "mira-z talo-mi-na",
        textTranslation: "I walk by the altered river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo-mi-na", lemma: "talo", gloss: "walk.present.1sg", features: ["verb", "present", "1sg"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "synthetic-testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus target text uses z outside Avenik phonology inventory: mira-z talo-mi-na" });

    const after = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(after.json()).toEqual(before.json());
  });

  it.each(["corpus", "notes", "exercises"])("returns 404 for unknown language %s requests", async (resource) => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({ method: "GET", url: `/languages/not-a-language/${resource}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("runs evaluations and appends them to state", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(4);

    const evaluations = await app.inject({ method: "GET", url: "/evaluations" });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toHaveLength(4);
  });

  it("returns a client error for evaluations without languages and preserves prior runs", async () => {
    const initialState: AppState = {
      ...createEmptyState(),
      evaluationRuns: [existingRun]
    };
    const app = createServer({ initialState });

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "No languages available to evaluate" });

    const evaluations = await app.inject({ method: "GET", url: "/evaluations" });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toEqual([existingRun]);
  });

  it("reads and writes evaluation state through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildSeedState());
    const app = createServer({ store });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(4);

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(4);

    const persisted = await store.read();
    expect(persisted.evaluationRuns).toHaveLength(4);
  });

  it("lets leads create auditable governance records for an existing language", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload: {
        languageId: "avenik",
        policyType: "generation",
        content: "Synthetic Avenik outputs must cite reviewed notes before learner use.",
        effectiveDate: "2026-06-05"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: "avenik",
      policyType: "generation",
      content: "Synthetic Avenik outputs must cite reviewed notes before learner use.",
      effectiveDate: "2026-06-05",
      approvedBy: "lead-1"
    });
    expect(response.json().id).toMatch(/^governance-avenik-generation-/);

    const governance = await app.inject({ method: "GET", url: "/governance" });
    expect(governance.statusCode).toBe(200);
    expect(governance.json()).toEqual([response.json()]);
  });

  it("records protected data mutations in a role-gated audit trail", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const governance = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload: {
        languageId: "avenik",
        policyType: "generation",
        content: "Synthetic outputs must cite reviewed notes.",
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
      url: "/exercises/avn-ex001/submissions",
      headers: authHeaders("learner-1"),
      payload: { answer: "mira talo-mi-na" }
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
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("learner-1")
    });
    expect(learnerAudit.statusCode).toBe(403);
    expect(learnerAudit.json()).toEqual({ error: "Forbidden" });

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?languageId=avenik",
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
    expect(events.every((event) => event.languageId === "avenik")).toBe(true);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorId: "lead-1",
        actorRole: "lead",
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: governance.json().id,
        languageId: "avenik",
        metadata: expect.objectContaining({ policyType: "generation" })
      }),
      expect.objectContaining({
        actorId: "reviewer-1",
        actorRole: "reviewer",
        action: "note.reviewed",
        entityType: "note",
        entityId: reviewedNoteId,
        languageId: "avenik",
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
        languageId: "avenik",
        metadata: expect.objectContaining({ accepted: true, exerciseId: "avn-ex001" })
      }),
      expect.objectContaining({
        actorId: "programmer-1",
        actorRole: "programmer",
        action: "evaluation_run.created",
        entityType: "evaluation_run",
        languageId: "avenik"
      })
    ]));
    expect(JSON.stringify(events)).not.toContain("mira talo-mi-na");
  });

  it("enforces per-language review policy assignments and approval thresholds", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const policy = await app.inject({
      method: "PUT",
      url: "/languages/avenik/review-policy",
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      id: "review-policy-avenik",
      languageId: "avenik",
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedBy: "lead-1"
    });

    const fetchedPolicy = await app.inject({
      method: "GET",
      url: "/languages/avenik/review-policy",
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
      error: "Reviewer is not assigned to approve notes for language: avenik"
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
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "review_policy.upserted",
        entityType: "review_policy",
        entityId: "review-policy-avenik",
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
    ]));
  });

  it("clears pending approval quorum when a note is deferred", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    await app.inject({
      method: "PUT",
      url: "/languages/avenik/review-policy",
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
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("lead-1")
    });
    expect(audit.json()).toEqual(expect.arrayContaining([
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
    ]));
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects governance writes from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders(userId),
      payload: {
        languageId: "avenik",
        policyType: "access",
        content: "Only reviewers may approve synthetic lesson notes.",
        effectiveDate: "2026-06-05"
      }
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });

    const governance = await app.inject({ method: "GET", url: "/governance" });
    expect(governance.json()).toEqual([]);
  });

  it.each([
    ["missing content", { languageId: "avenik", policyType: "consent", effectiveDate: "2026-06-05" }, "Invalid governance body"],
    ["invalid policy type", { languageId: "avenik", policyType: "retention", content: "Policy.", effectiveDate: "2026-06-05" }, "Invalid governance body"],
    ["unknown language", { languageId: "not-a-language", policyType: "consent", content: "Policy.", effectiveDate: "2026-06-05" }, "Language not found: not-a-language"]
  ])("rejects %s governance writes without mutating records", async (_, payload, error) => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload
    });

    expect(response.statusCode).toBe(error.startsWith("Language not found") ? 404 : 400);
    expect(response.json()).toEqual({ error });

    const governance = await app.inject({ method: "GET", url: "/governance" });
    expect(governance.json()).toEqual([]);
  });

  it("exports a role-gated sanitized language snapshot without hidden answer or learner data", async () => {
    const seeded = stateWithAuthUsers();
    const avenikRun: EvaluationRun = {
      ...existingRun,
      id: "avenik-run",
      languageId: "avenik",
      summary: "Avenik synthetic snapshot evaluation."
    };
    const solariRun: EvaluationRun = {
      ...existingRun,
      id: "solari-run",
      languageId: "solari",
      summary: "Solari synthetic snapshot evaluation."
    };
    const initialState: AppState = {
      ...seeded,
      exerciseSubmissions: [
        ...seeded.exerciseSubmissions,
        {
          id: "private-submission",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          answer: "private learner answer",
          accepted: false,
          explanation: "private grading explanation",
          submittedAt: "2026-06-05T00:00:00.000Z",
          learnerId: "learner-1"
        }
      ],
      evaluationRuns: [...seeded.evaluationRuns, avenikRun, solariRun],
      governance: [
        {
          id: "gov-avenik-access",
          languageId: "avenik",
          policyType: "access",
          content: "Snapshot exports stay inside synthetic review.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        },
        {
          id: "gov-solari-access",
          languageId: "solari",
          policyType: "access",
          content: "Solari exports require a separate review packet.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ]
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: "/exports/languages/avenik/snapshot",
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(200);
    const snapshot = response.json();
    expect(snapshot).toMatchObject({
      exportVersion: "synthetic-language-snapshot-v1",
      language: { id: "avenik", status: "synthetic" },
      integrity: {
        algorithm: "sha256",
        generatedBy: "assini-local-export-v1",
        redactionPolicy: EXPORT_REDACTION_POLICY
      }
    });
    expect(snapshot.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(Date.parse(snapshot.exportedAt)).not.toBeNaN();
    expect(snapshot.corpus).toHaveLength(10);
    expect(snapshot.linguisticProfile).toMatchObject({
      phonology: {
        syllableTemplate: "CV",
        stress: "word-initial"
      },
      stats: {
        vocabularyItems: 20,
        grammarRules: 5,
        paradigms: 2,
        dialectVariants: 2
      }
    });
    expect(snapshot.linguisticProfile.paradigms[0]).toMatchObject({
      id: "avn-paradigm-verb-chain",
      title: "Finite verb chain"
    });
    expect(snapshot.linguisticProfile.dialectVariants[0]).toMatchObject({
      id: "avn-dialect-river",
      name: "River teaching register"
    });
    expect(snapshot.linguisticProfile.vocabulary.find((item: { form: string }) => item.form === "-mi")).toMatchObject({
      gloss: "present tense",
      partOfSpeech: "suffix"
    });
    expect(snapshot.linguisticProfile.grammarRules[0]).toMatchObject({
      id: "avn-rule-verb-chain",
      evidencePassageIds: ["avn-c001", "avn-c002", "avn-c003"]
    });
    expect(snapshot.corpus.every((passage: { languageId: string }) => passage.languageId === "avenik")).toBe(true);
    expect(snapshot.notes.every((note: { languageId: string }) => note.languageId === "avenik")).toBe(true);
    expect(snapshot.exercises.every((exercise: { languageId: string }) => exercise.languageId === "avenik")).toBe(true);
    expect(snapshot.governance).toEqual([initialState.governance[0]]);
    expect(snapshot.evaluations).toEqual([avenikRun]);
    expect(snapshot).not.toHaveProperty("exerciseSubmissions");
    expect(snapshot).not.toHaveProperty("noteAnswerKeys");
    expect(snapshot).not.toHaveProperty("corpusAnswerKeys");
    expect(snapshot).not.toHaveProperty("aiSessions");
    expect(snapshot).not.toHaveProperty("users");
    expect(snapshot.exercises[0]).not.toHaveProperty("expectedAnswers");
    expect(snapshot.exercises[0]).not.toHaveProperty("gradingExplanation");
    expect(snapshot.exercises[0]).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(snapshot)).not.toContain("private learner answer");
    expect(JSON.stringify(snapshot)).not.toContain("private grading explanation");
    expect(JSON.stringify(snapshot)).not.toContain("synthetic fixture evaluation");
    expect(JSON.stringify(snapshot)).not.toContain("answer key");
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects language snapshot exports from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/languages/avenik/snapshot",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("exports a role-gated sanitized evaluation artifact", async () => {
    const seeded = stateWithAuthUsers();
    const latestRun: EvaluationRun = {
      id: "eval-avenik-latest",
      languageId: "avenik",
      createdAt: "2026-06-06T00:00:00.000Z",
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "synthetic-fixtures-2026-06-03",
      scores: { noteAccuracy: 1, corpusCoverage: 0.75 },
      failures: [
        {
          category: "corpusCoverage",
          languageId: "avenik",
          itemId: "avn-c999",
          message: "Missing synthetic passage coverage."
        }
      ],
      summary: "Avenik: 87.5% average score across 2 categories."
    };
    const initialState: AppState = {
      ...seeded,
      evaluationRuns: [existingRun, latestRun],
      exerciseSubmissions: [
        {
          id: "private-submission",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          answer: "private learner answer",
          accepted: false,
          explanation: "private grading explanation",
          submittedAt: "2026-06-05T00:00:00.000Z",
          learnerId: "learner-1"
        }
      ]
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exportVersion: "synthetic-evaluation-artifact-v1",
      summary: {
        languages: 4,
        totalRuns: 2,
        latestRuns: 2,
        failedLatestRuns: 1,
        regressedLatestRuns: 0,
        improvedLatestRuns: 0,
        stableLatestRuns: 0,
        singleRunLanguages: 2,
        passed: false,
        failureCount: 2
      },
      latestRuns: [
        expect.objectContaining({ id: "existing-run" }),
        expect.objectContaining({ id: "eval-avenik-latest" })
      ],
      failureLines: [
        "Avenik corpusCoverage avn-c999: Missing synthetic passage coverage.",
        "Avenik corpusCoverage threshold: score 75.0% is below required 96.0%."
      ],
      integrity: {
        algorithm: "sha256",
        generatedBy: "assini-local-export-v1",
        redactionPolicy: EXPORT_REDACTION_POLICY
      },
      trends: [
        expect.objectContaining({
          languageId: "archived-language",
          latestRunId: "existing-run",
          previousRunId: null,
          status: "single-run"
        }),
        expect.objectContaining({
          languageId: "avenik",
          latestRunId: "eval-avenik-latest",
          previousRunId: null,
          status: "single-run",
          categoryDeltas: {
            corpusCoverage: { latestScore: 0.75, previousScore: null, delta: null },
            noteAccuracy: { latestScore: 1, previousScore: null, delta: null }
          }
        })
      ]
    });
    expect(response.json().integrity.contentHash).toMatch(SHA_256_HEX);
    expect(Date.parse(response.json().exportedAt)).not.toBeNaN();
    expect(JSON.stringify(response.json())).not.toContain("private learner answer");
    expect(JSON.stringify(response.json())).not.toContain("private grading explanation");
    expect(JSON.stringify(response.json())).not.toContain("answer key");
    expect(response.json()).not.toHaveProperty("exerciseSubmissions");
    expect(response.json()).not.toHaveProperty("noteAnswerKeys");
    expect(response.json()).not.toHaveProperty("users");
    expect(response.json()).not.toHaveProperty("aiSessions");
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects evaluation artifact exports from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("returns a not-found error for unknown language snapshot exports", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/languages/not-a-language/snapshot",
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("authors validated exercises without exposing answer keys", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const response = await app.inject({
      method: "POST",
      url: "/languages/avenik/exercises",
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Avenik: I walk by the river.",
        allowedVocabulary: ["mira", "talo", "-mi", "-na"],
        allowedRuleIds: ["avn-rule-verb-chain"],
        expectedAnswers: ["mira talo-mi-na"],
        adversarialAnswers: [
          { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." }
        ],
        gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: "avenik",
      type: "translate_to_target",
      prompt: "Translate into Avenik: I walk by the river.",
      allowedVocabulary: ["mira", "talo", "-mi", "-na"],
      allowedRuleIds: ["avn-rule-verb-chain"]
    });
    expect(response.json().id).toMatch(/^authored-exercise-avenik-/);
    expect(response.json()).not.toHaveProperty("expectedAnswers");
    expect(response.json()).not.toHaveProperty("gradingExplanation");
    expect(response.json()).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(response.json())).not.toContain("Use mira for river");

    const exercises = await app.inject({ method: "GET", url: "/languages/avenik/exercises" });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: response.json().id,
        prompt: "Translate into Avenik: I walk by the river."
      })
    ]));
    expect(JSON.stringify(exercises.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(exercises.json())).not.toContain("Use mira for river");

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "exercise.created",
        entityType: "exercise",
        entityId: response.json().id,
        metadata: expect.objectContaining({
          exerciseType: "translate_to_target",
          expectedAnswerCount: 1,
          adversarialAnswerCount: 1
        })
      })
    ]));
  });

  it("rejects invalid exercise authoring references without mutating exercises", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await app.inject({ method: "GET", url: "/languages/avenik/exercises" });

    const response = await app.inject({
      method: "POST",
      url: "/languages/avenik/exercises",
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Avenik: I walk by the river.",
        allowedVocabulary: ["mira", "talo", "-mi", "-na"],
        allowedRuleIds: ["missing-rule"],
        expectedAnswers: ["mira talo-mi-na"],
        adversarialAnswers: [
          { answer: "talo-mi-na mira", reason: "Moves the finite verb before the locative noun." }
        ],
        gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Exercise references unknown rule: missing-rule" });

    const after = await app.inject({ method: "GET", url: "/languages/avenik/exercises" });
    expect(after.json()).toEqual(before.json());
  });

  it("grades and persists correct exercise submissions server-side", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "POST",
      url: "/exercises/avn-ex001/submissions",
      headers: authHeaders("learner-1"),
      payload: { answer: "mira talo-mi-na" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exerciseId: "avn-ex001",
      languageId: "avenik",
      accepted: true,
      explanation: "Accepted synthetic exercise submission."
    });
    expect(response.json()).not.toHaveProperty("answer");
    expect(response.json()).not.toHaveProperty("learnerId");

    const submissions = await app.inject({ method: "GET", url: "/exercises/avn-ex001/submissions" });
    expect(submissions.statusCode).toBe(200);
    expect(submissions.json()).toHaveLength(1);
    expect(submissions.json()[0]).toMatchObject({
      exerciseId: "avn-ex001",
      accepted: true
    });
    expect(submissions.json()[0]).not.toHaveProperty("learnerId");
  });

  it("preserves concurrent exercise submissions through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-submissions-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildSeedState());
    const app = createServer({ store });

    const responses = await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        app.inject({
          method: "POST",
          url: "/exercises/avn-ex001/submissions",
          headers: authHeaders("learner-1"),
          payload: { answer: index % 2 === 0 ? "mira talo-mi-na" : "talo mira" }
        })
      )
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);

    const persisted = await store.read();
    const submissions = persisted.exerciseSubmissions.filter((submission) => submission.exerciseId === "avn-ex001");

    expect(submissions).toHaveLength(20);
    expect(new Set(submissions.map((submission) => submission.id)).size).toBe(20);
  });

  it("returns sanitized exercise submission history without learner answers", async () => {
    const app = createServer({ initialState: buildSeedState() });

    await app.inject({
      method: "POST",
      url: "/exercises/avn-ex001/submissions",
      headers: authHeaders("learner-1"),
      payload: { answer: "mira talo-mi-na" }
    });

    const submissions = await app.inject({ method: "GET", url: "/exercises/avn-ex001/submissions" });

    expect(submissions.statusCode).toBe(200);
    expect(submissions.json()[0]).toMatchObject({
      exerciseId: "avn-ex001",
      accepted: true,
      explanation: "Accepted synthetic exercise submission."
    });
    expect(submissions.json()[0]).not.toHaveProperty("answer");
    expect(submissions.json()[0]).not.toHaveProperty("learnerId");
    expect(JSON.stringify(submissions.json())).not.toContain("mira talo-mi-na");
  });

  it("grades incorrect exercise submissions without exposing answer keys", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "POST",
      url: "/exercises/avn-ex001/submissions",
      headers: authHeaders("learner-1"),
      payload: { answer: "talo mira" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exerciseId: "avn-ex001",
      accepted: false,
      explanation: "Answer did not match the synthetic exercise key."
    });
    expect(JSON.stringify(response.json())).not.toContain("mira talo-mi-na");
    expect(response.json()).not.toHaveProperty("answer");
    expect(response.json()).not.toHaveProperty("learnerId");
  });

  it.each([
    ["missing exercise", "/exercises/missing-exercise/submissions", { answer: "mira talo-mi-na" }, 404],
    ["empty answer", "/exercises/avn-ex001/submissions", { answer: " " }, 400],
    ["missing payload", "/exercises/avn-ex001/submissions", undefined, 400]
  ])("returns a client error for %s submissions", async (_, url, payload, statusCode) => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeaders("learner-1"),
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(statusCode);
  });

  it.each([
    ["missing payload", undefined],
    ["null payload", null],
    ["empty languageId", { languageId: " " }],
    ["non-string languageId", { languageId: 42 }],
    ["array payload", []]
  ])("returns 400 for a %s study-loop draft body and preserves notes", async (_, payload) => {
    const app = createServer({ initialState: buildSeedState() });
    const before = await app.inject({ method: "GET", url: "/languages/avenik/notes" });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Missing languageId" });

    const after = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    expect(after.json()).toEqual(before.json());
  });

  it("returns 404 for study-loop drafts for an unknown language and preserves notes", async () => {
    const app = createServer({ initialState: buildSeedState() });
    const before = await app.inject({ method: "GET", url: "/languages/avenik/notes" });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: "not-a-language" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });

    const after = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    expect(after.json()).toEqual(before.json());
  });

  it("adds generated study-loop drafts without removing reviewed notes", async () => {
    const initialState = buildSeedState();
    const reviewedNote = initialState.notes.find((note) => note.id === reviewedNoteId);
    if (!reviewedNote) throw new Error("Missing reviewed note");

    reviewedNote.status = "approved";
    reviewedNote.explanation = "Reviewer-approved wording.";
    reviewedNote.reviewer = {
      ...reviewedNote.reviewer,
      lastReviewedBy: "local-reviewer",
      lastReviewedAt: "2026-06-04T00:00:00.000Z",
      comments: [...reviewedNote.reviewer.comments, "Approved reviewer edit."]
    };
    reviewedNote.editHistory = [
      ...reviewedNote.editHistory,
      {
        at: "2026-06-04T00:00:00.000Z",
        by: "local-reviewer",
        action: "reviewed",
        summary: "Approved reviewer edit."
      }
    ];

    const app = createServer({ initialState });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: "avenik" }
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as Note[]).map((note) => note.id)).toContain("avn-rule-verb-chain-draft");

    const notesResponse = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    const notes = notesResponse.json() as Note[];

    const expectedReviewedAndGeneratedNotes =
      initialState.notes.filter((note) => note.languageId === "avenik").length +
      draftNotesForLanguage("avenik", initialState).length;

    expect(notes).toHaveLength(expectedReviewedAndGeneratedNotes);
    expect(new Set(notes.map((note) => note.id)).size).toBe(notes.length);
    expect(notes.find((note) => note.id === reviewedNoteId)).toMatchObject({
      status: "approved",
      explanation: "Reviewer-approved wording.",
      reviewer: expect.objectContaining({ lastReviewedBy: "local-reviewer" })
    });
    expect(notes.find((note) => note.id === "avn-rule-verb-chain-draft")).toMatchObject({
      status: "draft",
      reviewer: expect.objectContaining({ lastReviewedBy: null, lastReviewedAt: null })
    });
  });

  it("refreshes only unreviewed generated drafts on repeated study-loop drafts", async () => {
    const initialState = buildSeedState();
    const [generatedDraft, reviewedGeneratedDraft] = draftNotesForLanguage("avenik", initialState);
    if (!generatedDraft || !reviewedGeneratedDraft) throw new Error("Missing generated drafts");

    const staleDraft: Note = {
      ...generatedDraft,
      explanation: "Stale generated draft text."
    };
    const reviewedDraft: Note = {
      ...reviewedGeneratedDraft,
      status: "approved",
      explanation: "Reviewer-edited generated draft.",
      reviewer: {
        ...reviewedGeneratedDraft.reviewer,
        lastReviewedBy: "local-reviewer",
        lastReviewedAt: "2026-06-04T00:00:00.000Z",
        comments: [...reviewedGeneratedDraft.reviewer.comments, "Keep reviewer edits."]
      },
      editHistory: [
        ...reviewedGeneratedDraft.editHistory,
        {
          at: "2026-06-04T00:00:00.000Z",
          by: "local-reviewer",
          action: "reviewed",
          summary: "Approved edited generated draft."
        }
      ]
    };
    initialState.notes.push(staleDraft, reviewedDraft);
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: "avenik" }
    });

    expect(response.statusCode).toBe(200);

    const notesResponse = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    const notes = notesResponse.json() as Note[];
    const refreshed = notes.find((note) => note.id === generatedDraft.id);
    const preserved = notes.find((note) => note.id === reviewedGeneratedDraft.id);

    expect(refreshed?.explanation).toBe(generatedDraft.explanation);
    expect(preserved).toMatchObject({
      status: "approved",
      explanation: "Reviewer-edited generated draft.",
      reviewer: expect.objectContaining({ lastReviewedBy: "local-reviewer" })
    });
    expect(notes.filter((note) => note.id === generatedDraft.id)).toHaveLength(1);
    expect(notes.filter((note) => note.id === reviewedGeneratedDraft.id)).toHaveLength(1);
  });

  it("updates note review details", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "contested",
        explanation: "Needs one more example before approval.",
        reviewerComment: "Please add a counterexample check."
      }
    });

    expect(response.statusCode).toBe(200);
    const note = response.json();
    expect(note.status).toBe("contested");
    expect(note.explanation).toBe("Needs one more example before approval.");
    expect(note.reviewer.lastReviewedBy).toBe("reviewer-1");
    expect(note.reviewer.comments).toContain("Please add a counterexample check.");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "reviewer-1",
      action: "reviewed",
      summary: "Please add a counterexample check."
    });
  });

  it("rejects underspecified note explanation edits without mutating the note", async () => {
    const app = createServer({ initialState: buildSeedState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        explanation: "Too short.",
        reviewerComment: "Edited note explanation in local prototype."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Note explanation edits require a substantive explanation." });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it.each([
    ["rejected", "Reject until the noun-case examples are corrected."],
    ["deferred", "Defer until an Elder checks the dialect scope."],
    ["escalated", "Escalate for language-lead review before release."]
  ] as const)("records %s note dispositions with comments and audit metadata", async (status, reviewerComment) => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: { status, reviewerComment }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: reviewedNoteId,
      status,
      reviewer: expect.objectContaining({
        lastReviewedBy: "reviewer-1",
        comments: expect.arrayContaining([reviewerComment])
      })
    });

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "note.reviewed",
        entityType: "note",
        entityId: reviewedNoteId,
        metadata: expect.objectContaining({
          requestedStatus: status,
          status,
          disposition: status
        })
      })
    ]));
  });

  it("tracks assigned review dispositions with due dates and resolution workflow", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const opened = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "escalated",
        reviewerComment: "Escalate until an Elder confirms this teaching note.",
        dispositionAssigneeId: "elder-1",
        dispositionDueAt: "2026-06-20"
      }
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().status).toBe("escalated");

    const dispositions = await app.inject({
      method: "GET",
      url: "/languages/avenik/review-dispositions",
      headers: authHeaders("reviewer-1")
    });
    expect(dispositions.statusCode).toBe(200);
    expect(dispositions.json()).toHaveLength(1);
    expect(dispositions.json()[0]).toMatchObject({
      languageId: "avenik",
      noteId: reviewedNoteId,
      disposition: "escalated",
      status: "open",
      reason: "Escalate until an Elder confirms this teaching note.",
      assignedTo: "elder-1",
      dueAt: "2026-06-20",
      openedBy: "reviewer-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null
    });

    const dispositionId = dispositions.json()[0].id as string;
    const unauthorizedResolve = await app.inject({
      method: "PATCH",
      url: `/review-dispositions/${dispositionId}/resolve`,
      headers: authHeaders("reviewer-1"),
      payload: { resolutionSummary: "Reviewer should not resolve assigned Elder work." }
    });
    expect(unauthorizedResolve.statusCode).toBe(403);
    expect(unauthorizedResolve.json()).toEqual({ error: "Forbidden" });

    const resolved = await app.inject({
      method: "PATCH",
      url: `/review-dispositions/${dispositionId}/resolve`,
      headers: authHeaders("elder-1"),
      payload: { resolutionSummary: "Elder confirmed the note can return to reviewer quorum." }
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({
      id: dispositionId,
      status: "resolved",
      resolvedBy: "elder-1",
      resolutionSummary: "Elder confirmed the note can return to reviewer quorum."
    });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("under_review");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "elder-1",
      action: "disposition_resolved",
      summary: "Elder confirmed the note can return to reviewer quorum."
    });

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events?languageId=avenik",
      headers: authHeaders("lead-1")
    });
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "review_disposition.created",
        entityType: "review_disposition",
        entityId: dispositionId,
        metadata: expect.objectContaining({
          disposition: "escalated",
          assignedTo: "elder-1",
          dueAt: "2026-06-20"
        })
      }),
      expect.objectContaining({
        action: "review_disposition.resolved",
        entityType: "review_disposition",
        entityId: dispositionId,
        metadata: expect.objectContaining({
          noteStatus: "under_review",
          resolvedBy: "elder-1"
        })
      })
    ]));
  });

  it.each([
    ["contested missing reviewerComment", { status: "contested" }],
    ["contested blank reviewerComment", { status: "contested", reviewerComment: "   " }],
    ["rejected missing reviewerComment", { status: "rejected" }],
    ["deferred missing reviewerComment", { status: "deferred" }],
    ["escalated missing reviewerComment", { status: "escalated" }]
  ])("requires a substantive reviewer comment for note dispositions: %s", async (_, payload) => {
    const app = createServer({ initialState: buildSeedState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Review dispositions require reviewerComment" });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 400 for an invalid review body and does not update the note", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "bogus",
        reviewerComment: "This should not be persisted."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid review body" });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("draft");
    expect(note.reviewer.comments).not.toContain("This should not be persisted.");
  });

  it.each([
    ["empty object", { payload: {} }],
    ["unknown-only object", { payload: { foo: "bar" } }],
    ["null payload", { payload: null }],
    ["missing payload", {}]
  ])("returns 400 for a %s review body and does not update the note", async (_, injectOptions) => {
    const app = createServer({ initialState: buildSeedState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      ...injectOptions
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid review body" });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 404 when reviewing a missing note", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: "/notes/missing-note/review",
      headers: authHeaders("reviewer-1"),
      payload: { status: "approved" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Note not found: missing-note" });
  });

  it("resolves authenticated users and uses them for note review audit fields", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const currentUser = await app.inject({ method: "GET", url: "/users/me", headers: authHeaders("elder-1") });
    expect(currentUser.statusCode).toBe(200);
    expect(currentUser.json()).toMatchObject({ id: "elder-1", role: "elder" });

    const unknown = await app.inject({ method: "GET", url: "/users/me", headers: authHeaders("missing-user") });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual({ error: "Unauthorized" });

    const review = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: { status: "approved", reviewerComment: "Elder approved synthetic wording." }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().reviewer.lastReviewedBy).toBe("elder-1");
    expect(review.json().editHistory.at(-1)).toMatchObject({ by: "elder-1", action: "reviewed" });
  });

  it("enforces role-aware AI sessions and returns safe observability surfaces", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });

    const blocked = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: { languageId: "avenik", mode: "programmer_debug", seedPrompt: "Show internals." }
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: "Forbidden" });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: "avenik",
        mode: "programmer_debug",
        seedPrompt: "Trace what the AI knows about verb chains.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["avn-c001"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      languageId: "avenik",
      mode: "programmer_debug",
      createdBy: "programmer-1",
      privacy: { exposesHiddenChainOfThought: false }
    });
    expect(created.json().thinkingSummary).toContain("observable trace");
    expect(created.json().neuralMap.nodes.length).toBeGreaterThan(0);
    expect(JSON.stringify(created.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(created.json())).not.toContain("gradingExplanation");
    expect(JSON.stringify(created.json())).not.toContain("noteAnswerKeys");

    const observability = await app.inject({
      method: "GET",
      url: "/observability/ai-sessions",
      headers: authHeaders("programmer-1")
    });
    expect(observability.statusCode).toBe(200);
    expect(observability.json().totals.sessions).toBe(1);
    expect(observability.json().sessions[0]).toMatchObject({ languageId: "avenik", messageCount: 2 });
    expect(JSON.stringify(observability.json())).not.toContain("Trace what the AI knows");
  });

  it("uses an injected LLM provider for AI sessions without exposing provider secrets or answer-key fields", async () => {
    const providerInputs: unknown[] = [];
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        providerInputs.push(input);
        return {
          content: `Provider response ${providerInputs.length}: ${input.prompt}`,
          warnings: ["test-provider"]
        };
      }
    };
    const app = createServer({ initialState: stateWithAuthUsers(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: "avenik",
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["avn-c001"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().messages[1]).toMatchObject({
      role: "assistant",
      content: "Provider response 1: Use the model safely.",
      createdBy: "synthetic-ai"
    });
    expect(created.json().trace.at(-1).warnings).toContain("test-provider");

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Follow up safely." }
    });

    expect(followUp.statusCode).toBe(200);
    expect(followUp.json().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Provider response 2: Follow up safely.",
      createdBy: "synthetic-ai"
    });
    expect(providerInputs).toHaveLength(2);
    expect(JSON.stringify(providerInputs)).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(providerInputs)).not.toContain("expectedAnswers");
    expect(JSON.stringify(followUp.json())).not.toContain("ASSINI_LLM_API_KEY");
    expect(JSON.stringify(followUp.json())).not.toContain("OPENAI_API_KEY");
  });

  it("returns sanitized LLM provider failure details for AI session creation", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 429: Rate limit for sk-route-secret");
      }
    };
    const app = createServer({ initialState: stateWithAuthUsers(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: "avenik",
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["avn-c001"]
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "LLM generation failed: LLM provider request failed with status 429: Rate limit for [redacted-secret]"
    });
    expect(JSON.stringify(response.json())).not.toContain("sk-route-secret");
  });

  it("persists failed AI session attempts with sanitized observable diagnostics", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 429: Rate limit for sk-route-secret");
      }
    };
    const app = createServer({ initialState: stateWithAuthUsers(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: "avenik",
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["avn-c001"]
      }
    });

    expect(response.statusCode).toBe(502);

    const observability = await app.inject({
      method: "GET",
      url: "/observability/ai-sessions",
      headers: authHeaders("programmer-1")
    });
    expect(observability.statusCode).toBe(200);
    expect(observability.json().totals).toMatchObject({ sessions: 1, activeSessions: 0 });
    expect(observability.json().sessions[0]).toMatchObject({
      languageId: "avenik",
      mode: "programmer_debug",
      status: "failed",
      createdBy: "programmer-1",
      messageCount: 1,
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["avn-c001"]
    });

    const sessionId = observability.json().sessions[0].id;
    const storedSession = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(sessionId)}`,
      headers: authHeaders("programmer-1")
    });
    expect(storedSession.statusCode).toBe(200);
    expect(storedSession.json().status).toBe("failed");
    expect(storedSession.json().messages).toHaveLength(1);
    expect(storedSession.json().trace.at(-1)).toMatchObject({
      kind: "generation",
      label: "Provider failure",
      summary: "LLM generation failed: LLM provider request failed with status 429: Rate limit for [redacted-secret]"
    });
    expect(JSON.stringify(storedSession.json())).not.toContain("sk-route-secret");
  });

  it("redacts configured non-sk provider secrets from AI session failures", async () => {
    const previousAssiniKey = process.env.ASSINI_LLM_API_KEY;
    process.env.ASSINI_LLM_API_KEY = "plain-provider-secret";
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 500: plain-provider-secret");
      }
    };
    const app = createServer({ initialState: stateWithAuthUsers(), llmProvider });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders("programmer-1"),
        payload: {
          languageId: "avenik",
          mode: "programmer_debug",
          seedPrompt: "Use the model safely.",
          contextNoteIds: [reviewedNoteId],
          contextPassageIds: ["avn-c001"]
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: "LLM generation failed: LLM provider request failed with status 500: [redacted-secret]"
      });
      expect(JSON.stringify(response.json())).not.toContain("plain-provider-secret");

      const observability = await app.inject({
        method: "GET",
        url: "/observability/ai-sessions",
        headers: authHeaders("programmer-1")
      });
      const storedSession = await app.inject({
        method: "GET",
        url: `/ai/sessions/${encodeURIComponent(observability.json().sessions[0].id)}`,
        headers: authHeaders("programmer-1")
      });
      expect(JSON.stringify(storedSession.json())).not.toContain("plain-provider-secret");
    } finally {
      if (previousAssiniKey === undefined) {
        delete process.env.ASSINI_LLM_API_KEY;
      } else {
        process.env.ASSINI_LLM_API_KEY = previousAssiniKey;
      }
    }
  });

  it("returns sanitized LLM provider failure details for AI session follow-ups", async () => {
    let callCount = 0;
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        callCount += 1;
        if (callCount === 1) {
          return { content: `Provider response: ${input.prompt}`, warnings: [] };
        }
        throw new Error("LLM provider request timed out after 25ms");
      }
    };
    const app = createServer({ initialState: stateWithAuthUsers(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: "avenik",
        mode: "programmer_debug",
        seedPrompt: "Start safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["avn-c001"]
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Continue safely." }
    });

    expect(followUp.statusCode).toBe(502);
    expect(followUp.json()).toEqual({
      error: "LLM generation failed: LLM provider request timed out after 25ms"
    });
  });

  it("marks existing AI sessions failed when follow-up generation fails", async () => {
    let callCount = 0;
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        callCount += 1;
        if (callCount === 1) {
          return { content: `Provider response: ${input.prompt}`, warnings: [] };
        }
        throw new Error("LLM provider request failed with status 500: Retry with sk-followup-secret");
      }
    };
    const app = createServer({ initialState: stateWithAuthUsers(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: "avenik",
        mode: "programmer_debug",
        seedPrompt: "Start safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["avn-c001"]
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Continue safely." }
    });
    expect(followUp.statusCode).toBe(502);

    const storedSession = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}`,
      headers: authHeaders("programmer-1")
    });
    expect(storedSession.statusCode).toBe(200);
    expect(storedSession.json().status).toBe("failed");
    expect(storedSession.json().messages).toHaveLength(3);
    expect(storedSession.json().messages.at(-1)).toMatchObject({
      role: "user",
      content: "Continue safely.",
      createdBy: "programmer-1"
    });
    expect(storedSession.json().trace.at(-1)).toMatchObject({
      kind: "generation",
      label: "Provider failure",
      summary: "LLM generation failed: LLM provider request failed with status 500: Retry with [redacted-secret]"
    });
    const sessionNode = storedSession.json().neuralMap.nodes.find((node: { id: string }) => node.id === `ai_session:${created.json().id}`);
    expect(sessionNode.metadata.status).toBe("failed");
    expect(JSON.stringify(storedSession.json())).not.toContain("sk-followup-secret");
  });

  it("lets Elders add pending correction/context records without mutating notes", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await fetchReviewedNote(app);

    const correction = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: "avenik",
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major",
        contextText: "Keep this synthetic-only until governance approval."
      }
    });

    expect(correction.statusCode).toBe(201);
    expect(correction.json()).toMatchObject({
      languageId: "avenik",
      noteId: reviewedNoteId,
      status: "pending_review",
      proposedBy: "elder-1",
      severity: "major"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(before.explanation);
    expect(after.editHistory).toEqual(before.editHistory);

    const context = await app.inject({
      method: "GET",
      url: "/languages/avenik/elder-context",
      headers: authHeaders("elder-1")
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().corrections).toHaveLength(1);
    expect(JSON.stringify(context.json())).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(context.json())).not.toContain("expectedAnswers");
  });

  it("lets leads review elder corrections with audit attribution", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await fetchReviewedNote(app);

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: "avenik",
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });

    const denied = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("learner-1"),
      payload: { status: "accepted" }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "Forbidden" });

    const reviewed = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });

    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });
    expect(reviewed.json().reviewedAt).toEqual(expect.any(String));

    const context = await app.inject({
      method: "GET",
      url: "/languages/avenik/elder-context",
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(before.explanation);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("applies accepted note-linked elder corrections as auditable note edits", async () => {
    const app = createServer({ initialState: stateWithAuthUsers() });
    const before = await fetchReviewedNote(app);
    const revisedExplanation = `${before.explanation} Accepted elder correction: mention suffix order before approval.`;

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: "avenik",
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });

    const accepted = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(accepted.statusCode).toBe(200);

    const applied = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: revisedExplanation }
    });

    expect(applied.statusCode).toBe(200);
    expect(applied.json().correction).toMatchObject({
      id: created.json().id,
      status: "applied",
      reviewedBy: "lead-1"
    });
    expect(applied.json().note).toMatchObject({
      id: reviewedNoteId,
      explanation: revisedExplanation,
      status: "under_review",
      reviewer: {
        lastReviewedBy: "lead-1",
        comments: expect.arrayContaining([`Applied elder correction ${created.json().id}.`])
      }
    });
    expect(applied.json().note.editHistory.at(-1)).toMatchObject({
      by: "lead-1",
      action: "applied_correction",
      summary: `Applied elder correction ${created.json().id}.`
    });

    const context = await app.inject({
      method: "GET",
      url: "/languages/avenik/elder-context",
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "applied"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(revisedExplanation);
    expect(after.editHistory).toHaveLength(before.editHistory.length + 1);
  });

  it("returns a programmer-only neural map and rate limits protected writes", async () => {
    let now = 1_000;
    const app = createServer({
      initialState: stateWithAuthUsers(),
      rateLimit: { max: 2, windowMs: 60_000, now: () => now }
    });

    const neuralMap = await app.inject({
      method: "GET",
      url: "/observability/neural-map?languageId=avenik",
      headers: authHeaders("programmer-1")
    });
    expect(neuralMap.statusCode).toBe(200);
    expect(neuralMap.json().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "language:avenik", type: "language" }),
        expect.objectContaining({ id: `note:${reviewedNoteId}`, type: "note" })
      ])
    );
    expect(JSON.stringify(neuralMap.json())).not.toContain("expectedAnswers");

    const payload = { languageId: "avenik", mode: "learner_practice", seedPrompt: "Practice safely." };
    const first = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    const second = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    const third = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: "Rate limit exceeded" });

    now += 60_001;
    const afterWindow = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    expect(afterWindow.statusCode).toBe(201);
  });
});
