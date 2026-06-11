import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { exerciseSubmissionPayloadSchema } from "@assini/api-contract";
import {
  EXERCISE_SUBMISSION_ACTOR_ROLES,
  type AppState,
  type Exercise,
  type ExerciseSubmission
} from "@assini/db";
import { gradeExerciseAnswer } from "@assini/eval";
import { generateModelExercise, ModelRequiredError, type GeneratedExerciseDraft } from "../generation.js";
import { rankExercisesForPractice } from "../practiceScheduler.js";
import { toPublicExercise, toPublicExerciseSubmission } from "../publicLanguageViews.js";
import {
  appendAuditEvent,
  firstDuplicateNormalizedValue,
  MODEL_REQUIRED_MESSAGE,
  normalizeAuthoredAnswer,
  parseStringArray,
  redactErrorSecrets,
  requireActor
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

type ExerciseSubmissionBody = {
  answer: string;
};

type ExerciseAuthoringBody = Pick<
  Exercise,
  "type" | "prompt" | "allowedVocabulary" | "allowedRuleIds" | "expectedAnswers" | "adversarialAnswers" | "gradingExplanation"
>;

const EXERCISE_TYPES: readonly Exercise["type"][] = [
  "translate_to_target",
  "translate_to_english",
  "segment",
  "choose_particle"
];

function parseExerciseSubmissionBody(input: unknown): ExerciseSubmissionBody | undefined {
  const result = exerciseSubmissionPayloadSchema.safeParse(input);
  return result.success ? result.data : undefined;
}

function parseExerciseGenerationType(input: unknown): Exercise["type"] | undefined {
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

function parseExerciseAuthoringBody(input: unknown): ExerciseAuthoringBody | undefined {
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

function exerciseAuthoringValidationError(state: AppState, languageId: string, body: ExerciseAuthoringBody): string | undefined {
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

export function registerExerciseRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions, llmProvider } = ctx;

  app.get("/languages/:languageId/exercises", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.exercises.filter((exercise) => exercise.languageId === languageId).map(toPublicExercise);
  });

  app.get("/languages/:languageId/exercises/recommended", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();

    const actor = requireActor(state, request, reply, authToken, prototypeSessions);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const languageExercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
    const ranked = rankExercisesForPractice(languageExercises, state.exerciseSubmissions, actor.id, new Date())
      .slice(0, 10);

    return {
      exercises: ranked.map((entry) => toPublicExercise(entry.exercise)),
      rationale: ranked.map((entry) => ({
        exerciseId: entry.exercise.id,
        status: entry.status,
        ...(entry.dueAt ? { dueAt: entry.dueAt } : {}),
        streak: entry.streak
      }))
    };
  });

  app.post("/languages/:languageId/exercises", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseExerciseAuthoringBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid exercise authoring body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let languageMissing = false;
    let validationError: string | undefined;
    let exercise: Exercise | undefined;

    await updateState((state) => {
      if (!state.languages.some((language) => language.id === languageId)) {
        languageMissing = true;
        return state;
      }

      validationError = exerciseAuthoringValidationError(state, languageId, body);
      if (validationError) {
        return state;
      }

      const createdAt = new Date().toISOString();
      exercise = {
        id: `authored-exercise-${languageId}-${state.exercises.filter((item) => item.languageId === languageId).length + 1}-${randomUUID()}`,
        languageId,
        ...body
      };

      return appendAuditEvent({
        ...state,
        exercises: [...state.exercises, exercise]
      }, {
        actor,
        at: createdAt,
        action: "exercise.created",
        entityType: "exercise",
        entityId: exercise.id,
        languageId,
        summary: `Created exercise ${exercise.id}.`,
        metadata: {
          exerciseType: exercise.type,
          allowedRuleCount: exercise.allowedRuleIds.length,
          allowedVocabularyCount: exercise.allowedVocabulary.length,
          expectedAnswerCount: exercise.expectedAnswers.length,
          adversarialAnswerCount: exercise.adversarialAnswers.length
        }
      });
    });

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!exercise) {
      reply.code(500);
      return { error: "Exercise could not be created" };
    }

    reply.code(201);
    return toPublicExercise(exercise);
  });

  app.get("/exercises/:exerciseId/submissions", async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const state = await readState();
    const exercise = state.exercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      reply.code(404);
      return { error: `Exercise not found: ${exerciseId}` };
    }

    return state.exerciseSubmissions
      .filter((submission) => submission.exerciseId === exerciseId)
      .map(toPublicExerciseSubmission);
  });

  app.post("/exercises/:exerciseId/submissions", async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const body = parseExerciseSubmissionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid exercise submission body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, EXERCISE_SUBMISSION_ACTOR_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let exerciseMissing = false;
    let submission: ExerciseSubmission | undefined;

    await updateState((state) => {
      const exercise = state.exercises.find((item) => item.id === exerciseId);

      if (!exercise) {
        exerciseMissing = true;
        return state;
      }

      const graded = gradeExerciseAnswer(exercise, body.answer);
      const submittedAt = new Date().toISOString();
      submission = {
        id: `submission-${exercise.id}-${state.exerciseSubmissions.length + 1}-${submittedAt}`,
        exerciseId: exercise.id,
        languageId: exercise.languageId,
        answer: body.answer,
        accepted: graded.accepted,
        explanation: graded.accepted ? "Submission accepted." : "Answer did not match the exercise answer key.",
        submittedAt,
        learnerId: actor.id
      };

      return appendAuditEvent({
        ...state,
        exerciseSubmissions: [...state.exerciseSubmissions, submission as ExerciseSubmission]
      }, {
        actor,
        at: submittedAt,
        action: "exercise_submission.created",
        entityType: "exercise_submission",
        entityId: submission.id,
        languageId: exercise.languageId,
        summary: `Graded exercise submission for ${exercise.id}.`,
        metadata: {
          exerciseId: exercise.id,
          exerciseType: exercise.type,
          accepted: graded.accepted
        }
      });
    });

    if (exerciseMissing) {
      reply.code(404);
      return { error: `Exercise not found: ${exerciseId}` };
    }

    if (!submission) {
      reply.code(500);
      return { error: "Exercise submission could not be created" };
    }

    return toPublicExerciseSubmission(submission);
  });

  app.post("/languages/:languageId/exercises/generate", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const language = current.languages.find((item) => item.id === languageId);
    if (!language) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const requestedType = parseExerciseGenerationType(request.body);

    const corpus = current.corpus.filter((passage) => passage.languageId === languageId);
    const lexemes = current.lexemes.filter((lexeme) => lexeme.languageId === languageId);
    const notes = current.notes.filter((note) => note.languageId === languageId);

    let generation: { exercise: GeneratedExerciseDraft; warnings: string[] };
    try {
      generation = await generateModelExercise({ language, lexemes, notes, corpus, type: requestedType, provider: llmProvider });
    } catch (error) {
      if (error instanceof ModelRequiredError) {
        reply.code(400);
        return { error: MODEL_REQUIRED_MESSAGE };
      }
      reply.code(422);
      return { error: redactErrorSecrets(error instanceof Error ? error.message : "Exercise generation failed.") };
    }

    return { exercise: generation.exercise, warnings: generation.warnings };
  });
}
