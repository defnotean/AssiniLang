import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, JsonStore, TEST_LANGUAGE_ID, type Note } from "@assini/db";
import { draftNotesForLanguage } from "@assini/eval";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";

describe("exercise and study-loop integration", () => {
  const reviewedNoteId = "testlang-note-basic-order";
  const submissionExerciseId = "testlang-ex-002";

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  it("authors validated exercises without exposing answer keys", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      type: "translate_to_target",
      prompt: "Translate into Testlang: The child walks.",
      allowedVocabulary: ["saku", "talo", "-ki"],
      allowedRuleIds: ["testlang-note-basic-order"]
    });
    expect(response.json().id).toMatch(/^authored-exercise-testlang-/);
    expect(response.json()).not.toHaveProperty("expectedAnswers");
    expect(response.json()).not.toHaveProperty("gradingExplanation");
    expect(response.json()).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(response.json())).not.toContain("Use saku for child");

    const exercises = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: response.json().id,
          prompt: "Translate into Testlang: The child walks."
        })
      ])
    );
    expect(JSON.stringify(exercises.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(exercises.json())).not.toContain("Use saku for child");

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "exercise.created",
          entityType: "exercise",
          entityId: response.json().id,
          metadata: expect.objectContaining({
            exerciseType: "translate_to_target",
            expectedAnswerCount: 1,
            adversarialAnswerCount: 2
          })
        })
      ])
    );
  });

  const validExerciseAuthoringPayload = {
    type: "translate_to_target",
    prompt: "Translate into Testlang: The child walks.",
    allowedVocabulary: ["saku", "talo", "-ki"],
    allowedRuleIds: ["testlang-note-basic-order"],
    expectedAnswers: ["saku talo-ki"],
    adversarialAnswers: [
      { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
      { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
    ],
    gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
  };

  it("dry-runs exercise authoring validation without persisting", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });
    const before = await store.read();

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: validExerciseAuthoringPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      errors: [],
      warnings: [],
      preview: validExerciseAuthoringPayload
    });

    const after = await store.read();
    expect(after.exercises).toEqual(before.exercises);
    expect(after.auditEvents).toEqual(before.auditEvents);
  });

  it("dry-runs exercise authoring validation with body dryRun flag", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validExerciseAuthoringPayload,
        dryRun: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      errors: [],
      preview: validExerciseAuthoringPayload
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("returns validation errors from exercise dry-run without persisting", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validExerciseAuthoringPayload,
        allowedRuleIds: ["missing-rule"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      errors: ["Exercise references unknown rule: missing-rule"],
      warnings: [],
      preview: null
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects invalid exercise authoring references without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["missing-rule"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Exercise references unknown rule: missing-rule",
      i18nKey: "errors.exerciseAuthoringValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects exercise authoring with fewer than two adversarial probes without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [{ answer: "talo saku-ki", reason: "Reverses subject and verb order." }],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Exercise authoring requires at least two adversarial probes.",
      i18nKey: "errors.exerciseAuthoringValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it.each([
    [
      "allowed vocabulary",
      {
        allowedVocabulary: ["saku", "talo", "saku", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"]
      },
      "Exercise allowed vocabulary is duplicated: saku"
    ],
    [
      "allowed rule IDs",
      {
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order", "testlang-note-basic-order"]
      },
      "Exercise allowed rule is duplicated: testlang-note-basic-order"
    ]
  ])("rejects duplicate exercise authoring %s without mutating exercises", async (_, overrides, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        ...overrides,
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error,
      i18nKey: "errors.exerciseAuthoringValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects duplicate expected exercise answers without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki", "  saku   talo-ki  "],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Exercise expected answer is duplicated: saku talo-ki",
      i18nKey: "errors.exerciseAuthoringValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects duplicate adversarial exercise probes without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "  talo   saku-ki  ", reason: "Repeats the same word order probe with extra whitespace." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Exercise adversarial answer is duplicated: talo saku-ki",
      i18nKey: "errors.exerciseAuthoringValidationFailed"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("grades and persists correct exercise submissions server-side", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exerciseId: submissionExerciseId,
      languageId: TEST_LANGUAGE_ID,
      accepted: true,
      explanation: "Submission accepted."
    });
    expect(response.json()).not.toHaveProperty("answer");
    expect(response.json()).not.toHaveProperty("learnerId");

    const submissions = await app.inject({
      method: "GET",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1")
    });
    expect(submissions.statusCode).toBe(200);
    expect(submissions.json()).toHaveLength(1);
    expect(submissions.json()[0]).toMatchObject({
      exerciseId: submissionExerciseId,
      accepted: true
    });
    expect(submissions.json()[0]).not.toHaveProperty("learnerId");
  });

  it("preserves concurrent exercise submissions through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-submissions-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });

    const responses = await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        app.inject({
          method: "POST",
          url: `/exercises/${submissionExerciseId}/submissions`,
          headers: authHeaders("learner-1"),
          payload: { answer: index % 2 === 0 ? "saku talo-ki" : "talo saku" }
        })
      )
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);

    const persisted = await store.read();
    const submissions = persisted.exerciseSubmissions.filter(
      (submission) => submission.exerciseId === submissionExerciseId
    );

    expect(submissions).toHaveLength(20);
    expect(new Set(submissions.map((submission) => submission.id)).size).toBe(20);
  });

  it("returns sanitized exercise submission history without learner answers", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });

    const submissions = await app.inject({
      method: "GET",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1")
    });

    expect(submissions.statusCode).toBe(200);
    expect(submissions.json()[0]).toMatchObject({
      exerciseId: submissionExerciseId,
      accepted: true,
      explanation: "Submission accepted."
    });
    expect(submissions.json()[0]).not.toHaveProperty("answer");
    expect(submissions.json()[0]).not.toHaveProperty("learnerId");
    expect(JSON.stringify(submissions.json())).not.toContain("saku talo-ki");
  });

  it("rejects anonymous exercise submission history reads", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const submissions = await app.inject({
      method: "GET",
      url: `/exercises/${submissionExerciseId}/submissions`
    });

    expect(submissions.statusCode).toBe(401);
    expect(submissions.json()).toEqual({ error: "Unauthorized" });
  });

  it("grades incorrect exercise submissions without exposing answer keys", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "talo saku" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exerciseId: submissionExerciseId,
      accepted: false,
      explanation: "Answer did not match the exercise answer key."
    });
    expect(JSON.stringify(response.json())).not.toContain("saku talo-ki");
    expect(response.json()).not.toHaveProperty("answer");
    expect(response.json()).not.toHaveProperty("learnerId");
  });

  it.each([
    [
      "missing exercise",
      "/exercises/missing-exercise/submissions",
      { answer: "saku talo-ki" },
      404,
      { error: "Exercise not found: missing-exercise", i18nKey: "errors.exerciseNotFound" }
    ],
    [
      "empty answer",
      `/exercises/${submissionExerciseId}/submissions`,
      { answer: " " },
      400,
      { error: "Invalid exercise submission body", i18nKey: "errors.invalidExerciseSubmissionBody" }
    ],
    [
      "missing payload",
      `/exercises/${submissionExerciseId}/submissions`,
      undefined,
      400,
      { error: "Invalid exercise submission body", i18nKey: "errors.invalidExerciseSubmissionBody" }
    ]
  ])("returns a client error for %s submissions", async (_, url, payload, statusCode, body) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeaders("learner-1"),
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual(body);
  });

  it.each([
    ["missing payload", undefined],
    ["null payload", null],
    ["empty languageId", { languageId: " " }],
    ["non-string languageId", { languageId: 42 }],
    ["array payload", []]
  ])("returns 400 for a %s study-loop draft body and preserves notes", async (_, payload) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Missing languageId",
      i18nKey: "errors.missingLanguageId"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    expect(after.json()).toEqual(before.json());
  });

  it("returns 404 for study-loop drafts for an unknown language and preserves notes", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: "not-a-language" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    expect(after.json()).toEqual(before.json());
  });

  it("adds generated study-loop drafts without removing reviewed notes", async () => {
    const initialState = buildTestWorkspaceState();
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
      payload: { languageId: TEST_LANGUAGE_ID }
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as Note[]).map((note) => note.id)).toContain("testlang-draft-basic-order");

    const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    const notes = notesResponse.json() as Note[];

    const expectedReviewedAndGeneratedNotes =
      initialState.notes.filter((note) => note.languageId === TEST_LANGUAGE_ID).length +
      draftNotesForLanguage(TEST_LANGUAGE_ID, initialState).length;

    expect(notes).toHaveLength(expectedReviewedAndGeneratedNotes);
    expect(new Set(notes.map((note) => note.id)).size).toBe(notes.length);
    expect(notes.find((note) => note.id === reviewedNoteId)).toMatchObject({
      status: "approved",
      explanation: "Reviewer-approved wording.",
      reviewer: expect.objectContaining({ lastReviewedBy: "local-reviewer" })
    });
    expect(notes.find((note) => note.id === "testlang-draft-basic-order")).toMatchObject({
      status: "draft",
      reviewer: expect.objectContaining({ lastReviewedBy: null, lastReviewedAt: null })
    });
  });

  it("refreshes only unreviewed generated drafts on repeated study-loop drafts", async () => {
    const initialState = buildTestWorkspaceState();
    const [generatedDraft, reviewedGeneratedDraft] = draftNotesForLanguage(TEST_LANGUAGE_ID, initialState);
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
      payload: { languageId: TEST_LANGUAGE_ID }
    });

    expect(response.statusCode).toBe(200);

    const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
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

  describe("POST /languages/:languageId/study-loop/model-draft", () => {
    function noteProvider(content: string): LlmProvider {
      return {
        name: "fake-note-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return content;
        }
      };
    }

    const groundedNoteJson = JSON.stringify({
      notes: [
        {
          topic: "morphology/verb/third-person",
          explanation: "The suffix -ki marks a third-person singular subject on the verb form.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c003`],
          confidence: "medium"
        }
      ]
    });

    it("inserts model-backed draft notes and emits an audit event", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: noteProvider(groundedNoteJson)
      });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { notes: Note[]; warnings: string[]; generated: number };
      expect(body.generated).toBe(1);
      expect(body.notes).toHaveLength(1);
      expect(Array.isArray(body.warnings)).toBe(true);
      const [created] = body.notes;
      expect(created.status).toBe("draft");
      expect(created.topic).toBe("morphology/verb/third-person");
      expect(created.evidencePassageIds).toEqual([`${TEST_LANGUAGE_ID}-c003`]);
      expect(created.evidenceCount).toBe(1);
      expect(created.reviewer).toMatchObject({ lastReviewedBy: null, lastReviewedAt: null });
      expect(created.editHistory[0]).toMatchObject({ by: "deterministic-study-loop", action: "drafted" });

      const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
      const notes = notesResponse.json() as Note[];
      expect(notes.find((note) => note.id === created.id)).toMatchObject({ status: "draft" });

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("lead-1")
      });
      const actions = (audit.json() as Array<{ action: string }>).map((event) => event.action);
      expect(actions).toContain("note.draft_generated");
    });

    it("returns 400 when the configured provider cannot generate (no completeChat)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: expect.stringContaining("A configured model is required"),
        i18nKey: "errors.modelRequired"
      });

      const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
      expect(after.json()).toEqual(before.json());
    });

    it("returns 404 for an unknown language", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: noteProvider(groundedNoteJson)
      });

      const response = await app.inject({
        method: "POST",
        url: "/languages/not-a-language/study-loop/model-draft",
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "Language not found: not-a-language",
        i18nKey: "errors.languageNotFound"
      });
    });

    it("forbids learners from generating model-backed draft notes", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: noteProvider(groundedNoteJson)
      });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
        headers: authHeaders("learner-1")
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });
  });

  describe("POST /languages/:languageId/exercises/generate", () => {
    function exerciseProvider(content: string): LlmProvider {
      return {
        name: "fake-exercise-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return content;
        }
      };
    }

    const groundedExerciseJson = JSON.stringify({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate to the target language: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: [`${TEST_LANGUAGE_ID}-note-basic-order`],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." },
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." }
        ],
        gradingExplanation: "Subject saku precedes the verb talo with the third-person suffix -ki."
      }
    });

    it("returns a grounded exercise draft without persisting anything", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: exerciseProvider(groundedExerciseJson)
      });

      const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
      const beforeCount = (before.json() as unknown[]).length;

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/exercises/generate`,
        headers: authHeaders("reviewer-1"),
        payload: { type: "translate_to_target" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { exercise: Record<string, unknown>; warnings: string[] };
      expect(body.exercise).toMatchObject({
        type: "translate_to_target",
        expectedAnswers: ["saku talo-ki"],
        allowedVocabulary: ["saku", "talo", "-ki"]
      });
      expect(Array.isArray(body.warnings)).toBe(true);

      const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
      expect((after.json() as unknown[]).length).toBe(beforeCount);
    });

    it("returns 400 when the configured provider cannot generate (no completeChat)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/exercises/generate`,
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: expect.stringContaining("A configured model is required"),
        i18nKey: "errors.modelRequired"
      });
    });

    it("returns 404 for an unknown language", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: exerciseProvider(groundedExerciseJson)
      });

      const response = await app.inject({
        method: "POST",
        url: "/languages/not-a-language/exercises/generate",
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "Language not found: not-a-language",
        i18nKey: "errors.languageNotFound"
      });
    });

    it("forbids learners from generating exercises", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: exerciseProvider(groundedExerciseJson)
      });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/exercises/generate`,
        headers: authHeaders("learner-1")
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });
  });
});
