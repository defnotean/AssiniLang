import { createHash } from "node:crypto";

import type { AppState, EvaluationFailure, EvaluationRun, Exercise, ExerciseSubmission, Note } from "@assini/db";
import {
  SYNTHETIC_FIXTURE_MINIMUMS,
  buildSyntheticFixtureQualityActuals,
  summarizeSyntheticFixtureQuality,
  syntheticLanguageFixtures,
  type SyntheticFixtureQualitySummary,
  type SyntheticLanguageFixture
} from "@assini/synthetic-langs";
import { summarizeEvaluationGate } from "@assini/eval";

export type PublicExercise = Omit<Exercise, "expectedAnswers" | "adversarialAnswers" | "gradingExplanation">;

export type PublicExerciseSubmission = Omit<ExerciseSubmission, "answer" | "learnerId">;

export type PublicExportIntegrity = {
  algorithm: typeof EXPORT_INTEGRITY_ALGORITHM;
  contentHash: string;
  generatedBy: typeof EXPORT_GENERATOR_ID;
  redactionPolicy: string[];
};

export type SyntheticLanguageProfile = {
  language: AppState["languages"][number];
  phonology: SyntheticLanguageFixture["phonology"];
  paradigms: SyntheticLanguageFixture["paradigms"];
  semanticDomains: SyntheticLanguageFixture["semanticDomains"];
  dialectVariants: SyntheticLanguageFixture["dialectVariants"];
  discourseExamples: SyntheticLanguageFixture["discourseExamples"];
  teachingSequences: SyntheticLanguageFixture["teachingSequences"];
  vocabulary: SyntheticLanguageFixture["vocabulary"];
  morphemeInventory: MorphemeInventoryItem[];
  grammarRules: SyntheticLanguageFixture["grammarRules"];
  fixtureMinimums: typeof SYNTHETIC_FIXTURE_MINIMUMS;
  fixtureQuality: SyntheticFixtureQualitySummary;
  stats: {
    vocabularyItems: number;
    grammarRules: number;
    paradigms: number;
    semanticDomains: number;
    dialectVariants: number;
    discourseExamples: number;
    teachingSequences: number;
    corpusPassages: number;
    notes: number;
    exercises: number;
    exerciseTypes: Partial<Record<Exercise["type"], number>>;
  };
};

export type PublicFixtureQualitySummary = {
  languages: number;
  passedLanguages: number;
  failedLanguages: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  passed: boolean;
};

export type MorphemeInventoryItem = {
  surface: string;
  lemma: string;
  glosses: string[];
  features: string[];
  occurrenceCount: number;
  passageIds: string[];
  vocabulary: SyntheticLanguageFixture["vocabulary"][number] | null;
};

export type PublicLanguageSnapshot = {
  exportVersion: typeof LANGUAGE_SNAPSHOT_EXPORT_VERSION;
  exportedAt: string;
  language: AppState["languages"][number];
  linguisticProfile: Omit<SyntheticLanguageProfile, "language">;
  corpus: AppState["corpus"];
  notes: Note[];
  exercises: PublicExercise[];
  governance: AppState["governance"];
  evaluations: AppState["evaluationRuns"];
  integrity: PublicExportIntegrity;
};

export type PublicEvaluationArtifact = {
  exportVersion: typeof EVALUATION_ARTIFACT_EXPORT_VERSION;
  exportedAt: string;
  summary: {
    languages: number;
    totalRuns: number;
    latestRuns: number;
    failedLatestRuns: number;
    regressedLatestRuns: number;
    improvedLatestRuns: number;
    stableLatestRuns: number;
    singleRunLanguages: number;
    averageLatestScore: number;
    passed: boolean;
    failureCount: number;
    fixtureQuality: PublicFixtureQualitySummary;
  };
  latestRuns: EvaluationRun[];
  runsByLanguage: Record<string, string[]>;
  trends: EvaluationTrend[];
  failureLines: string[];
  integrity: PublicExportIntegrity;
};

export type EvaluationTrendStatus = "improved" | "regressed" | "stable" | "single-run";

export type EvaluationTrend = {
  languageId: string;
  latestRunId: string;
  previousRunId: string | null;
  latestAverageScore: number;
  previousAverageScore: number | null;
  averageDelta: number | null;
  status: EvaluationTrendStatus;
  categoryDeltas: Record<string, {
    latestScore: number;
    previousScore: number | null;
    delta: number | null;
  }>;
};

