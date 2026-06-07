import type { Exercise, Morpheme } from "@assini/db";
import type { SyntheticLanguageFixture } from "./fixtures";

export const SYNTHETIC_FIXTURE_MINIMUMS = {
  consonants: 6,
  vowels: 3,
  phonotacticNotes: 2,
  vocabularyItems: 24,
  corpusPassages: 12,
  grammarRules: 6,
  noteAnswerKeys: 6,
  exerciseAnswerKeys: 6,
  exerciseTypes: 2,
  paradigms: 2,
  paradigmRows: 3,
  dialectVariants: 2,
  discourseExamples: 3,
  teachingSequences: 2
} as const;

export type SyntheticFixtureQualityCheckId = keyof typeof SYNTHETIC_FIXTURE_MINIMUMS;

export type SyntheticFixtureQualityActuals = Record<SyntheticFixtureQualityCheckId, number>;

export type SyntheticFixtureQualityCheck = {
  id: SyntheticFixtureQualityCheckId;
  label: string;
  actual: number;
  minimum: number;
  passed: boolean;
};

export type SyntheticFixtureQualitySummary = {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: SyntheticFixtureQualityCheck[];
};

const SYNTHETIC_FIXTURE_QUALITY_LABELS: Record<SyntheticFixtureQualityCheckId, string> = {
  consonants: "Consonants",
  vowels: "Vowels",
  phonotacticNotes: "Phonotactic notes",
  vocabularyItems: "Vocabulary",
  corpusPassages: "Corpus passages",
  grammarRules: "Grammar rules",
  noteAnswerKeys: "Public notes",
  exerciseAnswerKeys: "Learner exercises",
  exerciseTypes: "Exercise types",
  paradigms: "Paradigm tables",
  paradigmRows: "Minimum paradigm rows",
  dialectVariants: "Dialect variants",
  discourseExamples: "Discourse examples",
  teachingSequences: "Teaching sequences"
};

const SYNTHETIC_FIXTURE_QUALITY_ORDER: SyntheticFixtureQualityCheckId[] = [
  "consonants",
  "vowels",
  "phonotacticNotes",
  "vocabularyItems",
  "corpusPassages",
  "grammarRules",
  "noteAnswerKeys",
  "exerciseAnswerKeys",
  "exerciseTypes",
  "paradigms",
  "paradigmRows",
  "dialectVariants",
  "discourseExamples",
  "teachingSequences"
];

const TEACHING_SEQUENCE_LEVELS = new Set(["intro", "practice", "review"]);

function minimumParadigmRows(fixture: SyntheticLanguageFixture | undefined): number {
  if (!fixture || fixture.paradigms.length === 0) return 0;
  return Math.min(...fixture.paradigms.map((paradigm) => paradigm.rows.length));
}

export function buildSyntheticFixtureQualityActuals(
  fixture: SyntheticLanguageFixture | undefined
): SyntheticFixtureQualityActuals {
  return {
    consonants: fixture?.phonology.consonants.length ?? 0,
    vowels: fixture?.phonology.vowels.length ?? 0,
    phonotacticNotes: fixture?.phonology.phonotactics.length ?? 0,
    vocabularyItems: fixture?.vocabulary.length ?? 0,
    corpusPassages: fixture?.corpus.length ?? 0,
    grammarRules: fixture?.grammarRules.length ?? 0,
    noteAnswerKeys: fixture?.notesAnswerKey.length ?? 0,
    exerciseAnswerKeys: fixture?.exercisesAnswerKey.length ?? 0,
    exerciseTypes: new Set<Exercise["type"]>(fixture?.exercisesAnswerKey.map((exercise) => exercise.type) ?? []).size,
    paradigms: fixture?.paradigms.length ?? 0,
    paradigmRows: minimumParadigmRows(fixture),
    dialectVariants: fixture?.dialectVariants.length ?? 0,
    discourseExamples: fixture?.discourseExamples.length ?? 0,
    teachingSequences: fixture?.teachingSequences.length ?? 0
  };
}

