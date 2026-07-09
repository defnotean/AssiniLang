import type { FastifyInstance, FastifyReply } from "fastify";
import { toPublicEvaluationArtifact, toPublicLanguageSnapshot } from "../publicLanguageViews.js";
import { appendAuditEvent, requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

function safeExportFileToken(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "export";
}

function setExportResponseHeaders(reply: FastifyReply, fileName: string): void {
  reply.header("Cache-Control", "no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
}

export function registerExportRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, authToken, prototypeSessions } = ctx;

  app.get("/exports/languages/:languageId/snapshot", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const snapshot = toPublicLanguageSnapshot(state, languageId);
    if (!snapshot) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    setExportResponseHeaders(reply, `assini-${safeExportFileToken(languageId)}-snapshot.json`);

    await updateState((current) => appendAuditEvent(current, {
      actor,
      at: snapshot.exportedAt,
      action: "language_snapshot.exported",
      entityType: "language",
      entityId: languageId,
      languageId,
      summary: `Exported language snapshot for ${languageId}.`,
      metadata: {
        exportVersion: snapshot.exportVersion,
        contentHash: snapshot.integrity.contentHash,
        algorithm: snapshot.integrity.algorithm
      }
    }));

    return snapshot;
  });

  app.get("/exports/evaluations/artifact", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "programmer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const artifact = toPublicEvaluationArtifact(state);
    setExportResponseHeaders(reply, "assini-evaluation-artifact.json");

    await updateState((current) => appendAuditEvent(current, {
      actor,
      at: artifact.exportedAt,
      action: "evaluation_artifact.exported",
      entityType: "evaluation_run",
      entityId: "evaluation-artifact",
      languageId: null,
      summary: "Exported sanitized evaluation artifact.",
      metadata: {
        exportVersion: artifact.exportVersion,
        contentHash: artifact.integrity.contentHash,
        algorithm: artifact.integrity.algorithm,
        passed: artifact.summary.passed,
        languages: artifact.summary.languages,
        totalRuns: artifact.summary.totalRuns,
        failureCount: artifact.summary.failureCount
      }
    }));

    return artifact;
  });
}
