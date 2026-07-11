import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, JsonStore, TEST_LANGUAGE_ID } from "@assini/db";
import { resolveRuntimeDbPath } from "./runtimePath.js";
import { createServer } from "./server.js";

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

describe("server system integration", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  it("resolves the runtime database path from the repository root with an env override", () => {
    const indexUrl = pathToFileURL(join(repoRoot, "apps", "api", "src", "index.ts")).href;
    const overridePath = join(repoRoot, "tmp", "override-db.json");

    expect(resolveRuntimeDbPath({ env: {}, moduleUrl: indexUrl })).toBe(join(repoRoot, "data", "local-db.json"));
    expect(resolveRuntimeDbPath({ env: { ASSINI_DB_PATH: overridePath }, moduleUrl: indexUrl })).toBe(overridePath);
  });

  it("returns health, notes, and exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const llmStatus = await app.inject({ method: "GET", url: "/llm/status", headers: authHeaders("programmer-1") });
    expect(llmStatus.statusCode).toBe(200);
    expect(llmStatus.json()).toMatchObject({ configured: true, apiKey: { configured: false } });
    expect(llmStatus.json().apiKey).not.toHaveProperty("value");
    expect(llmStatus.json().apiKey).not.toHaveProperty("redactedValue");

    const llmStatusUnauthorized = await app.inject({ method: "GET", url: "/llm/status" });
    expect(llmStatusUnauthorized.statusCode).toBe(401);

    const notes = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    expect(notes.statusCode).toBe(200);
    expect(notes.json()[0].languageId).toBe(TEST_LANGUAGE_ID);
    expect(JSON.stringify(notes.json())).not.toContain("answer key");
    expect(JSON.stringify(notes.json())).not.toContain("test-generator");

    const exercises = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()[0].languageId).toBe(TEST_LANGUAGE_ID);
    expect(exercises.json()[0]).not.toHaveProperty("expectedAnswers");
    expect(exercises.json()[0]).not.toHaveProperty("gradingExplanation");
    expect(exercises.json()[0]).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(exercises.json())).not.toContain("first-person singular subjects");
  });

  it("correlates responses with a safe x-request-id", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const suppliedRequestId = "client.abc-123:xyz_01";

    const supplied = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": suppliedRequestId }
    });
    expect(supplied.statusCode).toBe(200);
    expect(supplied.headers["x-request-id"]).toBe(suppliedRequestId);

    const generated = await app.inject({ method: "GET", url: "/health" });
    const generatedRequestId = generated.headers["x-request-id"];
    expect(generatedRequestId).toEqual(expect.any(String));
    if (typeof generatedRequestId !== "string") throw new Error("Expected generated x-request-id header");
    expect(generatedRequestId).toMatch(SAFE_REQUEST_ID);
  });

  it("replaces unsafe x-request-id values and includes the safe id in central error payloads", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState(), bodyLimitBytes: 8 });
    const unsafeRequestId = "bad request/id";

    const response = await app.inject({
      method: "POST",
      url: "/languages",
      headers: {
        "content-type": "application/json",
        "x-request-id": unsafeRequestId
      },
      payload: JSON.stringify({ oversized: "payload" })
    });

    expect(response.statusCode).toBe(413);
    const responseRequestId = response.headers["x-request-id"];
    expect(responseRequestId).toEqual(expect.any(String));
    if (typeof responseRequestId !== "string") throw new Error("Expected safe x-request-id header");
    expect(responseRequestId).toMatch(SAFE_REQUEST_ID);
    expect(responseRequestId).not.toBe(unsafeRequestId);
    expect(response.json()).toEqual({
      error: "Payload too large",
      i18nKey: "errors.payloadTooLarge",
      requestId: responseRequestId
    });
  });

  it("keeps unhandled 500 responses free of secret-bearing exception text", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    app.get("/__test/secret-throw", async () => {
      throw new Error("Unhandled failure with Bearer sk-handler-secret");
    });

    const response = await app.inject({ method: "GET", url: "/__test/secret-throw" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: "Internal Server Error"
    });
    expect(JSON.stringify(response.json())).not.toContain("sk-handler-secret");
  });

  it("reports readiness when persisted state can be read", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(ready.headers.pragma).toBe("no-cache");
    expect(ready.json()).toEqual({
      ok: true,
      checks: {
        storage: {
          ok: true,
          schemaVersion: 9
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
  });

  it("keeps /health live and uncached even when /ready storage fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-ready-"));
    const dbPath = join(dir, "local-db.json");
    await writeFile(dbPath, "{ not valid json with C:/secret/local-db.json", "utf8");
    const app = createServer({ store: new JsonStore(dbPath) });

    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(health.statusCode).toBe(200);
    expect(health.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(health.headers.pragma).toBe("no-cache");
    expect(health.json()).toEqual({ ok: true });

    expect(ready.statusCode).toBe(503);
    expect(ready.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(ready.headers.pragma).toBe("no-cache");
    expect(ready.json()).toEqual({
      ok: false,
      checks: {
        storage: {
          ok: false,
          error: "Storage read failed"
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
        },
        recovery: {
          ok: false,
          status: "failed",
          error: "Startup recovery failed"
        }
      }
    });
    expect(JSON.stringify(ready.json())).not.toContain(dbPath);
    expect(JSON.stringify(ready.json())).not.toContain("C:/secret/local-db.json");
    expect(JSON.stringify(ready.json())).not.toContain("not valid json");
  });

  it("reports sanitized readiness failure when persisted state cannot be read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-ready-"));
    const dbPath = join(dir, "local-db.json");
    await writeFile(dbPath, "{ not valid json", "utf8");
    const app = createServer({ store: new JsonStore(dbPath) });

    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      ok: false,
      checks: {
        storage: {
          ok: false,
          error: "Storage read failed"
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
        },
        recovery: {
          ok: false,
          status: "failed",
          error: "Startup recovery failed"
        }
      }
    });
    expect(JSON.stringify(ready.json())).not.toContain(dbPath);
  });

  it("reports sanitized readiness failure when job queue status cannot be inspected", async () => {
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      jobQueue: {
        getStatus: () => {
          throw new Error("Cannot inspect source-secret-123 at C:/secret/queue.json");
        },
        getPendingAndActiveIds: () => ({ pending: ["source-secret-123"], active: [] }),
        add() {},
        isQueuedOrActive: () => false
      } as never
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      ok: false,
      checks: {
        storage: {
          ok: true,
          schemaVersion: 9
        },
        jobQueue: {
          ok: false,
          error: "Job queue status unavailable"
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
    expect(JSON.stringify(ready.json())).not.toContain("source-secret-123");
    expect(JSON.stringify(ready.json())).not.toContain("C:/secret/queue.json");
  });
});
