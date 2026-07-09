import { exerciseSubmissionPayloadSchema } from "@assini/api-contract";
import type { AppState, Exercise } from "@assini/db";
import {
  firstDuplicateNormalizedValue,
  normalizeAuthoredAnswer,
  parseStringArray
} from "../routeHelpers.js";
import { parseSchemaBody } from "./requestBody.js";

type ExerciseSubmissionBody = {
  answer: string;
};

export type ExerciseAuthoringBody = Pick<
  Exercise,
  "type" | "prompt" | "allowedVocabulary" | "allowedRuleIds" | "expectedAnswers" | "adversarialAnswers" | "gradingExplanation"
>;

const EXERCISE_TYPES: readonly Exercise["type"][] = [
  "translate_to_target",
  "translate_to_english",
  "segment",
  "choose_particle"
];

export function parseExerciseSubmissionBody(input: unknown): ExerciseSubmissionBody | undefined {
  return parseSchemaBody(exerciseSubmissionPayloadSchema, input);
}

export function parseExerciseGenerationType(input: unknown): Exercise["type"] | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const { type } = input as Record<string, unknown>;
  return typeof type === "string" && EXERCISE_TYPES.includes(type as Exercise["type"])
    ? (type as Exercise["type"])
    : undefined;
}

function parseAdversarialAnswers(value: unknown): Exercise["adversarialAnswers"] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const answers: Exercise["adversarialAnswers"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    const reason = typeof record.reason === "string" ? record.reason.trim() : "";
    if (!answer || !reason) return undefined;
    answers.push({ answer, reason });
  }

  return answers;
}

export function parseExerciseAuthoringBody(input: unknown): ExerciseAuthoringBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const type = typeof body.type === "string" && EXERCISE_TYPES.includes(body.type as Exercise["type"])
    ? body.type as Exercise["type"]
    : undefined;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().replace(/\s+/g, " ") : "";
  const allowedVocabulary = parseStringArray(body.allowedVocabulary);
  const allowedRuleIds = parseStringArray(body.allowedRuleIds);
  const expectedAnswers = parseStringArray(body.expectedAnswers);
  const adversarialAnswers = parseAdversarialAnswers(body.adversarialAnswers);
  const gradingExplanation = typeof body.gradingExplanation === "string"
    ? body.gradingExplanation.trim().replace(/\s+/g, " ")
    : "";

  if (!type || prompt.length === 0 || !allowedVocabulary || allowedVocabulary.length === 0) return undefined;
  if (!allowedRuleIds || allowedRuleIds.length === 0) return undefined;
  if (!expectedAnswers || expectedAnswers.length === 0) return undefined;
  if (!adversarialAnswers || gradingExplanation.length === 0) return undefined;

  return {
    type,
    prompt,
    allowedVocabulary,
    allowedRuleIds,
    expectedAnswers,
    adversarialAnswers,
    gradingExplanation
  };
}

export function exerciseAuthoringValidationWarnings(state: AppState, languageId: string): string[] {
  const warnings: string[] = [];
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) {
    return warnings;
  }

  const lexemes = state.lexemes.filter((lexeme) => lexeme.languageId === languageId);
  if (lexemes.length === 0) {
    warnings.push(`Vocabulary existence is skipped because ${language.name} has no lexicon entries yet.`);
  }

  return warnings;
}

export function validateExerciseAuthoring(
  state: AppState,
  languageId: string,
  body: ExerciseAuthoringBody
): { errors: string[]; warnings: string[] } {
  const warnings = exerciseAuthoringValidationWarnings(state, languageId);
  const validationError = exerciseAuthoringValidationError(state, languageId, body);
  if (validationError) {
    return { errors: [validationError], warnings };
  }

  return { errors: [], warnings };
}

export function exerciseAuthoringValidationError(state: AppState, languageId: string, body: ExerciseAuthoringBody): string | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) {
    return `Exercise authoring language not found: ${languageId}`;
  }

  const ruleIds = new Set([
    ...state.notes.filter((note) => note.languageId === languageId).map((note) => note.id),
    ...state.noteAnswerKeys.filter((note) => note.languageId === languageId).map((note) => note.id)
  ]);
  const languageLexemes = state.lexemes.filter((lexeme) => lexeme.languageId === languageId);
  const vocabularyForms = new Set(languageLexemes.map((item) => item.form));
  const corpusTargets = new Set(
    state.corpus
      .filter((passage) => passage.languageId === languageId)
      .map((passage) => normalizeAuthoredAnswer(passage.textTarget))
  );

  for (const ruleId of body.allowedRuleIds) {
    if (!ruleIds.has(ruleId)) {
      return `Exercise references unknown rule: ${ruleId}`;
    }
  }

  // Vocabulary existence is only enforceable once the language has a
  // lexicon; early-stage languages can author exercises freely.
  if (languageLexemes.length > 0) {
    for (const form of body.allowedVocabulary) {
      if (!vocabularyForms.has(form)) {
        return `Exercise references unknown vocabulary form: ${form}`;
      }
    }
  }

  const duplicateAllowedRule = firstDuplicateNormalizedValue(body.allowedRuleIds);
  if (duplicateAllowedRule) {
    return `Exercise allowed rule is duplicated: ${duplicateAllowedRule}`;
  }

  const duplicateAllowedVocabulary = firstDuplicateNormalizedValue(body.allowedVocabulary);
  if (duplicateAllowedVocabulary) {
    return `Exercise allowed vocabulary is duplicated: ${duplicateAllowedVocabulary}`;
  }

  if (body.prompt.length < 12) {
    return "Exercise prompt must be substantive.";
  }

  if (body.gradingExplanation.length < 24) {
    return "Exercise grading explanation must be substantive.";
  }

  if (body.adversarialAnswers.length < 2) {
    return "Exercise authoring requires at least two adversarial probes.";
  }

  const normalizedExpected = new Set<string>();
  for (const answer of body.expectedAnswers) {
    const normalizedAnswer = normalizeAuthoredAnswer(answer);
    if (normalizedExpected.has(normalizedAnswer)) {
      return `Exercise expected answer is duplicated: ${normalizedAnswer}`;
    }
    normalizedExpected.add(normalizedAnswer);
  }

  if (body.type === "translate_to_target") {
    for (const answer of body.expectedAnswers) {
      if (!corpusTargets.has(normalizeAuthoredAnswer(answer))) {
        return `Translate-to-target expected answer is not present in corpus: ${answer}`;
      }
    }
  }

  if (body.type === "choose_particle") {
    for (const answer of body.expectedAnswers) {
      if (!body.allowedVocabulary.includes(answer)) {
        return `Choose-particle expected answer is not allowed vocabulary: ${answer}`;
      }
    }
  }

  const normalizedAdversarial = new Set<string>();
  for (const adversarial of body.adversarialAnswers) {
    const normalizedAnswer = normalizeAuthoredAnswer(adversarial.answer);
    if (normalizedExpected.has(normalizedAnswer)) {
      return `Exercise adversarial answer duplicates an expected answer: ${adversarial.answer}`;
    }
    if (normalizedAdversarial.has(normalizedAnswer)) {
      return `Exercise adversarial answer is duplicated: ${normalizedAnswer}`;
    }
    normalizedAdversarial.add(normalizedAnswer);
  }

  return undefined;
}
