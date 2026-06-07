import type { Exercise, Morpheme } from "@assini/db";
import type { SyntheticLanguageFixture } from "./fixtures";

const MIN_CONSONANTS = 6;
const MIN_VOWELS = 3;
const MIN_PHONOTACTIC_NOTES = 2;
const MIN_VOCABULARY_ITEMS = 24;
const MIN_CORPUS_PASSAGES = 12;
const MIN_GRAMMAR_RULES = 6;
const MIN_NOTE_ANSWER_KEYS = 6;
const MIN_EXERCISE_ANSWER_KEYS = 6;
const MIN_EXERCISE_TYPES = 2;
const MIN_PARADIGMS = 2;
const MIN_PARADIGM_ROWS = 3;
const MIN_DIALECT_VARIANTS = 2;

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
  addMinimumCountDiagnostic(fixture.phonology.consonants.length, MIN_CONSONANTS, `${languageId} phonology`, "consonants", diagnostics);
  addMinimumCountDiagnostic(fixture.phonology.vowels.length, MIN_VOWELS, `${languageId} phonology`, "vowels", diagnostics);
  addMinimumCountDiagnostic(
    fixture.phonology.phonotactics.length,
    MIN_PHONOTACTIC_NOTES,
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

  addMinimumCountDiagnostic(fixture.vocabulary.length, MIN_VOCABULARY_ITEMS, languageId, "vocabulary items", diagnostics);
  addMinimumCountDiagnostic(fixture.corpus.length, MIN_CORPUS_PASSAGES, languageId, "corpus passages", diagnostics);
  addMinimumCountDiagnostic(fixture.grammarRules.length, MIN_GRAMMAR_RULES, languageId, "grammar rules", diagnostics);
  addMinimumCountDiagnostic(fixture.notesAnswerKey.length, MIN_NOTE_ANSWER_KEYS, languageId, "note answer keys", diagnostics);
  addMinimumCountDiagnostic(
    fixture.exercisesAnswerKey.length,
    MIN_EXERCISE_ANSWER_KEYS,
    languageId,
    "exercise answer keys",
    diagnostics
  );
  addMinimumCountDiagnostic(
    new Set<Exercise["type"]>(fixture.exercisesAnswerKey.map((exercise) => exercise.type)).size,
    MIN_EXERCISE_TYPES,
    languageId,
    "exercise types",
    diagnostics
  );
  addMinimumCountDiagnostic(fixture.paradigms.length, MIN_PARADIGMS, languageId, "paradigm tables", diagnostics);
  for (const paradigm of fixture.paradigms) {
    addMinimumCountDiagnostic(
      paradigm.rows.length,
      MIN_PARADIGM_ROWS,
      `${languageId} paradigm ${paradigm.id}`,
      "rows",
      diagnostics
    );
  }
  addMinimumCountDiagnostic(
    fixture.dialectVariants.length,
    MIN_DIALECT_VARIANTS,
    languageId,
    "dialect variants",
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
    const noteIds = fixture.notesAnswerKey.map((note) => note.id);
    const exerciseIds = fixture.exercisesAnswerKey.map((exercise) => exercise.id);
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