export function summarizeSyntheticFixtureQuality(
  actuals: SyntheticFixtureQualityActuals
): SyntheticFixtureQualitySummary {
  const checks = SYNTHETIC_FIXTURE_QUALITY_ORDER.map((id) => {
    const minimum = SYNTHETIC_FIXTURE_MINIMUMS[id];
    const actual = actuals[id];
    return {
      id,
      label: SYNTHETIC_FIXTURE_QUALITY_LABELS[id],
      actual,
      minimum,
      passed: actual >= minimum
    };
  });

  const passedChecks = checks.filter((check) => check.passed).length;
  const totalChecks = checks.length;

  return {
    passed: passedChecks === totalChecks,
    totalChecks,
    passedChecks,
    failedChecks: totalChecks - passedChecks,
    checks
  };
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedSurfaceKey(value: string): string {
  return normalizedText(value).toLowerCase().replace(/-/g, "");
}

function addDuplicateDiagnostics(items: string[], label: string, diagnostics: string[]) {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const id of items) {
    if (seen.has(id) && !reported.has(id)) {
      diagnostics.push(`${label} ${id}`);
      reported.add(id);
    }
    seen.add(id);
  }
}

function addDuplicateNormalizedDiagnostics(items: string[], label: string, diagnostics: string[]) {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const item of items) {
    const normalized = normalizedText(item);
    if (seen.has(normalized) && !reported.has(normalized)) {
      diagnostics.push(`${label} ${normalized}`);
      reported.add(normalized);
    }
    seen.add(normalized);
  }
}

function addMinimumCountDiagnostic(
  actual: number,
  minimum: number,
  subject: string,
  itemLabel: string,
  diagnostics: string[]
) {
  if (actual < minimum) {
    diagnostics.push(`${subject} needs at least ${minimum} ${itemLabel} (found ${actual})`);
  }
}

export function findInvalidOrthographySymbols(value: string, fixture: SyntheticLanguageFixture): string[] {
  const allowedSymbols = [...fixture.phonology.consonants, ...fixture.phonology.vowels]
    .filter((symbol) => symbol.length > 0)
    .sort((left, right) => right.length - left.length);
  const invalid = new Set<string>();

  for (let index = 0; index < value.length;) {
    const symbol = value[index];
    if (!symbol) break;

    if (/\s/.test(symbol) || symbol === "-") {
      index += 1;
      continue;
    }

    const matched = allowedSymbols.find((allowed) => value.startsWith(allowed, index));
    if (matched) {
      index += matched.length;
      continue;
    }

    invalid.add(symbol);
    index += 1;
  }

  return [...invalid];
}

function hasContiguousMorphemeCoverage(targetToken: string, morphemes: Array<Pick<Morpheme, "surface">>): boolean {
  const targetKey = normalizedSurfaceKey(targetToken);
  const surfaceKeys = morphemes.map((morpheme) => normalizedSurfaceKey(morpheme.surface));

  for (let start = 0; start < surfaceKeys.length; start += 1) {
    let candidate = "";
    for (let end = start; end < surfaceKeys.length; end += 1) {
      candidate += surfaceKeys[end];
      if (candidate === targetKey) return true;
      if (!targetKey.startsWith(candidate)) break;
    }
  }

  return false;
}

export function findUncoveredCorpusTargetTokens(
  textTarget: string,
  morphologicalSegmentation: Array<Pick<Morpheme, "surface">>
): string[] {
  return normalizedText(textTarget)
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !hasContiguousMorphemeCoverage(token, morphologicalSegmentation));
}

function addOrthographyDiagnostics(
  value: string,
  fixture: SyntheticLanguageFixture,
  label: string,
  diagnostics: string[]
) {
  for (const symbol of findInvalidOrthographySymbols(value, fixture)) {
    diagnostics.push(`${label} uses ${symbol} outside phonology inventory`);
  }
}

