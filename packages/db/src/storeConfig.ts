export type StoreBackend = "json" | "sqlite";

export interface JsonStoreOptions {
  /**
   * Explicit storage backend. When provided it wins over the path extension;
   * when omitted the backend is inferred from the path (`.json` -> JSON file,
   * anything else -> SQLite).
   */
  backend?: StoreBackend;
}

function inferBackend(dbPath: string): StoreBackend {
  return dbPath.endsWith(".json") ? "json" : "sqlite";
}

export function resolveStoreBackend(dbPath: string, options?: JsonStoreOptions): StoreBackend {
  const backend = options?.backend;
  if (backend === undefined) {
    return inferBackend(dbPath);
  }
  if (backend !== "json" && backend !== "sqlite") {
    throw new Error(`Invalid store backend "${String(backend)}": expected "json" or "sqlite".`);
  }
  return backend;
}
