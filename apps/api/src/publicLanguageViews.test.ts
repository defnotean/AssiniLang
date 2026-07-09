import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import {
  buildLanguageProfile,
  toPublicExercise,
  toPublicEvaluationArtifact,
  toPublicExerciseSubmission,
  toPublicLanguageSnapshot,
  toPublicNote,
  verifyExportIntegrity
} from "./publicLanguageViews.js";

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
  it("builds a rich profile without sharing mutable workspace arrays", () => {
    const state = buildTestWorkspaceState();
    const profile = buildLanguageProfile(state, TEST_LANGUAGE_ID);

    expect(profile).toMatchObject({
      language: { id: TEST_LANGUAGE_ID, name: "Testlang", typology: "agglutinative" },
      stats: {
        vocabularyItems: 7,
        grammarRules: 2,
        corpusPassages: 3,
        notes: 2,
        exercises: 3,
        sourceAssets: 0,
        pendingExtractionDrafts: 0,
        exerciseTypes: {
          choose_particle: 1,
          translate_to_target: 1,
          segment: 1
        }
      }
    });
    expect(profile?.phonology).toMatchObject({
      syllableTemplate: "CV",
      stress: "word-initial"
    });
    expect(profile?.phonology?.notes).toContain("No consonant clusters in native roots.");
    expect(profile?.grammarRules[0]).toMatchObject({
      id: "testlang-note-basic-order",
      topic: "syntax/basic-order",
      evidencePassageIds: ["testlang-c001", "testlang-c002"],
      confidence: "high",
      status: "draft"
    });
    expect(profile?.vocabulary.find((item) => item.form === "-na")).toMatchObject({
      gloss: "first person singular",
      partOfSpeech: "suffix"
    });
    expect(profile?.morphemeInventory.find((item) => item.surface === "saku")).toMatchObject({
      surface: "saku",
      lemma: "saku",
      glosses: ["child"],
      features: ["noun"],
      occurrenceCount: 2,
      passageIds: ["testlang-c002", "testlang-c003"],
      vocabulary: expect.objectContaining({
        form: "saku",
        gloss: "child",
        partOfSpeech: "noun"
      })
    });
    expect(profile?.morphemeInventory.find((item) => item.surface === "mira")).toMatchObject({
      lemma: "mira",
      glosses: ["river"],
      occurrenceCount: 1,
      passageIds: ["testlang-c001"]
    });
    expect(JSON.stringify(profile)).not.toContain("expectedAnswers");
    expect(JSON.stringify(profile)).not.toContain("gradingExplanation");
    expect(JSON.stringify(profile)).not.toContain("adversarialAnswers");
    expect(JSON.stringify(profile)).not.toContain("test-generator");

    profile?.phonology?.consonants.push("x-test");
    profile?.phonology?.notes.push("test-note");
    const firstVocabulary = profile?.vocabulary[0];
    firstVocabulary?.tags.push("test-tag");
    profile?.grammarRules[0]?.evidencePassageIds.push("test-passage");
    profile?.morphemeInventory
      .find((item) => item.surface === "saku")
      ?.vocabulary?.tags.push("test-tag");

    const language = state.languages.find((item) => item.id === TEST_LANGUAGE_ID);
    expect(language?.phonology?.consonants).not.toContain("x-test");
    expect(language?.phonology?.notes).not.toContain("test-note");
    const sourceLexeme = state.lexemes.find((item) => item.form === firstVocabulary?.form);
    expect(sourceLexeme?.tags).not.toContain("test-tag");
    const sakuLexeme = state.lexemes.find((item) => item.form === "saku");
    expect(sakuLexeme?.tags).not.toContain("test-tag");
    const sourceNote = state.notes.find((item) => item.id === "testlang-note-basic-order");
    expect(sourceNote?.evidencePassageIds).not.toContain("test-passage");
  });

  it("reports no paradigm gaps for the fully covered test workspace", () => {
    const state = buildTestWorkspaceState();
    const profile = buildLanguageProfile(state, TEST_LANGUAGE_ID);

    // talo attests both attested person values (1sg, 3sg); nemi only has one
    // person cell, which is below the two-cell paradigm inference threshold.
    expect(profile?.paradigmGaps).toEqual([]);
  });

  it("derives paradigm gaps from corpus segmentation in the profile", () => {
    const state = buildTestWorkspaceState();
    const basePassage = state.corpus.find((passage) => passage.languageId === TEST_LANGUAGE_ID);
    if (!basePassage) throw new Error("Expected a Testlang passage.");
    state.corpus = [
      ...state.corpus,
      {
        ...basePassage,
        id: "testlang-c004",
        textTarget: "saku nemi-na",
        textTranslation: "I teach the child.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ]
      },
      {
        ...basePassage,
        id: "testlang-c005",
        textTarget: "saku nemi-su",
        textTranslation: "You teach the child.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-su", lemma: "-su", gloss: "2sg", features: ["person"] }
        ]
      }
    ];

    const profile = buildLanguageProfile(state, TEST_LANGUAGE_ID);

    // talo now misses 2sg, which is attested for nemi in this language;
    // nemi misses nothing (1sg, 2sg, 3sg are all attested for it).
    expect(profile?.paradigmGaps).toEqual([
      {
        lemma: "talo",
        dimension: "person",
        attested: ["1sg", "3sg"],
        missing: ["2sg"],
        evidencePassageIds: ["testlang-c001", "testlang-c003"]
      }
    ]);
    expect(JSON.stringify(profile?.paradigmGaps)).not.toContain("expectedAnswers");
  });

  it("returns undefined profiles for unknown languages", () => {
    const state = buildTestWorkspaceState();

    expect(buildLanguageProfile(state, "not-a-language")).toBeUndefined();
  });

  it("exports sanitized language snapshots with linguistic profile data", () => {
    const state = buildTestWorkspaceState();
    const snapshot = toPublicLanguageSnapshot(state, TEST_LANGUAGE_ID, "2026-06-06T00:00:00.000Z");

    expect(snapshot).toMatchObject({
      exportVersion: "language-snapshot-v2",
      exportedAt: "2026-06-06T00:00:00.000Z",
      language: { id: TEST_LANGUAGE_ID, status: "active" },
      linguisticProfile: {
        stats: {
          vocabularyItems: 7,
          grammarRules: 2,
          corpusPassages: 3,
          notes: 2,
          exercises: 3,
          sourceAssets: 0,
          pendingExtractionDrafts: 0
        },
        phonology: { syllableTemplate: "CV", stress: "word-initial" }
      }
    });
    expect(snapshot?.linguisticProfile.grammarRules[0]).toMatchObject({
      id: "testlang-note-basic-order",
      evidencePassageIds: ["testlang-c001", "testlang-c002"]
    });
    expect(snapshot?.linguisticProfile.morphemeInventory.find((item) => item.surface === "saku")).toMatchObject({
      lemma: "saku",
      occurrenceCount: 2,
      passageIds: expect.arrayContaining(["testlang-c002"])
    });
    expect(snapshot?.integrity).toMatchObject({
      algorithm: "sha256",
      generatedBy: "assini-local-export-v1",
      redactionPolicy: EXPORT_REDACTION_POLICY
    });
    expect(snapshot?.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(verifyExportIntegrity(snapshot!)).toBe(true);
    expect(snapshot?.corpus).toHaveLength(3);
    expect(snapshot?.notes).toHaveLength(2);
    expect(snapshot?.exercises[0]).not.toHaveProperty("expectedAnswers");
    expect(snapshot?.exercises[0]).not.toHaveProperty("gradingExplanation");
    expect(snapshot?.exercises[0]).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(snapshot)).not.toContain("answer key");
    expect(JSON.stringify(snapshot)).not.toContain("test-generator");
  });

  it("rejects language snapshots whose integrity hash was tampered with", () => {
    const state = buildTestWorkspaceState();
    const snapshot = toPublicLanguageSnapshot(state, TEST_LANGUAGE_ID, "2026-06-06T00:00:00.000Z");
    expect(snapshot).toBeDefined();
    expect(verifyExportIntegrity(snapshot!)).toBe(true);

    const tampered = {
      ...snapshot!,
      integrity: {
        ...snapshot!.integrity,
        contentHash: "0".repeat(64)
      }
    };
    expect(verifyExportIntegrity(tampered)).toBe(false);

    const mutatedPayload = {
      ...snapshot!,
      exportedAt: "2099-01-01T00:00:00.000Z"
    };
    expect(verifyExportIntegrity(mutatedPayload)).toBe(false);
  });

  it("returns undefined snapshots for unknown languages", () => {
    const state = buildTestWorkspaceState();

    expect(toPublicLanguageSnapshot(state, "not-a-language", "2026-06-06T00:00:00.000Z")).toBeUndefined();
  });

  it("changes language snapshot integrity when public export content changes", () => {
    const state = buildTestWorkspaceState();
    const first = toPublicLanguageSnapshot(state, TEST_LANGUAGE_ID, "2026-06-06T00:00:00.000Z");
    const note = state.notes.find((item) => item.languageId === TEST_LANGUAGE_ID);
    if (!note) throw new Error("Expected a Testlang note.");
    note.explanation = `${note.explanation} Public reviewer clarification.`;

    const second = toPublicLanguageSnapshot(state, TEST_LANGUAGE_ID, "2026-06-06T00:00:00.000Z");

    expect(first?.integrity.contentHash).not.toBe(second?.integrity.contentHash);
  });

  it("exports sanitized evaluation artifacts with aggregate gate metadata", () => {
    const state = {
      ...buildTestWorkspaceState(),
      evaluationRuns: [
        {
          id: "eval-testlang-old",
          languageId: TEST_LANGUAGE_ID,
          createdAt: "2026-06-05T00:00:00.000Z",
          systemVersion: "deterministic-study-loop-v1",
          fixtureVersion: "workspace-corpus-v1",
          scores: { noteAccuracy: 0.5 },
          failures: [
            {
              category: "noteAccuracy",
              languageId: TEST_LANGUAGE_ID,
              itemId: "testlang-note-old",
              message: "Older failure."
            }
          ],
          summary: "Testlang: 50.0% average score across 1 categories."
        },
        {
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
        },
        {
          id: "eval-otherlang-latest",
          languageId: "otherlang",
          createdAt: "2026-06-06T00:01:00.000Z",
          systemVersion: "deterministic-study-loop-v1",
          fixtureVersion: "workspace-corpus-v1",
          scores: { noteAccuracy: 1 },
          failures: [],
          summary: "Otherlang: 100.0% average score across 1 categories."
        }
      ],
      exerciseSubmissions: [
        {
          id: "private-submission",
          exerciseId: "testlang-ex-001",
          languageId: TEST_LANGUAGE_ID,
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
      exportVersion: "evaluation-artifact-v2",
      exportedAt: "2026-06-06T00:02:00.000Z",
      summary: {
        languages: 1,
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
    expect(verifyExportIntegrity(artifact)).toBe(true);
    expect(artifact.latestRuns.map((run) => run.id)).toEqual(["eval-otherlang-latest", "eval-testlang-latest"]);
    expect(artifact.failureLines).toEqual([
      "Testlang corpusCoverage testlang-c999: Missing passage coverage.",
      "Testlang corpusCoverage threshold: score 75.0% is below required 96.0%."
    ]);
    expect(artifact.runsByLanguage).toMatchObject({
      [TEST_LANGUAGE_ID]: ["eval-testlang-old", "eval-testlang-latest"],
      otherlang: ["eval-otherlang-latest"]
    });
    expect(artifact).not.toHaveProperty("exerciseSubmissions");
    expect(artifact).not.toHaveProperty("noteAnswerKeys");
    expect(artifact).not.toHaveProperty("aiSessions");
    expect(JSON.stringify(artifact)).not.toContain("private learner answer");
    expect(JSON.stringify(artifact)).not.toContain("private grading explanation");
    expect(JSON.stringify(artifact)).not.toContain("answer key");
  });

  it("counts threshold-only latest evaluation runs as failed in exported summaries", () => {
    const state = buildTestWorkspaceState();
    state.evaluationRuns = [
      {
        id: "eval-testlang-threshold-only",
        languageId: TEST_LANGUAGE_ID,
        createdAt: "2026-06-06T00:03:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "workspace-corpus-v1",
        scores: { noteAccuracy: 0.95 },
        failures: [],
        summary: "Testlang: 95.0% average score across 1 categories."
      }
    ];

    const artifact = toPublicEvaluationArtifact(state, "2026-06-06T00:04:00.000Z");

    expect(artifact.summary.failedLatestRuns).toBe(1);
    expect(artifact.summary.failureCount).toBe(1);
    expect(artifact.failureLines).toEqual([
      "Testlang noteAccuracy threshold: score 95.0% is below required 96.0%."
    ]);
  });

  it("exports latest-versus-previous evaluation trends for regression reports", () => {
    const state = buildTestWorkspaceState();
    state.evaluationRuns = [
      {
        id: "eval-testlang-old",
        languageId: TEST_LANGUAGE_ID,
        createdAt: "2026-06-05T00:00:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "workspace-corpus-v1",
        scores: { noteAccuracy: 1, translationAccuracy: 1 },
        failures: [],
        summary: "Testlang: 100.0% average score across 2 categories."
      },
      {
        id: "eval-testlang-latest",
        languageId: TEST_LANGUAGE_ID,
        createdAt: "2026-06-06T00:00:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "workspace-corpus-v1",
        scores: { noteAccuracy: 0.9, translationAccuracy: 1 },
        failures: [],
        summary: "Testlang: 95.0% average score across 2 categories."
      },
      {
        id: "eval-otherlang-only",
        languageId: "otherlang",
        createdAt: "2026-06-06T00:00:00.000Z",
        systemVersion: "deterministic-study-loop-v1",
        fixtureVersion: "workspace-corpus-v1",
        scores: { noteAccuracy: 1 },
        failures: [],
        summary: "Otherlang: 100.0% average score across 1 categories."
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
        languageId: "otherlang",
        latestRunId: "eval-otherlang-only",
        previousRunId: null,
        latestAverageScore: 1,
        previousAverageScore: null,
        averageDelta: null,
        status: "single-run",
        categoryDeltas: {
          noteAccuracy: { latestScore: 1, previousScore: null, delta: null }
        }
      },
      {
        languageId: TEST_LANGUAGE_ID,
        latestRunId: "eval-testlang-latest",
        previousRunId: "eval-testlang-old",
        latestAverageScore: 0.95,
        previousAverageScore: 1,
        averageDelta: -0.05,
        status: "regressed",
        categoryDeltas: {
          noteAccuracy: { latestScore: 0.9, previousScore: 1, delta: -0.1 },
          translationAccuracy: { latestScore: 1, previousScore: 1, delta: 0 }
        }
      }
    ]);
  });

  it("strips internal reviewer markers and private grading fields from public records", () => {
    const state = buildTestWorkspaceState();
    const note = toPublicNote({
      ...state.notes[0],
      reviewer: {
        ...state.notes[0].reviewer,
        lastReviewedBy: "test-generator",
        comments: [...state.notes[0].reviewer.comments, "answer key: private marker"]
      },
      editHistory: [
        ...state.notes[0].editHistory,
        {
          at: "2026-06-06T00:00:00.000Z",
          by: "test-generator",
          action: "answer key import",
          summary: "grammar rule copied from answer key"
        }
      ]
    });
    const exercise = toPublicExercise(state.exercises[0]);
    const submission = toPublicExerciseSubmission({
      id: "submission-private",
      exerciseId: state.exercises[0].id,
      languageId: TEST_LANGUAGE_ID,
      answer: "private learner answer",
      accepted: false,
      explanation: "private grading explanation",
      submittedAt: "2026-06-06T00:00:00.000Z",
      learnerId: "learner-1"
    });
    const acceptedSubmission = toPublicExerciseSubmission({
      id: "submission-accepted",
      exerciseId: state.exercises[0].id,
      languageId: TEST_LANGUAGE_ID,
      answer: "private learner answer",
      accepted: true,
      explanation: "private grading explanation",
      submittedAt: "2026-06-06T00:00:00.000Z",
      learnerId: "learner-1"
    });

    expect(note.reviewer.lastReviewedBy).toBe("internal-review");
    expect(JSON.stringify(note)).not.toContain("answer key");
    expect(JSON.stringify(note)).not.toContain("test-generator");
    expect(exercise).not.toHaveProperty("expectedAnswers");
    expect(exercise).not.toHaveProperty("gradingExplanation");
    expect(exercise).not.toHaveProperty("adversarialAnswers");
    expect(submission).not.toHaveProperty("answer");
    expect(submission).not.toHaveProperty("learnerId");
    expect(submission.explanation).toBe("Answer did not match the exercise answer key.");
    expect(acceptedSubmission.explanation).toBe("Submission accepted.");
  });
});