function addFixtureRichnessDiagnostics(fixture: SyntheticLanguageFixture, diagnostics: string[]) {
  const languageId = fixture.language.id;
  addMinimumCountDiagnostic(
    fixture.phonology.consonants.length,
    SYNTHETIC_FIXTURE_MINIMUMS.consonants,
    `${languageId} phonology`,
    "consonants",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.phonology.vowels.length,
    SYNTHETIC_FIXTURE_MINIMUMS.vowels,
    `${languageId} phonology`,
    "vowels",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.phonology.phonotactics.length,
    SYNTHETIC_FIXTURE_MINIMUMS.phonotacticNotes,
    `${languageId} phonology`,
    "phonotactic notes",
    diagnostics
  );
  if (!fixture.phonology.syllableTemplate.trim()) {
    diagnostics.push(`${languageId} phonology is missing a syllable template`);
  }
  if (!fixture.phonology.stress.trim()) {
    diagnostics.push(`${languageId} phonology is missing a stress rule`);
  }

  addMinimumCountDiagnostic(
    fixture.vocabulary.length,
    SYNTHETIC_FIXTURE_MINIMUMS.vocabularyItems,
    languageId,
    "vocabulary items",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.corpus.length,
    SYNTHETIC_FIXTURE_MINIMUMS.corpusPassages,
    languageId,
    "corpus passages",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.grammarRules.length,
    SYNTHETIC_FIXTURE_MINIMUMS.grammarRules,
    languageId,
    "grammar rules",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.notesAnswerKey.length,
    SYNTHETIC_FIXTURE_MINIMUMS.noteAnswerKeys,
    languageId,
    "note answer keys",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.exercisesAnswerKey.length,
    SYNTHETIC_FIXTURE_MINIMUMS.exerciseAnswerKeys,
    languageId,
    "exercise answer keys",
    diagnostics
  );
  addMinimumCountDiagnostic(
    new Set<Exercise["type"]>(fixture.exercisesAnswerKey.map((exercise) => exercise.type)).size,
    SYNTHETIC_FIXTURE_MINIMUMS.exerciseTypes,
    languageId,
    "exercise types",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.paradigms.length,
    SYNTHETIC_FIXTURE_MINIMUMS.paradigms,
    languageId,
    "paradigm tables",
    diagnostics
  );
  for (const paradigm of fixture.paradigms) {
    addMinimumCountDiagnostic(
      paradigm.rows.length,
      SYNTHETIC_FIXTURE_MINIMUMS.paradigmRows,
      `${languageId} paradigm ${paradigm.id}`,
      "rows",
      diagnostics
    );
  }
  addMinimumCountDiagnostic(
    fixture.dialectVariants.length,
    SYNTHETIC_FIXTURE_MINIMUMS.dialectVariants,
    languageId,
    "dialect variants",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.discourseExamples.length,
    SYNTHETIC_FIXTURE_MINIMUMS.discourseExamples,
    languageId,
    "discourse examples",
    diagnostics
  );
  addMinimumCountDiagnostic(
    fixture.teachingSequences.length,
    SYNTHETIC_FIXTURE_MINIMUMS.teachingSequences,
    languageId,
    "teaching sequences",
    diagnostics
  );
}

function addGrammarRuleCoverageDiagnostics(fixture: SyntheticLanguageFixture, diagnostics: string[]) {
  const languageId = fixture.language.id;
  const noteTopics = new Set(fixture.notesAnswerKey.map((note) => normalizedText(note.topic)));
  const exercisedRuleIds = new Set(fixture.exercisesAnswerKey.flatMap((exercise) => exercise.allowedRuleIds));

  for (const rule of fixture.grammarRules) {
    if (!noteTopics.has(normalizedText(rule.topic))) {
      diagnostics.push(`${languageId} grammar rule ${rule.id} is missing note answer-key coverage`);
    }
    if (!exercisedRuleIds.has(rule.id)) {
      diagnostics.push(`${languageId} grammar rule ${rule.id} is missing exercise coverage`);
    }
  }
}

