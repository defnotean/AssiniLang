import { createHash } from "node:crypto";

import type {
  AppState,
  EvaluationFailure,
  EvaluationRun,
  Exercise,
  ExerciseSubmission,
  ExtractionDraft,
  LanguagePhonology,
  Lexeme,
  Note
} from "@assini/db";
import { summarizeEvaluationGate } from "@assini/eval";

import { detectParadigmGaps, type ParadigmGap } from "./paradigmGaps.js";

export type { ParadigmGap } from "./paradigmGaps.js";

export type PublicExercise = Omit<Exercise, "expectedAnswers" | "adversarialAnswers" | "gradingExplanation">;

/**
 * Read-time duplicate flag for an extraction draft. Never persisted: it is
 * recomputed for every listing so it always reflects the current workspace.
 *
 * - `exact`: the draft matches an existing same-language entity outright
 *   (lexeme form+gloss or corpus passage target text).
 * - `form`: a lexeme draft reuses an existing form with a different gloss
 *   (possibly a homonym or a gloss refinement, so it is flagged separately).
 * - `topic`: a grammar-note draft repeats an existing note topic.
 * - `pending`: an earlier proposed draft in the queue already proposes the
 *   same thing; only the later draft is flagged.
 */
export type ExtractionDraftDuplicate =
  | { kind: "exact"; entityId: string }
  | { kind: "form"; entityId: string }
  | { kind: "topic"; entityId: string }
  | { kind: "pending"; draftId: string };

export type ExtractionDraftView = ExtractionDraft & { duplicate?: ExtractionDraftDuplicate };

export type PublicExerciseSubmission = Omit<ExerciseSubmission, "answer" | "learnerId">;

export type PublicExportIntegrity = {
  algorithm: typeof EXPORT_INTEGRITY_ALGORITHM;
  contentHash: string;
  generatedBy: typeof EXPORT_GENERATOR_ID;
  redactionPolicy: string[];
};

export type PublicVocabularyItem = {
  id: string;
  form: string;
  gloss: string;
  partOfSpeech: string;
  tags: string[];
};

export type PublicGrammarRule = {
  id: string;
  topic: string;
  explanation: string;
  evidencePassageIds: string[];
  confidence: Note["confidence"];
  status: Note["status"];
};

export type LanguageProfile = {
  language: AppState["languages"][number];
  phonology: LanguagePhonology | null;
  vocabulary: PublicVocabularyItem[];
  morphemeInventory: MorphemeInventoryItem[];
  grammarRules: PublicGrammarRule[];
  paradigmGaps: ParadigmGap[];
  stats: {
    vocabularyItems: number;
    grammarRules: number;
    corpusPassages: number;
    notes: number;
    exercises: number;
    sourceAssets: number;
    pendingExtractionDrafts: number;
    exerciseTypes: Partial<Record<Exercise["type"], number>>;
  };
};

export type MorphemeInventoryItem = {
  surface: string;
  lemma: string;
  glosses: string[];
  features: string[];
  occurrenceCount: number;
  passageIds: string[];
  vocabulary: PublicVocabularyItem | null;
};

export type PublicLanguageSnapshot = {
  exportVersion: typeof LANGUAGE_SNAPSHOT_EXPORT_VERSION;
  exportedAt: string;
  language: AppState["languages"][number];
  linguisticProfile: Omit<LanguageProfile, "language">;
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

const LANGUAGE_SNAPSHOT_EXPORT_VERSION = "language-snapshot-v2";
const EVALUATION_ARTIFACT_EXPORT_VERSION = "evaluation-artifact-v2";
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
  /test-generator/i
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
    explanation: submission.accepted ? "Submission accepted." : "Answer did not match the exercise answer key."
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
        ? "internal-review"
        : note.reviewer.lastReviewedBy,
      comments: publicComments
    },
    editHistory: publicEditHistory
  };
}

export function toPublicNotes(notes: Note[]): Note[] {
  return notes.map(toPublicNote);
}

