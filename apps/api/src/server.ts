import cors from "@fastify/cors";
import Fastify from "fastify";
import { JsonStore, noteStatusSchema, type AppState, type Note } from "@assini/db";
import { runEvaluationForState } from "@assini/eval";

type ServerOptions = {
  store?: JsonStore;
  initialState?: AppState;
};

type ReviewBody = Partial<Pick<Note, "status" | "explanation">> & {
  reviewerComment?: string;
};

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

  const readState = async () => memoryState ?? store.read();

  const writeState = async (state: AppState) => {
    if (memoryState) {
      memoryState = state;
      return;
    }

    await store.write(state);
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
    return state.exercises.filter((exercise) => exercise.languageId === languageId);
  });

  app.get("/evaluations", async () => {
    const state = await readState();
    return state.evaluationRuns;
  });

  app.post("/evaluations/run", async (_, reply) => {
    const current = await readState();
    if (current.languages.length === 0) {
      reply.code(400);
      return { error: "No languages available to evaluate" };
    }

    const runs = runEvaluationForState(current);

    await writeState({
      ...current,
      evaluationRuns: [...current.evaluationRuns, ...runs]
    });

    return runs;
  });

  app.patch("/notes/:noteId/review", async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const body = parseReviewBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review body" };
    }

    const state = await readState();
    const existing = state.notes.find((note) => note.id === noteId);

    if (!existing) {
      reply.code(404);
      return { error: `Note not found: ${noteId}` };
    }

    const reviewedAt = new Date().toISOString();
    const nextStatus = body.status ?? existing.status;
    const nextNote: Note = {
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

    await writeState({
      ...state,
      notes: state.notes.map((note) => (note.id === noteId ? nextNote : note))
    });

    return nextNote;
  });

  return app;
}
