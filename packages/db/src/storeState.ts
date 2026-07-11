import { CURRENT_SCHEMA_VERSION, type AppState } from "./schema.js";

export function createEmptyState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    languages: [],
    corpus: [],
    noteAnswerKeys: [],
    notes: [],
    exercises: [],
    exerciseSubmissions: [],
    evaluationRuns: [],
    governance: [],
    users: [],
    aiSessions: [],
    elderCorrections: [],
    auditEvents: [],
    reviewPolicies: [],
    reviewApprovals: [],
    reviewDispositions: [],
    lexemes: [],
    sourceAssets: [],
    extractionDrafts: []
  };
}
