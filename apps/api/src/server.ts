import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  JsonStore,
  noteStatusSchema,
  type AppState,
  type Exercise,
  type ExerciseSubmission,
  type Note
} from "@assini/db";
import { gradeExerciseAnswer, runEvaluationForState } from "@assini/eval";

type ServerOptions = {
  store?: JsonStore;
  initialState?: AppState;
};

type ReviewBody = Partial<Pick<Note, "status" | "explanation">> & {
  reviewerComment?: string;
};

type PublicExercise = Omit<Exercise, "expectedAnswers">;

type PublicExerciseSubmission = Omit<ExerciseSubmission, "answer">;

type ExerciseSubmissionBody = {
  answer: string;
};

function toPublicExercise(exercise: Exercise): PublicExercise {
  const { expectedAnswers: _expectedAnswers, ...publicExercise } = exercise;
  return publicExercise;
}

function toPublicExerciseSubmission(submission: ExerciseSubmission): PublicExerciseSubmission {
  const { answer: _answer, ...publicSubmission } = submission;
  return {
    ...publicSubmission,
    explanation: submission.accepted ? "Accepted synthetic exercise submission." : submission.explanation
  };
}

function parseExerciseSubmissionBody(input: unknown): ExerciseSubmissionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.answer !== "string") {
    return undefined;
  }

  const answer = body.answer.trim();
  return answer.length > 0 ? { answer } : undefined;
}

function parseReviewBody(input: unknown): ReviewBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const review: ReviewBody = {};
  let hasReviewField = false;

  if ("status" in body) {
    hasReviewField = true;
    const status = noteStatusSchema.safeParse(body.status);
    if (!status.success) return undefined;
    review.status = status.data;
  }

  if ("explanation" in body) {
    hasReviewField = true;
    if (typeof body.explanation !== "string" || body.explanation.trim().length === 0) return undefined;
    review.explanation = body.explanation;
  }

  if ("reviewerComment" in body) {
    hasReviewField = true;
    if (typeof body.reviewerComment !== "string" || body.reviewerComment.trim().length === 0) return undefined;
    review.reviewerComment = body.reviewerComment;
  }

  return hasReviewField ? review : undefined;
}

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  const store = options.store ?? new JsonStore();
  let memoryState = options.initialState;
  const usesMemoryState = options.initialState !== undefined;
  let memoryUpdateQueue: Promise<void> = Promise.resolve();

  const readState = async (): Promise<AppState> => {
    if (!usesMemoryState) {
      return store.read();
    }

    if (!memoryState) {
      throw new Error("Memory state is not initialized");
    }

    return memoryState;
  };

  const updateState = async (updater: (state: AppState) => AppState): Promise<AppState> => {
    if (!usesMemoryState) {
      return store.update(updater);
    }

    const operation = memoryUpdateQueue.then(async () => {
      if (!memoryState) {
        throw new Error("Memory state is not initialized");
      }

      const next = updater(memoryState);
      memoryState = next;
      return next;
    });
    memoryUpdateQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };

  app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  app.get("/languages", async () => {
    const state = await readState();
    return state.languages;
  });

  app.get("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.corpus.filter((passage) => passage.languageId === languageId);
  });

  app.get("/languages/:languageId/notes", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.notes.filter((note) => note.languageId === languageId);
  });

  app.get("/languages/:languageId/exercises", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.exercises.filter((exercise) => exercise.languageId === languageId).map(toPublicExercise);
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
        explanation: graded.accepted ? graded.explanation : "Answer did not match the synthetic exercise key.",
        submittedAt,
        learnerId: "local-learner"
      };

      return {
        ...state,
        exerciseSubmissions: [...state.exerciseSubmissions, submission]
      };
    });

    if (exerciseMissing) {
      reply.code(404);
      return { error: `Exercise not found: ${exerciseId}` };
    }

    return submission;
  });

  app.get("/evaluations", async () => {
    const state = await readState();
    return state.evaluationRuns;
  });

  app.post("/evaluations/run", async (_, reply) => {
    let noLanguages = false;
    let runs: ReturnType<typeof runEvaluationForState> | undefined;

    await updateState((current) => {
      if (current.languages.length === 0) {
        noLanguages = true;
        return current;
      }

      runs = runEvaluationForState(current);
      return {
        ...current,
        evaluationRuns: [...current.evaluationRuns, ...runs]
      };
    });

    if (noLanguages) {
      reply.code(400);
      return { error: "No languages available to evaluate" };
    }

    return runs;
  });

  app.patch("/notes/:noteId/review", async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const body = parseReviewBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review body" };
    }

    let noteMissing = false;
    let nextNote: Note | undefined;

    await updateState((state) => {
      const existing = state.notes.find((note) => note.id === noteId);

      if (!existing) {
        noteMissing = true;
        return state;
      }

      const reviewedAt = new Date().toISOString();
      const nextStatus = body.status ?? existing.status;
      nextNote = {
        ...existing,
        status: nextStatus,
        explanation: body.explanation ?? existing.explanation,
        reviewer: {
          lastReviewedBy: "local-reviewer",
          lastReviewedAt: reviewedAt,
          comments: body.reviewerComment ? [...existing.reviewer.comments, body.reviewerComment] : existing.reviewer.comments
        },
        editHistory: [
          ...existing.editHistory,
          {
            at: reviewedAt,
            by: "local-reviewer",
            action: "reviewed",
            summary: body.reviewerComment ?? `Status set to ${nextStatus}`
          }
        ]
      };

      return {
        ...state,
        notes: state.notes.map((note) => (note.id === noteId ? nextNote as Note : note))
      };
    });

    if (noteMissing) {
      reply.code(404);
      return { error: `Note not found: ${noteId}` };
    }

    return nextNote;
  });

  return app;
}
