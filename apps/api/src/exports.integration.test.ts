import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState, type EvaluationRun, type Note } from "@assini/db";
import { verifyExportIntegrity } from "./publicLanguageViews.js";
import { createServer } from "./server.js";

const SHA_256_HEX = /^[a-f0-9]{64}$/;
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];

describe("export integration", () => {
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

  it("exports a role-gated sanitized language snapshot without hidden answer or learner data", async () => {
    const seeded = buildTestWorkspaceState();
    const testlangRun: EvaluationRun = {
      ...existingRun,
      id: "testlang-run",
      languageId: TEST_LANGUAGE_ID,
      summary: "Testlang snapshot evaluation."
    };
    const otherRun: EvaluationRun = {
      ...existingRun,
      id: "otherlang-run",
      languageId: "otherlang",
      summary: "Otherlang snapshot evaluation."
    };
    const initialState: AppState = {
      ...seeded,
      exerciseSubmissions: [
        ...seeded.exerciseSubmissions,
        {
          id: "private-submission",
          exerciseId: submissionExerciseId,
          languageId: TEST_LANGUAGE_ID,
          answer: "private learner answer",
          accepted: false,
          explanation: "private grading explanation",
          submittedAt: "2026-06-05T00:00:00.000Z",
          learnerId: "learner-1"
        }
      ],
      evaluationRuns: [...seeded.evaluationRuns, testlangRun, otherRun],
      governance: [
        {
          id: "gov-testlang-access",
          languageId: TEST_LANGUAGE_ID,
          policyType: "access",
          content: "Snapshot exports stay inside local review.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        },
        {
          id: "gov-otherlang-access",
          languageId: "otherlang",
          policyType: "access",
          content: "Otherlang exports require a separate review packet.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ]
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(200);
    const snapshot = response.json();
    expect(snapshot).toMatchObject({
      exportVersion: "language-snapshot-v2",
      language: { id: TEST_LANGUAGE_ID, status: "active" },
      integrity: {
        algorithm: "sha256",
        generatedBy: "assini-local-export-v1",
        redactionPolicy: EXPORT_REDACTION_POLICY
      }
    });
    expect(snapshot.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(Date.parse(snapshot.exportedAt)).not.toBeNaN();
    expect(snapshot.corpus).toHaveLength(3);
    expect(snapshot.linguisticProfile).toMatchObject({
      phonology: {
        syllableTemplate: "CV",
        stress: "word-initial"
      },
      stats: {
        vocabularyItems: 7,
        grammarRules: 2,
        corpusPassages: 3,
        notes: 2,
        exercises: 3,
        sourceAssets: 0,
        pendingExtractionDrafts: 0
      }
    });
    expect(snapshot.linguisticProfile.vocabulary.find((item: { form: string }) => item.form === "-na")).toMatchObject({
      gloss: "first person singular",
      partOfSpeech: "suffix"
    });
    expect(snapshot.linguisticProfile.grammarRules[0]).toMatchObject({
      id: "testlang-note-basic-order",
      evidencePassageIds: ["testlang-c001", "testlang-c002"]
    });
    expect(
      snapshot.linguisticProfile.morphemeInventory.find((item: { surface: string }) => item.surface === "saku")
    ).toMatchObject({
      lemma: "saku",
      occurrenceCount: 2,
      passageIds: expect.arrayContaining(["testlang-c002"])
    });
    expect(snapshot.corpus.every((passage: { languageId: string }) => passage.languageId === TEST_LANGUAGE_ID)).toBe(
      true
    );
    expect(snapshot.notes.every((note: { languageId: string }) => note.languageId === TEST_LANGUAGE_ID)).toBe(true);
    expect(
      snapshot.exercises.every((exercise: { languageId: string }) => exercise.languageId === TEST_LANGUAGE_ID)
    ).toBe(true);
    expect(snapshot.governance).toEqual([initialState.governance[0]]);
    expect(snapshot.evaluations).toEqual([testlangRun]);
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
    expect(JSON.stringify(snapshot)).not.toContain("test-generator");
    expect(JSON.stringify(snapshot)).not.toContain("answer key");
    expect(verifyExportIntegrity(snapshot)).toBe(true);
    const tamperedSnapshot = {
      ...snapshot,
      language: { ...snapshot.language, status: "archived" }
    };
    expect(verifyExportIntegrity(tamperedSnapshot)).toBe(false);
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["programmers", "programmer-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects language snapshot exports from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("exports a role-gated sanitized evaluation artifact", async () => {
    const seeded = buildTestWorkspaceState();
    const latestRun: EvaluationRun = {
      id: "eval-testlang-latest",
      languageId: TEST_LANGUAGE_ID,
      createdAt: "2026-06-06T00:00:00.000Z",
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "workspace-corpus-v1",
      scores: { noteAccuracy: 1, corpusCoverage: 0.75 },
      failures: [
        {
          category: "corpusCoverage",
          languageId: TEST_LANGUAGE_ID,
          itemId: "testlang-c999",
          message: "Missing passage coverage."
        }
      ],
      summary: "Testlang: 87.5% average score across 2 categories."
    };
    const initialState: AppState = {
      ...seeded,
      evaluationRuns: [existingRun, latestRun],
      exerciseSubmissions: [
        {
          id: "private-submission",
          exerciseId: submissionExerciseId,
          languageId: TEST_LANGUAGE_ID,
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
      exportVersion: "evaluation-artifact-v2",
      summary: {
        languages: 1,
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
        expect.objectContaining({ id: "eval-testlang-latest" })
      ],
      failureLines: [
        "Testlang corpusCoverage testlang-c999: Missing passage coverage.",
        "Testlang corpusCoverage threshold: score 75.0% is below required 96.0%."
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
          languageId: TEST_LANGUAGE_ID,
          latestRunId: "eval-testlang-latest",
          previousRunId: null,
          status: "single-run",
          categoryDeltas: {
            corpusCoverage: { latestScore: 0.75, previousScore: null, delta: null },
            noteAccuracy: { latestScore: 1, previousScore: null, delta: null }
          }
        })
      ]
    });
    const artifact = response.json();
    expect(artifact.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(Date.parse(artifact.exportedAt)).not.toBeNaN();
    expect(JSON.stringify(artifact)).not.toContain("private learner answer");
    expect(JSON.stringify(artifact)).not.toContain("private grading explanation");
    expect(JSON.stringify(artifact)).not.toContain("answer key");
    expect(artifact).not.toHaveProperty("exerciseSubmissions");
    expect(artifact).not.toHaveProperty("noteAnswerKeys");
    expect(artifact).not.toHaveProperty("users");
    expect(artifact).not.toHaveProperty("aiSessions");
    expect(verifyExportIntegrity(artifact)).toBe(true);
    const tamperedArtifact = {
      ...artifact,
      summary: { ...artifact.summary, totalRuns: artifact.summary.totalRuns + 1 }
    };
    expect(verifyExportIntegrity(tamperedArtifact)).toBe(false);
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    // Elders may export language snapshots but not the evaluation artifact matrix.
    ["elders", "elder-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects evaluation artifact exports from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("allows elders to export a language snapshot while blocking evaluation artifacts", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const snapshot = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders("elder-1")
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({ language: { id: TEST_LANGUAGE_ID } });

    const artifact = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("elder-1")
    });
    expect(artifact.statusCode).toBe(403);
    expect(artifact.json()).toEqual({ error: "Forbidden" });
  });

  it("returns a not-found error for unknown language snapshot exports", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/languages/not-a-language/snapshot",
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });
});
