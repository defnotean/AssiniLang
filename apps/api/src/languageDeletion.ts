import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { AppState } from "@assini/db";

function hasLanguageId<T extends { languageId: string }>(item: T, languageId: string): boolean {
  return item.languageId === languageId;
}

/** Removes a language and all workspace records scoped to it. */
export function purgeLanguageFromState(state: AppState, languageId: string): AppState {
  const keep = <T extends { languageId: string }>(items: T[]) =>
    items.filter((item) => !hasLanguageId(item, languageId));

  return {
    ...state,
    languages: state.languages.filter((language) => language.id !== languageId),
    corpus: keep(state.corpus),
    corpusAnswerKeys: keep(state.corpusAnswerKeys ?? []),
    noteAnswerKeys: keep(state.noteAnswerKeys),
    notes: keep(state.notes),
    exercises: keep(state.exercises),
    exerciseSubmissions: keep(state.exerciseSubmissions),
    evaluationRuns: keep(state.evaluationRuns),
    governance: keep(state.governance),
    aiSessions: keep(state.aiSessions),
    elderCorrections: keep(state.elderCorrections),
    reviewPolicies: keep(state.reviewPolicies),
    reviewApprovals: keep(state.reviewApprovals),
    reviewDispositions: keep(state.reviewDispositions),
    lexemes: keep(state.lexemes),
    sourceAssets: keep(state.sourceAssets),
    extractionDrafts: keep(state.extractionDrafts),
    auditEvents: state.auditEvents.filter((event) => event.languageId !== languageId)
  };
}

/** Best-effort removal of uploaded assets for a deleted language. */
export async function deleteLanguageAssetDirectory(dataDir: string, languageId: string): Promise<void> {
  await rm(resolve(dataDir, "assets", languageId), { recursive: true, force: true });
}
