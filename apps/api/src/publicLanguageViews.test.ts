import { describe, expect, it } from "vitest";
import { buildSeedState, syntheticLanguageFixtures } from "@assini/synthetic-langs";
import {
  buildSyntheticLanguageProfile,
  toPublicExercise,
  toPublicEvaluationArtifact,
  toPublicExerciseSubmission,
  toPublicLanguageSnapshot,
  toPublicNote
} from "./publicLanguageViews";

const SHA_256_HEX = /^[a-f0-9]{64}$/;
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];

describe("public language views", () => {
  it("builds a rich profile without sharing mutable fixture arrays", () => {
    const state = buildSeedState();
    const profile = buildSyntheticLanguageProfile(state, "avenik");

    expect(profile).toMatchObject({
      language: { id: "avenik", name: "Avenik" },
      stats: {
        vocabularyItems: 20,
        grammarRules: 5,
        paradigms: 2,
        dialectVariants: 2,
        corpusPassages: 10,
        notes: 5,
        exercises: 5
      }
    });
    expect(profile?.phonology.phonotactics).toContain("Consonant clusters are disallowed inside native roots.");
    expect(profile?.paradigms[0].rows[0]).toMatchObject({
      form: "talo-mi-na",
      morphemes: ["talo", "-mi", "-na"]
    });
    expect(profile?.morphemeInventory.find((item) => item.surface === "mira")).toMatchObject({
      surface: "mira",
      lemma: "mira",
      glosses: ["river"],
      features: ["noun"],
      vocabulary: expect.objectContaining({
        form: "mira",
        gloss: "river",
        partOfSpeech: "noun"
      })
    });
    expect(profile?.morphemeInventory.find((item) => item.surface === "mira")?.occurrenceCount).toBeGreaterThan(1);
    expect(profile?.morphemeInventory.find((item) => item.surface === "mira")?.passageIds).toEqual(
      expect.arrayContaining(["avn-c001"])
    );

    profile?.phonology.consonants.push("x-test");
    profile?.paradigms[0].rows[0].morphemes.push("-test");
    profile?.dialectVariants[0].examplePhrases.push({
      standard: "test",
      variant: "test",
      translation: "test"
    });
    profile?.vocabulary[0].tags.push("test-tag");

    const fixture = syntheticLanguageFixtures.find((item) => item.language.id === "avenik");
    expect(fixture?.phonology.consonants).not.toContain("x-test");
    expect(fixture?.paradigms[0].rows[0].morphemes).not.toContain("-test");
    expect(fixture?.dialectVariants[0].examplePhrases).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ standard: "test" })])
    );
    expect(fixture?.vocabulary[0].tags).not.toContain("test-tag");
  });

  it("exports sanitized language snapshots with linguistic profile data", () => {
    const state = buildSeedState();
    const snapshot = toPublicLanguageSnapshot(state, "avenik", "2026-06-06T00:00:00.000Z");

    expect(snapshot).toMatchObject({
      exportVersion: "synthetic-language-snapshot-v1",
      exportedAt: "2026-06-06T00:00:00.000Z",
      language: { id: "avenik" },
      linguisticProfile: {
        stats: { vocabularyItems: 20, grammarRules: 5, paradigms: 2, dialectVariants: 2 },
        phonology: { syllableTemplate: "CV", stress: "word-initial" }
      }
    });
    expect(snapshot?.linguisticProfile.paradigms[0].title).toBe("Finite verb chain");
    expect(snapshot?.linguisticProfile.morphemeInventory.find((item) => item.surface === "mira")).toMatchObject({
      lemma: "mira",
      occurrenceCount: expect.any(Number),
      passageIds: expect.arrayContaining(["avn-c001"])
    });
    expect(snapshot?.linguisticProfile.dialectVariants[0]).toMatchObject({
      id: "avn-dialect-river",
      name: "River teaching register"
    });
    expect(snapshot?.integrity).toMatchObject({
      algorithm: "sha256",
      generatedBy: "assini-local-export-v1",
      redactionPolicy: EXPORT_REDACTION_POLICY
    });
    expect(snapshot?.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(snapshot?.corpus).toHaveLength(10);
    expect(snapshot?.notes).toHaveLength(5);
    expect(snapshot?.exercises[0]).not.toHaveProperty("expectedAnswers");
    expect(snapshot?.exercises[0]).not.toHaveProperty("gradingExplanation");
    expect(snapshot?.exercises[0]).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(snapshot)).not.toContain("answer key");
  });

  it("changes language snapshot integrity when public export content changes", () => {
    const state = buildSeedState();
    const first = toPublicLanguageSnapshot(state, "avenik", "2026-06-06T00:00:00.000Z");
    const note = state.notes.find((item) => item.languageId === "avenik");
    if (!note) throw new Error("Expected Avenik fixture note.");
    note.explanation = `${note.explanation} Public reviewer clarification.`;

    const second = toPublicLanguageSnapshot(state, "avenik", "2026-06-06T00:00:00.000Z");

    expect(first?.integrity.contentHash).not.toBe(second?.integrity.contentHash);
  });

  it("exports sanitized evaluation artifacts with aggregate gate metadata", () => {
    const state = {
      ...buildSeedState(),
      evaluationRuns: [
        {
          id: "eval-avenik-old",
          languageId: "avenik",
          createdAt: "2026-06-05T00:00:00.000Z",
          systemVersion: "deterministic-study-loop-v1",
          fixtureVersion: "synthetic-fixtures-2026-06-03",
          scores: { noteAccuracy: 0.5 },
          failures: [
            {
              category: "noteAccuracy",
              languageId: "avenik",
              itemId: "avn-note-old",
              message: "Older failure."
            }
          ],
          summary: "Avenik: 50.0% average score across 1 categories."
        },
        {
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
        },
        {
          id: "eval-solari-latest",
          languageId: "solari",
          createdAt: "2026-06-06T00:01:00.000Z",
          systemVersion: "deterministic-study-loop-v1",
          fixtureVersion: "synthetic-fixtures-2026-06-03",
          scores: { noteAccuracy: 1 },
          failures: [],
          summary: "Solari: 100.0% average score across 1 categories."
        }
      ],
      exerciseSubmissions: [
        {
          id: "private-submission",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          answer: "private learner answer",
          accepted: false,
          explanation: "private grading explanation",
          submittedAt: "2026-06-06T00:00:00.000Z",
          learnerId: "learner-1"
        }
      ]
    };

    const artifact = toPublicEvaluationArtifact(state, "2026-06-06T00:02:00.000Z");

    expect(artifact).toMatchObject({
      exportVersion: "synthetic-evaluation-artifact-v1",
      exportedAt: "2026-06-06T00:02:00.000Z",
      summary: {
        languages: 4,
        totalRuns: 3,
        latestRuns: 2,
        failedLatestRuns: 1,
        averageLatestScore: 0.9375,
        passed: false,
        failureCount: 2
      }
    });
    expect(artifact.integrity).toMatchObject({
      algorithm: "sha256",
      generatedBy: "assini-local-export-v1",
      redactionPolicy: EXPORT_REDACTION_POLICY
    });
    expect(artifact.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(artifact.latestRuns.map((run) => run.id)).toEqual(["eval-avenik-latest", "eval-solari-latest"]);
    expect(artifact.failureLines).toEqual([
      "Avenik corpusCoverage avn-c999: Missing synthetic passage coverage.",
      "Avenik corpusCoverage threshold: score 75.0% is below required 96.0%."
    ]);
    expect(artifact.runsByLanguage).toMatchObject({
      avenik: ["eval-avenik-old", "eval-avenik-latest"],
      solari: ["eval-solari-latest"]
    });
    expect(artifact).not.toHaveProperty("exerciseSubmissions");
    expect(artifact).not.toHaveProperty("noteAnswerKeys");
    expect(artifact).not.toHaveProperty("aiSessions");
    expect(JSON.stringify(artifact)).not.toContain("private learner answer");
    expect(JSON.stringify(artifact)).not.toContain("private grading explanation");
    expect(JSON.stringify(artifact)).not.toContain("answer key");
  });

  it("counts threshold-only latest evaluation runs as failed in exported summaries", () => {
    const state = buildSeedState();
    state.evaluationRuns = [
      {
        id: "eval-avenik-threshold-only",
        languageId: "avenik",
        createdAt: "2026-06-06T00:03:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "synthetic-fixtures-2026-06-03",
        scores: { noteAccuracy: 0.95 },
        failures: [],
        summary: "Avenik: 95.0% average score across 1 categories."
      }
    ];

    const artifact = toPublicEvaluationArtifact(state, "2026-06-06T00:04:00.000Z");

    expect(artifact.summary.failedLatestRuns).toBe(1);
    expect(artifact.summary.failureCount).toBe(1);
    expect(artifact.failureLines).toEqual([
      "Avenik noteAccuracy threshold: score 95.0% is below required 96.0%."
    ]);
  });

  it("exports latest-versus-previous evaluation trends for regression reports", () => {
    const state = buildSeedState();
    state.evaluationRuns = [
      {
        id: "eval-avenik-old",
        languageId: "avenik",
        createdAt: "2026-06-05T00:00:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "synthetic-fixtures-2026-06-03",
        scores: { noteAccuracy: 1, translationAccuracy: 1 },
        failures: [],
        summary: "Avenik: 100.0% average score across 2 categories."
      },
      {
        id: "eval-avenik-latest",
        languageId: "avenik",
        createdAt: "2026-06-06T00:00:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "synthetic-fixtures-2026-06-03",
        scores: { noteAccuracy: 0.9, translationAccuracy: 1 },
        failures: [],
        summary: "Avenik: 95.0% average score across 2 categories."
      },
      {
        id: "eval-solari-only",
        languageId: "solari",
        createdAt: "2026-06-06T00:00:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "synthetic-fixtures-2026-06-03",
        scores: { noteAccuracy: 1 },
        failures: [],
        summary: "Solari: 100.0% average score across 1 categories."
      }
    ];

    const artifact = toPublicEvaluationArtifact(state, "2026-06-06T00:05:00.000Z");

    expect(artifact.summary).toMatchObject({
      regressedLatestRuns: 1,
      improvedLatestRuns: 0,
      stableLatestRuns: 0,
      singleRunLanguages: 1
    });
    expect(artifact.trends).toEqual([
      {
        languageId: "avenik",
        latestRunId: "eval-avenik-latest",
        previousRunId: "eval-avenik-old",
        latestAverageScore: 0.95,
        previousAverageScore: 1,
        averageDelta: -0.05,
        status: "regressed",
        categoryDeltas: {
          noteAccuracy: { latestScore: 0.9, previousScore: 1, delta: -0.1 },
          translationAccuracy: { latestScore: 1, previousScore: 1, delta: 0 }
        }
      },
      {
        languageId: "solari",
        latestRunId: "eval-solari-only",
        previousRunId: null,
        latestAverageScore: 1,
        previousAverageScore: null,
        averageDelta: null,
        status: "single-run",
        categoryDeltas: {
          noteAccuracy: { latestScore: 1, previousScore: null, delta: null }
        }
      }
    ]);
  });

  it("strips internal reviewer markers and private grading fields from public records", () => {
    const state = buildSeedState();
    const note = toPublicNote({
      ...state.notes[0],
      reviewer: {
        ...state.notes[0].reviewer,
        lastReviewedBy: "synthetic-answer-key-loader",
        comments: [...state.notes[0].reviewer.comments, "answer key: private marker"]
      },
      editHistory: [
        ...state.notes[0].editHistory,
        {
          at: "2026-06-06T00:00:00.000Z",
          by: "synthetic-fixture-generator",
          action: "answer key import",
          summary: "fixture grammar rule copied from answer key"
        }
      ]
    });
    const exercise = toPublicExercise(state.exercises[0]);
    const submission = toPublicExerciseSubmission({
      id: "submission-private",
      exerciseId: state.exercises[0].id,
      languageId: "avenik",
      answer: "private learner answer",
      accepted: false,
      explanation: "private grading explanation",
      submittedAt: "2026-06-06T00:00:00.000Z",
      learnerId: "learner-1"
    });

    expect(note.reviewer.lastReviewedBy).toBe("synthetic-review");
    expect(JSON.stringify(note)).not.toContain("answer key");
    expect(JSON.stringify(note)).not.toContain("synthetic-fixture-generator");
    expect(exercise).not.toHaveProperty("expectedAnswers");
    expect(exercise).not.toHaveProperty("gradingExplanation");
    expect(exercise).not.toHaveProperty("adversarialAnswers");
    expect(submission).not.toHaveProperty("answer");
    expect(submission).not.toHaveProperty("learnerId");
    expect(submission.explanation).toBe("Answer did not match the synthetic exercise key.");
  });
});