const LANGUAGE_SNAPSHOT_EXPORT_VERSION = "synthetic-language-snapshot-v1";
const EVALUATION_ARTIFACT_EXPORT_VERSION = "synthetic-evaluation-artifact-v1";
const EXPORT_INTEGRITY_ALGORITHM = "sha256";
const EXPORT_GENERATOR_ID = "assini-local-export-v1";
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];

const INTERNAL_NOTE_MARKERS = [
  /answer key/i,
  /synthetic fixture evaluation/i,
  /fixture grammar rule/i,
  /synthetic-answer-key/i,
  /synthetic-fixture-generator/i
];

function containsInternalNoteMarker(value: string): boolean {
  return INTERNAL_NOTE_MARKERS.some((pattern) => pattern.test(value));
}

function normalizeForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForStableJson);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((normalized, key) => {
      const item = record[key];
      if (item !== undefined) {
        normalized[key] = normalizeForStableJson(item);
      }
      return normalized;
    }, {});
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value));
}

function buildExportIntegrity(payload: unknown): PublicExportIntegrity {
  return {
    algorithm: EXPORT_INTEGRITY_ALGORITHM,
    contentHash: createHash(EXPORT_INTEGRITY_ALGORITHM).update(stableStringify(payload)).digest("hex"),
    generatedBy: EXPORT_GENERATOR_ID,
    redactionPolicy: [...EXPORT_REDACTION_POLICY]
  };
}

function cloneEvaluationFailure(failure: EvaluationFailure): EvaluationFailure {
  return { ...failure };
}

function cloneEvaluationRun(run: EvaluationRun): EvaluationRun {
  return {
    ...run,
    scores: { ...run.scores },
    failures: run.failures.map(cloneEvaluationFailure)
  };
}

