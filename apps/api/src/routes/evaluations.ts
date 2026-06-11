import type { FastifyInstance } from "fastify";
import type { AppState } from "@assini/db";
import { runEvaluationForState } from "@assini/eval";
import { appendAuditEvents, requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

function averageEvaluationScore(run: AppState["evaluationRuns"][number]): number {
  const scores = Object.values(run.scores);
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function registerEvaluationRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/evaluations", async () => {
    const state = await readState();
    return state.evaluationRuns;
  });

  app.post("/evaluations/run", async (request, reply) => {
    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["lead", "admin", "programmer", "reviewer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let noLanguages = false;
    let runs: ReturnType<typeof runEvaluationForState> | undefined;

    await updateState((state) => {
      if (state.languages.length === 0) {
        noLanguages = true;
        return state;
      }

      runs = runEvaluationForState(state);
      return appendAuditEvents({
        ...state,
        evaluationRuns: [...state.evaluationRuns, ...runs]
      }, runs.map((run) => ({
        actor,
        at: run.createdAt,
        action: "evaluation_run.created",
        entityType: "evaluation_run",
        entityId: run.id,
        languageId: run.languageId,
        summary: `Recorded evaluation run for ${run.languageId}.`,
        metadata: {
          averageScore: averageEvaluationScore(run),
          failureCount: run.failures.length,
          categoryCount: Object.keys(run.scores).length
        }
      })));
    });

    if (noLanguages) {
      reply.code(400);
      return { error: "No languages available to evaluate" };
    }

    return runs;
  });
}