function toPublicVocabularyItem(lexeme: Lexeme): PublicVocabularyItem {
  return {
    id: lexeme.id,
    form: lexeme.form,
    gloss: lexeme.gloss,
    partOfSpeech: lexeme.partOfSpeech,
    tags: [...lexeme.tags]
  };
}

function buildMorphemeInventory(
  state: AppState,
  languageId: string,
  vocabulary: PublicVocabularyItem[]
): MorphemeInventoryItem[] {
  const vocabularyByForm = new Map(vocabulary.map((item) => [item.form.toLowerCase(), item]));
  const inventory = new Map<string, {
    surface: string;
    lemma: string;
    glosses: Set<string>;
    features: Set<string>;
    occurrenceCount: number;
    passageIds: Set<string>;
    vocabulary: PublicVocabularyItem | null;
  }>();

  for (const passage of state.corpus.filter((item) => item.languageId === languageId)) {
    for (const morpheme of passage.morphologicalSegmentation) {
      const key = `${morpheme.surface}|${morpheme.lemma}`;
      const existing = inventory.get(key);
      const vocabularyMatch = vocabularyByForm.get(morpheme.surface.toLowerCase())
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
          vocabulary: vocabularyMatch
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
      vocabulary: item.vocabulary ? { ...item.vocabulary, tags: [...item.vocabulary.tags] } : null
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
      failureCount: gateSummary.failureLines.length
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

export function buildLanguageProfile(state: AppState, languageId: string): LanguageProfile | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) return undefined;

  const vocabulary = state.lexemes
    .filter((lexeme) => lexeme.languageId === languageId)
    .map(toPublicVocabularyItem)
    .sort((left, right) => left.form.localeCompare(right.form));

  const grammarRules: PublicGrammarRule[] = toPublicNotes(
    state.notes.filter((note) => note.languageId === languageId)
  ).map((note) => ({
    id: note.id,
    topic: note.topic,
    explanation: note.explanation,
    evidencePassageIds: [...note.evidencePassageIds],
    confidence: note.confidence,
    status: note.status
  }));

  const exercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
  const stats: LanguageProfile["stats"] = {
    vocabularyItems: vocabulary.length,
    grammarRules: grammarRules.length,
    corpusPassages: state.corpus.filter((passage) => passage.languageId === languageId).length,
    notes: state.notes.filter((note) => note.languageId === languageId).length,
    exercises: exercises.length,
    sourceAssets: state.sourceAssets.filter((asset) => asset.languageId === languageId).length,
    pendingExtractionDrafts: state.extractionDrafts.filter(
      (draft) => draft.languageId === languageId && draft.status === "proposed"
    ).length,
    exerciseTypes: exercises.reduce<Partial<Record<Exercise["type"], number>>>((counts, exercise) => {
      counts[exercise.type] = (counts[exercise.type] ?? 0) + 1;
      return counts;
    }, {})
  };

  return {
    language,
    phonology: language.phonology
      ? {
          consonants: [...language.phonology.consonants],
          vowels: [...language.phonology.vowels],
          syllableTemplate: language.phonology.syllableTemplate,
          stress: language.phonology.stress,
          notes: [...language.phonology.notes]
        }
      : null,
    vocabulary,
    morphemeInventory: buildMorphemeInventory(state, languageId, vocabulary),
    grammarRules,
    paradigmGaps: detectParadigmGaps(state, languageId),
    stats
  };
}

function normalizeDuplicateKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Identity key for "two drafts proposing the same thing" within the pending
 * queue: form+gloss for lexemes, normalized target text for passages, and
 * the topic for grammar notes. Returns undefined for incomplete payloads.
 */
function extractionDraftIdentityKey(draft: ExtractionDraft): string | undefined {
  if (draft.kind === "lexeme") {
    const form = draft.payload.form?.trim();
    const gloss = draft.payload.gloss?.trim();
    if (!form || !gloss) return undefined;
    return `lexeme:${normalizeDuplicateKey(form)}::${normalizeDuplicateKey(gloss)}`;
  }

  if (draft.kind === "corpus_passage") {
    const textTarget = draft.payload.textTarget?.trim();
    if (!textTarget) return undefined;
    return `corpus_passage:${normalizeDuplicateKey(textTarget)}`;
  }

  const topic = draft.payload.topic?.trim();
  if (!topic) return undefined;
  return `grammar_note:${normalizeDuplicateKey(topic)}`;
}

function existingEntityDuplicate(state: AppState, draft: ExtractionDraft): ExtractionDraftDuplicate | undefined {
  if (draft.kind === "lexeme") {
    const form = draft.payload.form?.trim();
    const gloss = draft.payload.gloss?.trim();
    if (!form) return undefined;
    const normalizedForm = normalizeDuplicateKey(form);
    const normalizedGloss = gloss ? normalizeDuplicateKey(gloss) : undefined;

    const sameLanguageLexemes = state.lexemes.filter(
      (lexeme) => lexeme.languageId === draft.languageId && normalizeDuplicateKey(lexeme.form) === normalizedForm
    );
    const exactMatch = normalizedGloss === undefined
      ? undefined
      : sameLanguageLexemes.find((lexeme) => normalizeDuplicateKey(lexeme.gloss) === normalizedGloss);
    if (exactMatch) return { kind: "exact", entityId: exactMatch.id };

    const formMatch = sameLanguageLexemes[0];
    return formMatch ? { kind: "form", entityId: formMatch.id } : undefined;
  }

  if (draft.kind === "corpus_passage") {
    const textTarget = draft.payload.textTarget?.trim();
    if (!textTarget) return undefined;
    const normalizedTarget = normalizeDuplicateKey(textTarget);
    const match = state.corpus.find(
      (passage) => passage.languageId === draft.languageId
        && normalizeDuplicateKey(passage.textTarget) === normalizedTarget
    );
    return match ? { kind: "exact", entityId: match.id } : undefined;
  }

  const topic = draft.payload.topic?.trim();
  if (!topic) return undefined;
  const normalizedTopic = normalizeDuplicateKey(topic);
  const match = state.notes.find(
    (note) => note.languageId === draft.languageId && normalizeDuplicateKey(note.topic) === normalizedTopic
  );
  return match ? { kind: "topic", entityId: match.id } : undefined;
}

/**
 * Annotates listed extraction drafts with non-persisted duplicate flags,
 * computed at read time against committed workspace entities and the pending
 * queue itself. One flag per draft; existing-entity matches (exact, then
 * form/topic) take priority over pending-queue matches.
 */
export function toExtractionDraftViews(state: AppState, drafts: ExtractionDraft[]): ExtractionDraftView[] {
  const pendingQueue = state.extractionDrafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => draft.status === "proposed")
    .sort((left, right) => (
      Date.parse(left.draft.createdAt) - Date.parse(right.draft.createdAt)
      || left.index - right.index
    ));

  const earliestPendingByKey = new Map<string, string>();
  const pendingDuplicateOf = new Map<string, string>();
  for (const { draft } of pendingQueue) {
    const key = extractionDraftIdentityKey(draft);
    if (!key) continue;
    const scopedKey = `${draft.languageId}::${key}`;
    const earliest = earliestPendingByKey.get(scopedKey);
    if (earliest === undefined) {
      earliestPendingByKey.set(scopedKey, draft.id);
    } else {
      pendingDuplicateOf.set(draft.id, earliest);
    }
  }

  return drafts.map((draft) => {
    if (draft.status !== "proposed") return { ...draft };

    const existing = existingEntityDuplicate(state, draft);
    if (existing) return { ...draft, duplicate: existing };

    const earlierDraftId = pendingDuplicateOf.get(draft.id);
    if (earlierDraftId) return { ...draft, duplicate: { kind: "pending", draftId: earlierDraftId } };

    return { ...draft };
  });
}

export function toPublicLanguageSnapshot(
  state: AppState,
  languageId: string,
  exportedAt = new Date().toISOString()
): PublicLanguageSnapshot | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) return undefined;

  const profile = buildLanguageProfile(state, languageId);
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