export function validateSyntheticLanguageFixtures(fixtures: SyntheticLanguageFixture[]): string[] {
  const diagnostics: string[] = [];
  const languageIds = fixtures.map((fixture) => fixture.language.id);
  addDuplicateDiagnostics(languageIds, "duplicate language id", diagnostics);

  for (const fixture of fixtures) {
    const languageId = fixture.language.id;
    const corpusIds = fixture.corpus.map((passage) => passage.id);
    const corpusIdSet = new Set(corpusIds);
    const corpusById = new Map(fixture.corpus.map((passage) => [passage.id, passage]));
    const ruleIds = fixture.grammarRules.map((rule) => rule.id);
    const ruleIdSet = new Set(ruleIds);
    const paradigmIds = fixture.paradigms.map((paradigm) => paradigm.id);
    const dialectVariantIds = fixture.dialectVariants.map((dialect) => dialect.id);
    const discourseExampleIds = fixture.discourseExamples.map((example) => example.id);
    const teachingSequenceIds = fixture.teachingSequences.map((sequence) => sequence.id);
    const noteIds = fixture.notesAnswerKey.map((note) => note.id);
    const exerciseIds = fixture.exercisesAnswerKey.map((exercise) => exercise.id);
    const exerciseIdSet = new Set(exerciseIds);
    const vocabularyForms = new Set(fixture.vocabulary.map((item) => item.form));
    const corpusTargets = new Set(fixture.corpus.map((passage) => normalizedText(passage.textTarget)));
    const vocabularyIds = fixture.vocabulary.map((item) => item.id);
    const vocabularyFormsList = fixture.vocabulary.map((item) => item.form);

    addFixtureRichnessDiagnostics(fixture, diagnostics);
    addGrammarRuleCoverageDiagnostics(fixture, diagnostics);
    addDuplicateDiagnostics(vocabularyIds, `${languageId} has duplicate vocabulary id`, diagnostics);
    addDuplicateNormalizedDiagnostics(vocabularyFormsList, `${languageId} vocabulary form is duplicated:`, diagnostics);
    addDuplicateDiagnostics(corpusIds, `${languageId} has duplicate corpus id`, diagnostics);
    addDuplicateDiagnostics(ruleIds, `${languageId} has duplicate grammar rule id`, diagnostics);
    addDuplicateDiagnostics(paradigmIds, `${languageId} has duplicate paradigm id`, diagnostics);
    addDuplicateDiagnostics(dialectVariantIds, `${languageId} has duplicate dialect variant id`, diagnostics);
    addDuplicateDiagnostics(discourseExampleIds, `${languageId} has duplicate discourse example id`, diagnostics);
    addDuplicateDiagnostics(teachingSequenceIds, `${languageId} has duplicate teaching sequence id`, diagnostics);
    addDuplicateDiagnostics(noteIds, `${languageId} has duplicate note id`, diagnostics);
    addDuplicateDiagnostics(exerciseIds, `${languageId} has duplicate exercise id`, diagnostics);

    for (const vocabularyItem of fixture.vocabulary) {
      addOrthographyDiagnostics(
        vocabularyItem.form,
        fixture,
        `${languageId} vocabulary form ${vocabularyItem.form}`,
        diagnostics
      );
      addDuplicateNormalizedDiagnostics(
        vocabularyItem.tags,
        `${languageId} vocabulary item ${vocabularyItem.id} tag is duplicated:`,
        diagnostics
      );
    }

    for (const passage of fixture.corpus) {
      if (passage.languageId !== languageId) {
        diagnostics.push(`${languageId} corpus passage ${passage.id} has mismatched languageId ${passage.languageId}`);
      }
      addOrthographyDiagnostics(
        passage.textTarget,
        fixture,
        `${languageId} corpus passage ${passage.id} textTarget`,
        diagnostics
      );
      addDuplicateNormalizedDiagnostics(
        passage.topicTags,
        `${languageId} corpus passage ${passage.id} topic tag is duplicated:`,
        diagnostics
      );
      for (const token of findUncoveredCorpusTargetTokens(passage.textTarget, passage.morphologicalSegmentation)) {
        diagnostics.push(`${languageId} corpus passage ${passage.id} segmentation does not cover target token: ${token}`);
      }
      for (const morpheme of passage.morphologicalSegmentation) {
        if (!vocabularyForms.has(morpheme.surface) && !vocabularyForms.has(morpheme.lemma)) {
          diagnostics.push(`${languageId} corpus passage ${passage.id} has ungrounded morpheme ${morpheme.surface}/${morpheme.lemma}`);
        }
        addDuplicateNormalizedDiagnostics(
          morpheme.features,
          `${languageId} corpus passage ${passage.id} morpheme ${morpheme.surface} feature is duplicated:`,
          diagnostics
        );
      }
    }

    for (const rule of fixture.grammarRules) {
      for (const passageId of rule.evidencePassageIds) {
        if (!corpusIdSet.has(passageId)) {
          diagnostics.push(`${languageId} grammar rule ${rule.id} references missing evidence passage ${passageId}`);
        }
      }
    }

    for (const paradigm of fixture.paradigms) {
      for (const row of paradigm.rows) {
        addOrthographyDiagnostics(
          row.form,
          fixture,
          `${languageId} paradigm ${paradigm.id} row ${row.label} form`,
          diagnostics
        );
        for (const morpheme of row.morphemes) {
          if (!vocabularyForms.has(morpheme)) {
            diagnostics.push(`${languageId} paradigm ${paradigm.id} row ${row.label} references unknown morpheme ${morpheme}`);
          }
        }
      }
    }

    for (const dialect of fixture.dialectVariants) {
      const dialectLabel = `${languageId} dialect variant ${dialect.id}`;
      if (!dialect.name.trim()) {
        diagnostics.push(`${dialectLabel} is missing a name`);
      }
      if (!dialect.regionLabel.trim()) {
        diagnostics.push(`${dialectLabel} is missing a region label`);
      }
      if (dialect.phonologyNotes.length === 0) {
        diagnostics.push(`${dialectLabel} needs at least one phonology note`);
      }
      if (dialect.lexicalNotes.length === 0) {
        diagnostics.push(`${dialectLabel} needs at least one lexical note`);
      }
      if (dialect.grammarNotes.length === 0) {
        diagnostics.push(`${dialectLabel} needs at least one grammar note`);
      }
      if (dialect.examplePhrases.length === 0) {
        diagnostics.push(`${dialectLabel} needs at least one example phrase`);
      }
      for (const example of dialect.examplePhrases) {
        if (!example.standard.trim()) {
          diagnostics.push(`${dialectLabel} has an example phrase without a standard form`);
        }
        if (!example.variant.trim()) {
          diagnostics.push(`${dialectLabel} has an example phrase without a variant form`);
        }
        if (!example.translation.trim()) {
          diagnostics.push(`${dialectLabel} has an example phrase without a translation`);
        }
      }
    }

    for (const example of fixture.discourseExamples) {
      const exampleLabel = `${languageId} discourse example ${example.id}`;
      if (!example.id.trim()) {
        diagnostics.push(`${languageId} has a discourse example without an id`);
      }
      if (!example.functionLabel.trim()) {
        diagnostics.push(`${exampleLabel} is missing a function label`);
      }
      if (!example.context.trim()) {
        diagnostics.push(`${exampleLabel} is missing a context`);
      }
      if (!example.target.trim()) {
        diagnostics.push(`${exampleLabel} is missing a target form`);
      } else {
        addOrthographyDiagnostics(example.target, fixture, `${exampleLabel} target`, diagnostics);
      }
      if (!example.translation.trim()) {
        diagnostics.push(`${exampleLabel} is missing a translation`);
      }
      if (example.notes.length === 0) {
        diagnostics.push(`${exampleLabel} needs at least one note`);
      }
      for (const note of example.notes) {
        if (!note.trim()) {
          diagnostics.push(`${exampleLabel} has a blank note`);
        }
      }
    }

    for (const sequence of fixture.teachingSequences) {
      const sequenceLabel = `${languageId} teaching sequence ${sequence.id}`;
      if (!sequence.id.trim()) {
        diagnostics.push(`${languageId} has a teaching sequence without an id`);
      }
      if (!sequence.title.trim()) {
        diagnostics.push(`${sequenceLabel} is missing a title`);
      }
      if (!sequence.objective.trim()) {
        diagnostics.push(`${sequenceLabel} is missing an objective`);
      }
      if (!TEACHING_SEQUENCE_LEVELS.has(sequence.level as string)) {
        diagnostics.push(`${sequenceLabel} has invalid level ${sequence.level}`);
      }
      if (sequence.ruleIds.length === 0) {
        diagnostics.push(`${sequenceLabel} needs at least one rule`);
      }
      if (sequence.corpusPassageIds.length === 0) {
        diagnostics.push(`${sequenceLabel} needs at least one corpus passage`);
      }
      if (sequence.exerciseIds.length === 0) {
        diagnostics.push(`${sequenceLabel} needs at least one exercise`);
      }
      addDuplicateNormalizedDiagnostics(
        sequence.ruleIds,
        `${sequenceLabel} rule is duplicated:`,
        diagnostics
      );
      addDuplicateNormalizedDiagnostics(
        sequence.corpusPassageIds,
        `${sequenceLabel} corpus passage is duplicated:`,
        diagnostics
      );
      addDuplicateNormalizedDiagnostics(
        sequence.exerciseIds,
        `${sequenceLabel} exercise is duplicated:`,
        diagnostics
      );
      for (const ruleId of sequence.ruleIds) {
        if (!ruleIdSet.has(ruleId)) {
          diagnostics.push(`${sequenceLabel} references missing rule ${ruleId}`);
        }
      }
      for (const passageId of sequence.corpusPassageIds) {
        if (!corpusIdSet.has(passageId)) {
          diagnostics.push(`${sequenceLabel} references missing corpus passage ${passageId}`);
        }
      }
      for (const exerciseId of sequence.exerciseIds) {
        if (!exerciseIdSet.has(exerciseId)) {
          diagnostics.push(`${sequenceLabel} references missing exercise ${exerciseId}`);
        }
      }
      if (sequence.steps.length === 0) {
        diagnostics.push(`${sequenceLabel} needs at least one step`);
      }
      sequence.steps.forEach((step, index) => {
        const stepNumber = index + 1;
        if (!step.label.trim()) {
          diagnostics.push(`${sequenceLabel} step ${stepNumber} is missing a label`);
        }
        if (!step.prompt.trim()) {
          diagnostics.push(`${sequenceLabel} step ${stepNumber} is missing a prompt`);
        }
      });
    }

    for (const note of fixture.notesAnswerKey) {
      if (note.languageId !== languageId) {
        diagnostics.push(`${languageId} note ${note.id} has mismatched languageId ${note.languageId}`);
      }
      if (note.evidenceCount !== note.evidencePassageIds.length) {
        diagnostics.push(`${languageId} note ${note.id} evidenceCount ${note.evidenceCount} does not match evidencePassageIds length ${note.evidencePassageIds.length}`);
      }
      for (const passageId of note.evidencePassageIds) {
        if (!corpusIdSet.has(passageId)) {
          diagnostics.push(`${languageId} note ${note.id} references missing evidence passage ${passageId}`);
        }
      }
      for (const example of note.examples) {
        const citedPassage = corpusById.get(example.passageId);
        if (!citedPassage) {
          diagnostics.push(`${languageId} note ${note.id} references missing example passage ${example.passageId}`);
          continue;
        }
        if (normalizedText(example.target) !== normalizedText(citedPassage.textTarget)) {
          diagnostics.push(`${languageId} note ${note.id} example ${example.passageId} target does not match cited corpus textTarget`);
        }
        if (normalizedText(example.translation) !== normalizedText(citedPassage.textTranslation)) {
          diagnostics.push(`${languageId} note ${note.id} example ${example.passageId} translation does not match cited corpus textTranslation`);
        }
      }
    }

    for (const exercise of fixture.exercisesAnswerKey) {
      if (exercise.languageId !== languageId) {
        diagnostics.push(`${languageId} exercise ${exercise.id} has mismatched languageId ${exercise.languageId}`);
      }
      addDuplicateNormalizedDiagnostics(
        exercise.allowedRuleIds,
        `${languageId} exercise ${exercise.id} allowed rule is duplicated:`,
        diagnostics
      );
      addDuplicateNormalizedDiagnostics(
        exercise.allowedVocabulary,
        `${languageId} exercise ${exercise.id} allowed vocabulary is duplicated:`,
        diagnostics
      );
      for (const ruleId of exercise.allowedRuleIds) {
        if (!ruleIdSet.has(ruleId)) {
          diagnostics.push(`${languageId} exercise ${exercise.id} references missing rule ${ruleId}`);
        }
      }
      for (const form of exercise.allowedVocabulary) {
        if (!vocabularyForms.has(form)) {
          diagnostics.push(`${languageId} exercise ${exercise.id} allows unknown vocabulary form ${form}`);
        }
      }
      const normalizedExpectedAnswers = new Set<string>();
      for (const answer of exercise.expectedAnswers) {
        const normalizedAnswer = normalizedText(answer);
        if (normalizedExpectedAnswers.has(normalizedAnswer)) {
          diagnostics.push(`${languageId} exercise ${exercise.id} expected answer is duplicated: ${normalizedAnswer}`);
        }
        normalizedExpectedAnswers.add(normalizedAnswer);
      }
      if (exercise.type === "translate_to_target") {
        for (const answer of exercise.expectedAnswers) {
          if (!corpusTargets.has(normalizedText(answer))) {
            diagnostics.push(`${languageId} translate-to-target exercise ${exercise.id} expected answer is not present in corpus: ${answer}`);
          }
        }
      }
      if (exercise.type === "choose_particle") {
        for (const answer of exercise.expectedAnswers) {
          if (!exercise.allowedVocabulary.includes(answer)) {
            diagnostics.push(`${languageId} choose-particle exercise ${exercise.id} expected answer is not allowed vocabulary: ${answer}`);
          }
        }
      }
      const normalizedAdversarialAnswers = new Set<string>();
      for (const adversarial of exercise.adversarialAnswers) {
        const normalizedAdversarialAnswer = normalizedText(adversarial.answer);
        if (normalizedExpectedAnswers.has(normalizedAdversarialAnswer)) {
          diagnostics.push(`${languageId} exercise ${exercise.id} adversarial answer duplicates an expected answer: ${adversarial.answer}`);
        }
        if (normalizedAdversarialAnswers.has(normalizedAdversarialAnswer)) {
          diagnostics.push(`${languageId} exercise ${exercise.id} adversarial answer is duplicated: ${normalizedAdversarialAnswer}`);
        }
        normalizedAdversarialAnswers.add(normalizedAdversarialAnswer);
      }
    }
  }

  return diagnostics;
}