function averageScore(run: EvaluationRun): number {
  const scores = Object.values(run.scores);
  if (scores.length === 0) return 0;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function roundedScore(value: number): number {
  return Number(value.toFixed(4));
}

function latestRunsByLanguage(runs: EvaluationRun[]): EvaluationRun[] {
  const latest = new Map<string, EvaluationRun>();
  for (const run of runs) {
    const existing = latest.get(run.languageId);
    if (!existing || Date.parse(run.createdAt) > Date.parse(existing.createdAt)) {
      latest.set(run.languageId, run);
    }
  }

  return [...latest.values()].sort((left, right) => left.languageId.localeCompare(right.languageId));
}

function runsByLanguageChronological(runs: EvaluationRun[]): Record<string, EvaluationRun[]> {
  return runs.reduce<Record<string, EvaluationRun[]>>((grouped, run) => {
    grouped[run.languageId] = [...(grouped[run.languageId] ?? []), run];
    return grouped;
  }, {});
}

function compareRunsForTrend(latest: EvaluationRun, previous: EvaluationRun | undefined): EvaluationTrend {
  const latestAverageScore = roundedScore(averageScore(latest));
  const previousAverageScore = previous ? roundedScore(averageScore(previous)) : null;
  const averageDelta = previousAverageScore === null ? null : roundedScore(latestAverageScore - previousAverageScore);
  const categories = new Set([
    ...Object.keys(latest.scores),
    ...Object.keys(previous?.scores ?? {})
  ]);
  const categoryDeltas = [...categories].sort().reduce<EvaluationTrend["categoryDeltas"]>((deltas, category) => {
    const latestScore = roundedScore(latest.scores[category] ?? 0);
    const previousScore = previous?.scores[category] === undefined ? null : roundedScore(previous.scores[category]);
    deltas[category] = {
      latestScore,
      previousScore,
      delta: previousScore === null ? null : roundedScore(latestScore - previousScore)
    };
    return deltas;
  }, {});

  let status: EvaluationTrendStatus = "single-run";
  if (averageDelta !== null) {
    if (averageDelta < 0) {
      status = "regressed";
    } else if (averageDelta > 0) {
      status = "improved";
    } else {
      status = "stable";
    }
  }

  return {
    languageId: latest.languageId,
    latestRunId: latest.id,
    previousRunId: previous?.id ?? null,
    latestAverageScore,
    previousAverageScore,
    averageDelta,
    status,
    categoryDeltas
  };
}

function evaluationTrendsForRuns(runs: EvaluationRun[]): EvaluationTrend[] {
  return Object.entries(runsByLanguageChronological(runs))
    .map(([languageId, languageRuns]) => {
      const sorted = languageRuns.slice().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
      const latest = sorted[sorted.length - 1];
      if (!latest) return undefined;
      const previous = sorted[sorted.length - 2];
      return compareRunsForTrend(latest, previous);
    })
    .filter((trend): trend is EvaluationTrend => trend !== undefined)
    .sort((left, right) => left.languageId.localeCompare(right.languageId));
}

function aggregateFixtureQualityForState(state: AppState): PublicFixtureQualitySummary {
  const summaries = state.languages
    .map((language) => buildSyntheticLanguageProfile(state, language.id)?.fixtureQuality)
    .filter((summary): summary is SyntheticFixtureQualitySummary => summary !== undefined);
  const passedLanguages = summaries.filter((summary) => summary.passed).length;
  const totalChecks = summaries.reduce((total, summary) => total + summary.totalChecks, 0);
  const passedChecks = summaries.reduce((total, summary) => total + summary.passedChecks, 0);
  const failedChecks = summaries.reduce((total, summary) => total + summary.failedChecks, 0);

  return {
    languages: summaries.length,
    passedLanguages,
    failedLanguages: summaries.length - passedLanguages,
    totalChecks,
    passedChecks,
    failedChecks,
    passed: summaries.length > 0
      && summaries.length === state.languages.length
      && summaries.every((summary) => summary.passed)
  };
}

export function toPublicExercise(exercise: Exercise): PublicExercise {
  const {
    expectedAnswers: _expectedAnswers,
    adversarialAnswers: _adversarialAnswers,
    gradingExplanation: _gradingExplanation,
    ...publicExercise
  } = exercise;
  return publicExercise;
}

export function toPublicExerciseSubmission(submission: ExerciseSubmission): PublicExerciseSubmission {
  const { answer: _answer, learnerId: _learnerId, ...publicSubmission } = submission;
  return {
    ...publicSubmission,
    explanation: submission.accepted ? "Accepted synthetic exercise submission." : "Answer did not match the synthetic exercise key."
  };
}

export function toPublicNote(note: Note): Note {
  const publicComments = note.reviewer.comments.filter((comment) => !containsInternalNoteMarker(comment));
  const publicEditHistory = note.editHistory.filter((entry) => (
    !containsInternalNoteMarker(entry.by)
    && !containsInternalNoteMarker(entry.summary)
    && !containsInternalNoteMarker(entry.action)
  ));

  return {
    ...note,
    reviewer: {
      ...note.reviewer,
      lastReviewedBy: note.reviewer.lastReviewedBy && containsInternalNoteMarker(note.reviewer.lastReviewedBy)
        ? "synthetic-review"
        : note.reviewer.lastReviewedBy,
      comments: publicComments
    },
    editHistory: publicEditHistory
  };
}

export function toPublicNotes(notes: Note[]): Note[] {
  return notes.map(toPublicNote);
}

function cloneVocabularyItem(item: SyntheticLanguageFixture["vocabulary"][number]): SyntheticLanguageFixture["vocabulary"][number] {
  return {
    ...item,
    tags: [...item.tags]
  };
}

function buildMorphemeInventory(
  state: AppState,
  languageId: string,
  fixture: SyntheticLanguageFixture | undefined
): MorphemeInventoryItem[] {
  const vocabularyByForm = new Map(
    fixture?.vocabulary.map((item) => [item.form.toLowerCase(), item]) ?? []
  );
  const inventory = new Map<string, {
    surface: string;
    lemma: string;
    glosses: Set<string>;
    features: Set<string>;
    occurrenceCount: number;
    passageIds: Set<string>;
    vocabulary: SyntheticLanguageFixture["vocabulary"][number] | null;
  }>();

  for (const passage of state.corpus.filter((item) => item.languageId === languageId)) {
    for (const morpheme of passage.morphologicalSegmentation) {
      const key = `${morpheme.surface}\u0000${morpheme.lemma}`;
      const existing = inventory.get(key);
      const vocabulary = vocabularyByForm.get(morpheme.surface.toLowerCase())
        ?? vocabularyByForm.get(morpheme.lemma.toLowerCase())
        ?? null;

      if (!existing) {
        inventory.set(key, {
          surface: morpheme.surface,
          lemma: morpheme.lemma,
          glosses: new Set([morpheme.gloss]),
          features: new Set(morpheme.features),
          occurrenceCount: 1,
          passageIds: new Set([passage.id]),
          vocabulary
        });
      } else {
        existing.glosses.add(morpheme.gloss);
        for (const feature of morpheme.features) {
          existing.features.add(feature);
        }
        existing.occurrenceCount += 1;
        existing.passageIds.add(passage.id);
      }
    }
  }

  return [...inventory.values()]
    .map((item) => ({
      surface: item.surface,
      lemma: item.lemma,
      glosses: [...item.glosses].sort(),
      features: [...item.features].sort(),
      occurrenceCount: item.occurrenceCount,
      passageIds: [...item.passageIds].sort(),
      vocabulary: item.vocabulary ? cloneVocabularyItem(item.vocabulary) : null
    }))
    .sort((left, right) => (
      left.surface.localeCompare(right.surface)
      || left.lemma.localeCompare(right.lemma)
    ));
}

export function toPublicEvaluationArtifact(
  state: AppState,
  exportedAt = new Date().toISOString()
): PublicEvaluationArtifact {
  const latestRuns = latestRunsByLanguage(state.evaluationRuns).map(cloneEvaluationRun);
  const averageLatestScore = latestRuns.length === 0
    ? 0
    : latestRuns.reduce((total, run) => total + averageScore(run), 0) / latestRuns.length;
  const gateSummary = summarizeEvaluationGate(latestRuns);
  const failedLatestRuns = latestRuns.filter((run) => !summarizeEvaluationGate([run]).passed).length;
  const trends = evaluationTrendsForRuns(state.evaluationRuns);

  const artifact: Omit<PublicEvaluationArtifact, "integrity"> = {
    exportVersion: EVALUATION_ARTIFACT_EXPORT_VERSION,
    exportedAt,
    summary: {
      languages: state.languages.length,
      totalRuns: state.evaluationRuns.length,
      latestRuns: latestRuns.length,
      failedLatestRuns,
      regressedLatestRuns: trends.filter((trend) => trend.status === "regressed").length,
      improvedLatestRuns: trends.filter((trend) => trend.status === "improved").length,
      stableLatestRuns: trends.filter((trend) => trend.status === "stable").length,
      singleRunLanguages: trends.filter((trend) => trend.status === "single-run").length,
      averageLatestScore,
      passed: gateSummary.passed,
      failureCount: gateSummary.failureLines.length,
      fixtureQuality: aggregateFixtureQualityForState(state)
    },
    latestRuns,
    runsByLanguage: state.evaluationRuns.reduce<Record<string, string[]>>((runsByLanguage, run) => {
      runsByLanguage[run.languageId] = [...(runsByLanguage[run.languageId] ?? []), run.id];
      return runsByLanguage;
    }, {}),
    trends,
    failureLines: gateSummary.failureLines
  };

  return {
    ...artifact,
    integrity: buildExportIntegrity(artifact)
  };
}

export function buildSyntheticLanguageProfile(state: AppState, languageId: string): SyntheticLanguageProfile | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) return undefined;

  const fixture = syntheticLanguageFixtures.find((item) => item.language.id === languageId);
  const exercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
  const stats: SyntheticLanguageProfile["stats"] = {
    vocabularyItems: fixture?.vocabulary.length ?? 0,
    grammarRules: fixture?.grammarRules.length ?? 0,
    paradigms: fixture?.paradigms.length ?? 0,
    semanticDomains: fixture?.semanticDomains.length ?? 0,
    dialectVariants: fixture?.dialectVariants.length ?? 0,
    discourseExamples: fixture?.discourseExamples.length ?? 0,
    teachingSequences: fixture?.teachingSequences.length ?? 0,
    corpusPassages: state.corpus.filter((passage) => passage.languageId === languageId).length,
    notes: state.notes.filter((note) => note.languageId === languageId).length,
    exercises: exercises.length,
    exerciseTypes: exercises.reduce<Partial<Record<Exercise["type"], number>>>((counts, exercise) => {
      counts[exercise.type] = (counts[exercise.type] ?? 0) + 1;
      return counts;
    }, {})
  };

  return {
    language,
    phonology: {
      consonants: [...(fixture?.phonology.consonants ?? [])],
      vowels: [...(fixture?.phonology.vowels ?? [])],
      syllableTemplate: fixture?.phonology.syllableTemplate ?? "",
      stress: fixture?.phonology.stress ?? "",
      phonotactics: [...(fixture?.phonology.phonotactics ?? [])]
    },
    paradigms: fixture?.paradigms.map((paradigm) => ({
      ...paradigm,
      rows: paradigm.rows.map((row) => ({
        ...row,
        morphemes: [...row.morphemes]
      }))
    })) ?? [],
    semanticDomains: fixture?.semanticDomains.map((domain) => ({
      ...domain,
      coreVocabularyIds: [...domain.coreVocabularyIds],
      evidencePassageIds: [...domain.evidencePassageIds],
      usageNotes: [...domain.usageNotes]
    })) ?? [],
    dialectVariants: fixture?.dialectVariants.map((dialect) => ({
      ...dialect,
      phonologyNotes: [...dialect.phonologyNotes],
      lexicalNotes: [...dialect.lexicalNotes],
      grammarNotes: [...dialect.grammarNotes],
      history: {
        summary: dialect.history.summary,
        events: dialect.history.events.map((event) => ({
          ...event,
          evidencePassageIds: [...event.evidencePassageIds]
        }))
      },
      examplePhrases: dialect.examplePhrases.map((example) => ({ ...example }))
    })) ?? [],
    discourseExamples: fixture?.discourseExamples.map((example) => ({
      ...example,
      notes: [...example.notes]
    })) ?? [],
    teachingSequences: fixture?.teachingSequences.map((sequence) => ({
      ...sequence,
      ruleIds: [...sequence.ruleIds],
      corpusPassageIds: [...sequence.corpusPassageIds],
      exerciseIds: [...sequence.exerciseIds],
      steps: sequence.steps.map((step) => ({ ...step }))
    })) ?? [],
    vocabulary: fixture?.vocabulary.map((item) => ({
      ...item,
      tags: [...item.tags]
    })) ?? [],
    morphemeInventory: buildMorphemeInventory(state, languageId, fixture),
    grammarRules: fixture?.grammarRules.map((rule) => ({
      ...rule,
      evidencePassageIds: [...rule.evidencePassageIds]
    })) ?? [],
    fixtureMinimums: { ...SYNTHETIC_FIXTURE_MINIMUMS },
    fixtureQuality: summarizeSyntheticFixtureQuality({
      ...buildSyntheticFixtureQualityActuals(fixture),
      vocabularyItems: stats.vocabularyItems,
      corpusPassages: stats.corpusPassages,
      grammarRules: stats.grammarRules,
      noteAnswerKeys: stats.notes,
      exerciseAnswerKeys: stats.exercises,
      exerciseTypes: Object.keys(stats.exerciseTypes).length,
      paradigms: stats.paradigms,
      semanticDomains: stats.semanticDomains,
      dialectVariants: stats.dialectVariants,
      discourseExamples: stats.discourseExamples,
      teachingSequences: stats.teachingSequences
    }),
    stats
  };
}

export function toPublicLanguageSnapshot(
  state: AppState,
  languageId: string,
  exportedAt = new Date().toISOString()
): PublicLanguageSnapshot | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) return undefined;

  const profile = buildSyntheticLanguageProfile(state, languageId);
  if (!profile) return undefined;
  const { language: _profileLanguage, ...linguisticProfile } = profile;

  const snapshot: Omit<PublicLanguageSnapshot, "integrity"> = {
    exportVersion: LANGUAGE_SNAPSHOT_EXPORT_VERSION,
    exportedAt,
    language,
    linguisticProfile,
    corpus: state.corpus.filter((passage) => passage.languageId === languageId),
    notes: toPublicNotes(state.notes.filter((note) => note.languageId === languageId)),
    exercises: state.exercises.filter((exercise) => exercise.languageId === languageId).map(toPublicExercise),
    governance: state.governance.filter((record) => record.languageId === languageId),
    evaluations: state.evaluationRuns.filter((run) => run.languageId === languageId)
  };

  return {
    ...snapshot,
    integrity: buildExportIntegrity(snapshot)
  };
}
