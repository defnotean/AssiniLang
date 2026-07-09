import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { CorpusPassage, Note } from "@assini/db";
import { draftNotesForLanguage, scoreModelDraft } from "@assini/eval";
import { generateModelDraftNotes, ModelRequiredError, type GeneratedNoteDraft } from "../generation.js";
import { toPublicNotes } from "../publicLanguageViews.js";
import {
  appendAuditEvents,
  MODEL_REQUIRED_MESSAGE,
  redactErrorSecrets,
  requireActor
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

const STUDY_LOOP_DRAFT_AUTHOR = "deterministic-study-loop";
const STUDY_LOOP_DRAFT_ACTION = "drafted";

type StudyLoopDraftBody = {
  languageId: string;
};

function parseStudyLoopDraftBody(input: unknown): StudyLoopDraftBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.languageId !== "string") {
    return undefined;
  }

  const languageId = body.languageId.trim();
  return languageId.length > 0 ? { languageId } : undefined;
}

function isReplaceableGeneratedDraft(note: Note): boolean {
  const hasStudyLoopDraftMarker = note.editHistory.some(
    (entry) => entry.by === STUDY_LOOP_DRAFT_AUTHOR && entry.action === STUDY_LOOP_DRAFT_ACTION
  );

  return note.status === "draft"
    && note.reviewer.lastReviewedBy === null
    && note.reviewer.lastReviewedAt === null
    && hasStudyLoopDraftMarker;
}

function mergeGeneratedDraftNotes(existingNotes: Note[], languageId: string, generatedDrafts: Note[]): Note[] {
  const generatedById = new Map(generatedDrafts.map((note) => [note.id, note]));
  const mergedDraftIds = new Set<string>();

  const mergedNotes = existingNotes.map((note) => {
    if (note.languageId !== languageId) return note;

    const generated = generatedById.get(note.id);
    if (!generated) return note;

    mergedDraftIds.add(note.id);
    return isReplaceableGeneratedDraft(note) ? generated : note;
  });

  const missingDrafts = generatedDrafts.filter((note) => !mergedDraftIds.has(note.id));
  return [...mergedNotes, ...missingDrafts];
}

export function registerStudyLoopRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions, llmProvider } = ctx;

  app.post("/study-loop/draft", async (request, reply) => {
    const body = parseStudyLoopDraftBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Missing languageId",
        i18nKey: "errors.missingLanguageId"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "elder"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    let nextNotes: Note[] = [];
    let languageMissing = false;
    await updateState((state) => {
      if (!state.languages.some((language) => language.id === body.languageId)) {
        languageMissing = true;
        return state;
      }

      const drawn = draftNotesForLanguage(body.languageId, state);
      const notes = mergeGeneratedDraftNotes(state.notes, body.languageId, drawn);
      const drawnIds = new Set(drawn.map((note) => note.id));
      nextNotes = notes.filter((note) => note.languageId === body.languageId && drawnIds.has(note.id));

      return appendAuditEvents({
        ...state,
        notes
      }, nextNotes.map((note) => ({
        actor,
        action: "note.draft_generated",
        entityType: "note",
        entityId: note.id,
        languageId: note.languageId,
        summary: `Generated deterministic draft note for ${note.topic}.`,
        metadata: {
          topic: note.topic,
          status: note.status
        }
      })));
    });

    if (languageMissing) {
      reply.code(404);
      return {
        error: `Language not found: ${body.languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    return toPublicNotes(nextNotes);
  });

  app.post("/languages/:languageId/study-loop/model-draft", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "elder"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const language = current.languages.find((item) => item.id === languageId);
    if (!language) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    const corpus = current.corpus.filter((passage) => passage.languageId === languageId);
    const lexemes = current.lexemes.filter((lexeme) => lexeme.languageId === languageId);
    const existingNotes = current.notes.filter((note) => note.languageId === languageId);

    let generation: { notes: GeneratedNoteDraft[]; warnings: string[] };
    try {
      generation = await generateModelDraftNotes({ language, corpus, lexemes, existingNotes, provider: llmProvider });
    } catch (error) {
      if (error instanceof ModelRequiredError) {
        reply.code(400);
        return { error: MODEL_REQUIRED_MESSAGE };
      }
      reply.code(422);
      return { error: redactErrorSecrets(error instanceof Error ? error.message : "Draft note generation failed.") };
    }

    const passagesById = new Map(corpus.map((passage) => [passage.id, passage]));
    const generatedAt = new Date().toISOString();
    const createdNotes: Note[] = generation.notes.map((draft, index) => ({
      id: `model-draft-${languageId}-${index + 1}-${randomUUID()}`,
      languageId,
      topic: draft.topic,
      explanation: draft.explanation,
      examples: draft.evidencePassageIds
        .map((passageId: string) => passagesById.get(passageId))
        .filter((passage: CorpusPassage | undefined): passage is CorpusPassage => passage !== undefined)
        .map((passage: CorpusPassage) => ({
          passageId: passage.id,
          target: passage.textTarget,
          translation: passage.textTranslation
        })),
      evidencePassageIds: [...draft.evidencePassageIds],
      evidenceCount: draft.evidencePassageIds.length,
      confidence: draft.confidence,
      status: "draft",
      reviewer: {
        lastReviewedBy: null,
        lastReviewedAt: null,
        comments: ["Model-backed draft generated from approved corpus and lexicon."]
      },
      dialectScope: "general",
      editHistory: [
        {
          at: generatedAt,
          by: STUDY_LOOP_DRAFT_AUTHOR,
          action: STUDY_LOOP_DRAFT_ACTION,
          summary: `Generated model-backed draft note for ${draft.topic}.`
        }
      ]
    }));

    // Grounding scores are response-only on notes; failure codes persist on audit events.
    const scoringContext = {
      languageId,
      passages: corpus,
      lexemes,
      noteAnswerKeys: current.noteAnswerKeys.filter((note) => note.languageId === languageId)
    };
    const scoredNotes = createdNotes.map((note) => ({
      ...note,
      grounding: scoreModelDraft(note, scoringContext)
    }));

    if (scoredNotes.length > 0) {
      await updateState((state) => appendAuditEvents({
        ...state,
        notes: [...state.notes, ...createdNotes]
      }, scoredNotes.map((note) => ({
        actor,
        at: generatedAt,
        action: "note.draft_generated",
        entityType: "note",
        entityId: note.id,
        languageId: note.languageId,
        summary: `Generated model-backed draft note for ${note.topic}.`,
        metadata: {
          topic: note.topic,
          status: note.status,
          confidence: note.confidence,
          groundingScore: note.grounding.score,
          groundingFailureCodes: note.grounding.failureCodes
        }
      }))));
    }

    return { notes: scoredNotes, warnings: generation.warnings, generated: createdNotes.length };
  });
}
