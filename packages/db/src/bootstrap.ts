import { appStateSchema, LOCAL_PROTOTYPE_USERS, type AppState } from "./schema.js";
import { createEmptyState } from "./store.js";

/**
 * Builds the initial local workspace state: no languages, no corpus,
 * just the local prototype user identities required by auth, review
 * policies, and audit attribution. Languages and their content are
 * created by users through the API/web console and the ingestion
 * pipeline instead of hardcoded fixtures.
 */
export function createBootstrapState(): AppState {
  const state = createEmptyState();
  state.users.push(...LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user })));
  return appStateSchema.parse(state);
}
