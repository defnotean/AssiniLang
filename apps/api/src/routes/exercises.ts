import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  EXERCISE_SUBMISSION_ACTOR_ROLES,
  type Exercise,
  type ExerciseSubmission
} from "@assini/db";
import { gradeExerciseAnswer } from "@assini/eval";
import { generateModelExercise, ModelRequiredError, type GeneratedExerciseDraft } from "../generation.js";
import { rankExercisesForPractice } from "../practiceScheduler.js";
import { toPublicExercise, toPublicExerciseSubmission } from "../publicLanguageViews.js";
import {
  appendAuditEvent,
  MODEL_REQUIRED_MESSAGE,
  redactErrorSecrets,
  requireActor
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";
import {
  type ExerciseAuthoringBody,
  exerciseAuthoringValidationError,
  parseExerciseAuthoringBody,
  parseExerciseGenerationType,
  parseExerciseSubmissionBody,
  validateExerciseAuthoring
} from "./exerciseParsing.js";

export type ExerciseAuthoringDryRunResponse = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  preview: ExerciseAuthoringBody | null;
};

function isExerciseDryRunRequest(request: { query: unknown }, rawBody: unknown): boolean {
  const query = request.query as Record<string, string | undefined>;
  if (query.dryRun === "1" || query.dryRun === "true") {
    return true;
  }
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return (rawBody as Record<string, unknown>).dryRun === true;
  }
  return false;
}

function exerciseAuthoringPayloadFromRequest(rawBody: unknown): unknown {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return rawBody;
  }
  const { dryRun: _dryRun, ...rest } = rawBody as Record<string, unknown>;
  return rest;
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
    const dryRun = isExerciseDryRunRequest(request, request.body ?? {});
    const body = parseExerciseAuthoringBody(exerciseAuthoringPayloadFromRequest(request.body ?? {}));
    if (!body) {
      if (dryRun) {
        return {
          ok: false,
          errors: ["Invalid exercise authoring body"],
          warnings: [],
          preview: null
        } satisfies ExerciseAuthoringDryRunResponse;
      }
      reply.code(400);
      return { error: "Invalid exercise authoring body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    if (dryRun) {
      const validation = validateExerciseAuthoring(current, languageId, body);
      return {
        ok: validation.errors.length === 0,
        errors: validation.errors,
        warnings: validation.warnings,
        preview: validation.errors.length === 0 ? body : null
      } satisfies ExerciseAuthoringDryRunResponse;
    }

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
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, [
      "learner",
      "reviewer",
      "lead",
      "admin"
    ]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

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
