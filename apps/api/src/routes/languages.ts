import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { languageCreatePayloadSchema, languagePatchPayloadSchema } from "@assini/api-contract";
import { isReviewPolicyAssignableRole, type Language, type ReviewPolicy } from "@assini/db";
import { buildLanguageProfile } from "../publicLanguageViews.js";
import { deleteLanguageAssetDirectory, purgeLanguageFromState } from "../languageDeletion.js";
import { appendAuditEvent, parseStringArray, requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

type LanguageCreateBody = {
  name: string;
  description: string;
  orthography: string;
  typology: Language["typology"];
  phonology?: Language["phonology"];
};

type LanguagePatchBody = Partial<LanguageCreateBody>;

function slugifyLanguageName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseLanguagePhonology(value: unknown): Language["phonology"] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const consonants = parseStringArray(record.consonants);
  const vowels = parseStringArray(record.vowels);
  const notes = parseStringArray(record.notes);
  if (!consonants || !vowels || !notes) return undefined;
  const syllableTemplate = typeof record.syllableTemplate === "string" ? record.syllableTemplate.trim() : undefined;
  const stress = typeof record.stress === "string" ? record.stress.trim() : undefined;
  return {
    consonants,
    vowels,
    notes,
    syllableTemplate: syllableTemplate || undefined,
    stress: stress || undefined
  };
}

function parseLanguageCreateBody(input: unknown): LanguageCreateBody | undefined {
  const result = languageCreatePayloadSchema.safeParse(input);
  return result.success ? (result.data as LanguageCreateBody) : undefined;
}

function parseLanguagePatchBody(input: unknown): LanguagePatchBody | undefined {
  const result = languagePatchPayloadSchema.safeParse(input);
  return result.success ? (result.data as LanguagePatchBody) : undefined;
}

export function registerLanguageRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions, dataDir } = ctx;

  app.get("/languages", async () => {
    const state = await readState();
    return state.languages;
  });

  app.post("/languages", async (request, reply) => {
    const body = parseLanguageCreateBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid language body: name, description, and orthography are required" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let created: Language | undefined;

    await updateState((state) => {
      const slug = slugifyLanguageName(body.name);
      const baseId = slug.length > 0 ? slug : `language-${randomUUID().slice(0, 8)}`;
      const id = state.languages.some((language) => language.id === baseId)
        ? `${baseId}-${randomUUID().slice(0, 8)}`
        : baseId;
      const createdAt = new Date().toISOString();

      created = {
        id,
        name: body.name,
        typology: body.typology,
        description: body.description,
        orthography: body.orthography,
        status: "active",
        phonology: body.phonology,
        createdBy: actor.id,
        createdAt
      };

      const assignableReviewerIds = state.users
        .filter((user) => isReviewPolicyAssignableRole(user.role))
        .map((user) => user.id);
      const assignedReviewerIds = assignableReviewerIds.slice(0, 2);
      const reviewPolicy: ReviewPolicy | undefined = assignedReviewerIds.length > 0
        ? {
            id: `review-policy-${id}`,
            languageId: id,
            assignedReviewerIds,
            approvalThreshold: Math.min(2, assignedReviewerIds.length),
            requiresAssignedReviewer: true,
            updatedAt: createdAt,
            updatedBy: "system-seed"
          }
        : undefined;

      return appendAuditEvent({
        ...state,
        languages: [...state.languages, created],
        reviewPolicies: reviewPolicy ? [...state.reviewPolicies, reviewPolicy] : state.reviewPolicies
      }, {
        actor,
        at: createdAt,
        action: "language.created",
        entityType: "language",
        entityId: id,
        languageId: id,
        summary: `Created language ${body.name}.`,
        metadata: {
          typology: body.typology,
          hasPhonology: Boolean(body.phonology)
        }
      });
    });

    if (!created) {
      reply.code(500);
      return { error: "Language could not be created" };
    }

    reply.code(201);
    return created;
  });

  app.patch("/languages/:languageId", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseLanguagePatchBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid language patch body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let updated: Language | undefined;
    let languageMissing = false;

    await updateState((state) => {
      const existing = state.languages.find((language) => language.id === languageId);
      if (!existing) {
        languageMissing = true;
        return state;
      }

      updated = {
        ...existing,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.orthography !== undefined ? { orthography: body.orthography } : {}),
        ...(body.typology !== undefined ? { typology: body.typology } : {}),
        ...("phonology" in body ? { phonology: body.phonology } : {})
      };

      return appendAuditEvent({
        ...state,
        languages: state.languages.map((language) => (language.id === languageId ? updated as Language : language))
      }, {
        actor,
        at: new Date().toISOString(),
        action: "language.updated",
        entityType: "language",
        entityId: languageId,
        languageId,
        summary: `Updated language metadata for ${updated.name}.`,
        metadata: { fields: Object.keys(body) }
      });
    });

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    if (!updated) {
      reply.code(500);
      return { error: "Language could not be updated" };
    }

    return updated;
  });

  app.delete("/languages/:languageId", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const existing = current.languages.find((language) => language.id === languageId);
    if (!existing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const deletedAt = new Date().toISOString();
    await updateState((state) => {
      const purged = purgeLanguageFromState(state, languageId);
      return appendAuditEvent(purged, {
        actor,
        at: deletedAt,
        action: "language.deleted",
        entityType: "language",
        entityId: languageId,
        languageId: null,
        summary: `Deleted language ${existing.name}.`,
        metadata: {
          languageName: existing.name,
          typology: existing.typology
        }
      });
    });

    await deleteLanguageAssetDirectory(dataDir, languageId).catch(() => undefined);

    return {
      id: languageId,
      name: existing.name,
      deleted: true
    };
  });

  app.get("/languages/:languageId/lexicon", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.lexemes.filter((lexeme) => lexeme.languageId === languageId);
  });

  app.get("/languages/:languageId/profile", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const profile = buildLanguageProfile(state, languageId);
    if (!profile) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return profile;
  });
}
