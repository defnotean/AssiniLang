import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  buildTestWorkspaceState,
  createEmptyState,
  JsonStore,
  TEST_LANGUAGE_ID,
  type AppState,
  type EvaluationRun,
  type Note
} from "@assini/db";
import { draftNotesForLanguage } from "@assini/eval";
import { resolveRuntimeDbPath } from "./runtimePath.js";
import { createServer } from "./server.js";
import type { LlmProvider } from "./llmProvider.js";

const SHA_256_HEX = /^[a-f0-9]{64}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXPORT_REDACTION_POLICY = [
  "answer-keys-omitted",
  "adversarial-exercise-probes-omitted",
  "learner-submissions-omitted",
  "learner-answers-omitted",
  "ai-sessions-omitted",
  "local-users-omitted"
];

describe("api server", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const reviewedNoteId = "testlang-note-basic-order";
  const submissionExerciseId = "testlang-ex-002";
  const existingRun: EvaluationRun = {
    id: "existing-run",
    languageId: "archived-language",
    createdAt: "2026-06-03T00:00:00.000Z",
    systemVersion: "test-system",
    fixtureVersion: "test-fixture",
    scores: { retained: 1 },
    failures: [],
    summary: "Existing evaluation run."
  };

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  async function fetchReviewedNote(app: ReturnType<typeof createServer>) {
    const notes = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    return notes.json().find((item: { id: string }) => item.id === reviewedNoteId);
  }

  function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
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
    expect(response.json()).toEqual({ error: "Payload too large", requestId: responseRequestId });
  });

  it("reports readiness when persisted state can be read", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({
      ok: true,
      checks: {
        storage: {
          ok: true,
          schemaVersion: 8
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
        }
      }
    });
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
        }
      }
    });
    expect(JSON.stringify(ready.json())).not.toContain(dbPath);
  });

  describe("POST /llm/health-check", () => {
    it("returns a deterministic not-checked result when no provider is configured", async () => {
      const previous = {
        provider: process.env.ASSINI_LLM_PROVIDER,
        baseUrl: process.env.ASSINI_LLM_BASE_URL,
        model: process.env.ASSINI_LLM_MODEL,
        apiKey: process.env.ASSINI_LLM_API_KEY,
        openAiKey: process.env.OPENAI_API_KEY
      };
      delete process.env.ASSINI_LLM_PROVIDER;
      delete process.env.ASSINI_LLM_BASE_URL;
      delete process.env.ASSINI_LLM_MODEL;
      delete process.env.ASSINI_LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      let fetchCalls = 0;
      const fetchStub: typeof fetch = async () => {
        fetchCalls += 1;
        return new Response("{}", { status: 200 });
      };

      try {
        const app = createServer({ initialState: buildTestWorkspaceState(), ingestionFetch: fetchStub });
        const response = await app.inject({
          method: "POST",
          url: "/llm/health-check",
          headers: authHeaders("programmer-1")
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ checked: false, reachable: false, mode: "deterministic" });
        expect(fetchCalls).toBe(0);
      } finally {
        restoreEnv("ASSINI_LLM_PROVIDER", previous.provider);
        restoreEnv("ASSINI_LLM_BASE_URL", previous.baseUrl);
        restoreEnv("ASSINI_LLM_MODEL", previous.model);
        restoreEnv("ASSINI_LLM_API_KEY", previous.apiKey);
        restoreEnv("OPENAI_API_KEY", previous.openAiKey);
      }
    });

    it("shells out to the injected fetch and maps a reachable provider", async () => {
      const previous = {
        provider: process.env.ASSINI_LLM_PROVIDER,
        baseUrl: process.env.ASSINI_LLM_BASE_URL,
        model: process.env.ASSINI_LLM_MODEL,
        allowPrivate: process.env.ASSINI_ALLOW_PRIVATE_URLS
      };
      process.env.ASSINI_LLM_PROVIDER = "openai-compatible";
      process.env.ASSINI_LLM_BASE_URL = "http://127.0.0.1:11434/v1";
      process.env.ASSINI_LLM_MODEL = "test-model";
      process.env.ASSINI_ALLOW_PRIVATE_URLS = "1";

      let fetchCalls = 0;
      const fetchStub: typeof fetch = async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };

      try {
        const app = createServer({ initialState: buildTestWorkspaceState(), ingestionFetch: fetchStub });
        const response = await app.inject({
          method: "POST",
          url: "/llm/health-check",
          headers: authHeaders("programmer-1")
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          checked: true,
          reachable: true,
          mode: "local-openai-compatible",
          status: 200
        });
        expect(fetchCalls).toBeGreaterThanOrEqual(1);
      } finally {
        restoreEnv("ASSINI_LLM_PROVIDER", previous.provider);
        restoreEnv("ASSINI_LLM_BASE_URL", previous.baseUrl);
        restoreEnv("ASSINI_LLM_MODEL", previous.model);
        restoreEnv("ASSINI_ALLOW_PRIVATE_URLS", previous.allowPrivate);
      }
    });

    it("forbids roles outside the diagnostic allow-list, like sibling observability routes", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });

      const forbidden = await app.inject({
        method: "POST",
        url: "/llm/health-check",
        headers: authHeaders("learner-1")
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ error: "Forbidden" });

      const unauthorized = await app.inject({ method: "POST", url: "/llm/health-check" });
      expect(unauthorized.statusCode).toBe(401);
    });
  });

  describe("GET/PUT /llm/settings", () => {
    it("discovers exposed model endpoints for programmer actors", async () => {
      const previousAllowPrivate = process.env.ASSINI_ALLOW_PRIVATE_URLS;
      process.env.ASSINI_ALLOW_PRIVATE_URLS = "1";
      const fetchStub: typeof fetch = async (input) => {
        if (input.toString() === "http://irene-box:8080/v1/models") {
          return new Response(JSON.stringify({
            data: [{ id: "irene-fusion" }]
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response("not found", { status: 404 });
      };

      try {
        const app = createServer({
          initialState: buildTestWorkspaceState(),
          ingestionFetch: fetchStub
        });

        const response = await app.inject({
          method: "GET",
          url: "/llm/models?baseUrl=http%3A%2F%2Firene-box%3A8080",
          headers: authHeaders("programmer-1")
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
        expect(response.json().models).toEqual(expect.arrayContaining([
          expect.objectContaining({
            provider: "openai-compatible",
            baseUrl: "http://irene-box:8080/v1",
            model: "irene-fusion"
          })
        ]));
      } finally {
        restoreEnv("ASSINI_ALLOW_PRIVATE_URLS", previousAllowPrivate);
      }
    });

    it("persists sanitized model settings and hot-swaps the active provider", async () => {
      const previous = {
        provider: process.env.ASSINI_LLM_PROVIDER,
        baseUrl: process.env.ASSINI_LLM_BASE_URL,
        model: process.env.ASSINI_LLM_MODEL,
        apiKey: process.env.ASSINI_LLM_API_KEY,
        timeout: process.env.ASSINI_LLM_TIMEOUT_MS,
        maxTokens: process.env.ASSINI_LLM_MAX_TOKENS,
        jsonMode: process.env.ASSINI_LLM_JSON_MODE,
        allowPrivate: process.env.ASSINI_ALLOW_PRIVATE_URLS
      };
      delete process.env.ASSINI_LLM_PROVIDER;
      delete process.env.ASSINI_LLM_BASE_URL;
      delete process.env.ASSINI_LLM_MODEL;
      delete process.env.ASSINI_LLM_API_KEY;
      delete process.env.ASSINI_LLM_TIMEOUT_MS;
      delete process.env.ASSINI_LLM_MAX_TOKENS;
      delete process.env.ASSINI_LLM_JSON_MODE;
      process.env.ASSINI_ALLOW_PRIVATE_URLS = "1";

      const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
      const settingsPath = join(dir, ".env");
      const completionBodies: Array<Record<string, unknown>> = [];
      const fetchStub: typeof fetch = async (_input, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
        completionBodies.push(body);
        return new Response(JSON.stringify({
          choices: [{ message: { content: "Irene is connected." } }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };

      try {
        const app = createServer({
          initialState: buildTestWorkspaceState(),
          ingestionFetch: fetchStub,
          settingsPath
        });

        const save = await app.inject({
          method: "PUT",
          url: "/llm/settings",
          headers: authHeaders("programmer-1"),
          payload: {
            provider: "openai-compatible",
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "irene-fusion",
            apiKey: "plain-provider-secret",
            timeoutMs: 180000,
            maxTokens: 8192,
            jsonMode: true
          }
        });

        expect(save.statusCode).toBe(200);
        expect(save.json()).toMatchObject({
          settings: {
            provider: "openai-compatible",
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "irene-fusion",
            apiKeyConfigured: true,
            timeoutMs: 180000,
            maxTokens: 8192,
            jsonMode: true
          },
          status: {
            configured: true,
            mode: "local-openai-compatible",
            model: "irene-fusion"
          },
          persisted: true
        });
        expect(JSON.stringify(save.json())).not.toContain("plain-provider-secret");
        expect(await readFile(settingsPath, "utf8")).toContain("ASSINI_LLM_API_KEY=plain-provider-secret");

        const settings = await app.inject({
          method: "GET",
          url: "/llm/settings",
          headers: authHeaders("programmer-1")
        });
        expect(settings.statusCode).toBe(200);
        expect(settings.json().settings.apiKeyConfigured).toBe(true);
        expect(JSON.stringify(settings.json())).not.toContain("plain-provider-secret");

        const session = await app.inject({
          method: "POST",
          url: "/ai/sessions",
          headers: authHeaders("learner-1"),
          payload: {
            languageId: TEST_LANGUAGE_ID,
            mode: "learner_practice",
            seedPrompt: "Give me one prompt.",
            contextNoteIds: [],
            contextPassageIds: []
          }
        });

        expect(session.statusCode).toBe(201);
        expect(session.json().messages.at(-1).content).toBe("Irene is connected.");
        expect(completionBodies[0]).toMatchObject({
          model: "irene-fusion",
          max_tokens: 8192
        });
      } finally {
        restoreEnv("ASSINI_LLM_PROVIDER", previous.provider);
        restoreEnv("ASSINI_LLM_BASE_URL", previous.baseUrl);
        restoreEnv("ASSINI_LLM_MODEL", previous.model);
        restoreEnv("ASSINI_LLM_API_KEY", previous.apiKey);
        restoreEnv("ASSINI_LLM_TIMEOUT_MS", previous.timeout);
        restoreEnv("ASSINI_LLM_MAX_TOKENS", previous.maxTokens);
        restoreEnv("ASSINI_LLM_JSON_MODE", previous.jsonMode);
        restoreEnv("ASSINI_ALLOW_PRIVATE_URLS", previous.allowPrivate);
      }
    });

    it("rejects private runtime URLs with HTTP 400 when allow-private is off", async () => {
      const previousAllowPrivate = process.env.ASSINI_ALLOW_PRIVATE_URLS;
      delete process.env.ASSINI_ALLOW_PRIVATE_URLS;

      const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
      const settingsPath = join(dir, ".env");
      await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        settingsPath
      });

      try {
        const rejected = await app.inject({
          method: "PUT",
          url: "/llm/settings",
          headers: authHeaders("programmer-1"),
          payload: { ocrBaseUrl: "http://127.0.0.1:8080/v1" }
        });

        expect(rejected.statusCode).toBe(400);
        expect(rejected.json().error).toMatch(/Invalid OCR base URL:/);
        expect(await readFile(settingsPath, "utf8")).not.toContain("ASSINI_OCR_BASE_URL=");
      } finally {
        restoreEnv("ASSINI_ALLOW_PRIVATE_URLS", previousAllowPrivate);
      }
    });

    it("restricts settings updates to programmer, admin, and lead actors", async () => {
      const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        settingsPath: join(dir, ".env")
      });

      const forbidden = await app.inject({
        method: "PUT",
        url: "/llm/settings",
        headers: authHeaders("reviewer-1"),
        payload: { provider: "deterministic" }
      });

      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ error: "Forbidden" });
    });
  });

  it("returns a rich language profile without answer-key fields", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const profile = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/profile` });

    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      language: { id: TEST_LANGUAGE_ID, name: "Testlang", typology: "agglutinative" },
      stats: {
        vocabularyItems: 7,
        grammarRules: 2,
        corpusPassages: 3,
        notes: 2,
        exercises: 3,
        sourceAssets: 0,
        pendingExtractionDrafts: 0
      }
    });
    expect(profile.json().grammarRules[0]).toMatchObject({
      id: "testlang-note-basic-order",
      topic: "syntax/basic-order",
      evidencePassageIds: ["testlang-c001", "testlang-c002"]
    });
    expect(profile.json().phonology).toMatchObject({
      syllableTemplate: "CV",
      stress: "word-initial"
    });
    expect(profile.json().phonology.notes).toContain("No consonant clusters in native roots.");
    expect(profile.json().vocabulary.find((item: { form: string }) => item.form === "-na")).toMatchObject({
      gloss: "first person singular",
      partOfSpeech: "suffix"
    });
    expect(profile.json().morphemeInventory.find((item: { surface: string }) => item.surface === "saku")).toMatchObject({
      lemma: "saku",
      glosses: ["child"],
      features: ["noun"],
      occurrenceCount: 2,
      passageIds: expect.arrayContaining(["testlang-c002", "testlang-c003"]),
      vocabulary: expect.objectContaining({
        form: "saku",
        partOfSpeech: "noun"
      })
    });
    expect(profile.json().stats.exerciseTypes).toMatchObject({
      translate_to_target: 1,
      segment: 1,
      choose_particle: 1
    });
    expect(JSON.stringify(profile.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(profile.json())).not.toContain("gradingExplanation");

    const missing = await app.inject({ method: "GET", url: "/languages/not-a-language/profile" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("deletes a language and purges scoped workspace records", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/languages/${TEST_LANGUAGE_ID}`,
      headers: authHeaders("reviewer-1")
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({
      id: TEST_LANGUAGE_ID,
      name: "Testlang",
      deleted: true
    });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toEqual([]);

    const corpus = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(corpus.statusCode).toBe(404);

    const audit = await app.inject({
      method: "GET",
      url: "/audit/events",
      headers: authHeaders("programmer-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().some((event: { action: string }) => event.action === "language.deleted")).toBe(true);
    expect(audit.json().every((event: { languageId: string | null }) => event.languageId !== TEST_LANGUAGE_ID)).toBe(true);
  });

  it("returns 404 when deleting a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "DELETE",
      url: "/languages/not-a-language",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("restricts browser CORS to configured local development origins", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState(), allowedOrigins: ["http://localhost:5173"] });

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://example.invalid" }
    });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps prototype session auth explicit, cookie scoped, and non-admin", async () => {
    const disabled = createServer({ initialState: buildTestWorkspaceState() });

    const disabledResponse = await disabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "elder-1" }
    });
    expect(disabledResponse.statusCode).toBe(404);
    expect(disabledResponse.json()).toEqual({ error: "Prototype auth is disabled" });

    const enabled = createServer({ initialState: buildTestWorkspaceState(), enablePrototypeAuth: true });
    const session = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "  elder-1  " }
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ id: "elder-1", role: "elder" });
    const setCookie = session.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain("assini_prototype_session=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).not.toContain("elder-1");

    const currentUser = await enabled.inject({
      method: "GET",
      url: "/users/me",
      headers: { cookie: cookieHeader?.split(";")[0] ?? "" }
    });
    expect(currentUser.statusCode).toBe(200);
    expect(currentUser.json()).toMatchObject({ id: "elder-1", role: "elder" });

    const leadSession = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "lead-1" }
    });
    expect(leadSession.statusCode).toBe(403);

    const adminSession = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "admin-1" }
    });
    expect(adminSession.statusCode).toBe(403);
  });

  it("returns languages and corpus", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(1);

    const corpus = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()[0].languageId).toBe(TEST_LANGUAGE_ID);
  });

  it("imports validated corpus passages with provenance and audit metadata", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["learning", "imported"],
        consentStatus: {
          use: "testing-only",
          restrictions: ["local prototype import"]
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      source: "local-import",
      textTarget: "saku nemi-na",
      textTranslation: "The child teaches me.",
      topicTags: ["learning", "imported"],
      consentStatus: { use: "testing-only" }
    });
    expect(response.json().id).toMatch(/^imported-corpus-testlang-/);

    const corpus = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: response.json().id,
        textTarget: "saku nemi-na"
      })
    ]));

    const persisted = await store.read();
    expect(persisted.corpusAnswerKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({
        passageId: response.json().id,
        languageId: TEST_LANGUAGE_ID,
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ]
      })
    ]));

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "corpus.imported",
        entityType: "corpus",
        entityId: response.json().id,
        metadata: expect.objectContaining({
          source: "local-import",
          morphemeCount: 3,
          tagCount: 2,
          consentUse: "testing-only"
        })
      })
    ]));
  });

  it("rejects invalid corpus segmentation imports without mutating corpus", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "ghost", lemma: "ghost", gloss: "ghost", features: ["noun"] }
        ],
        topicTags: ["learning"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus segmentation surface is not present in target text: ghost" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports when segmentation omits a target token", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] }
        ],
        topicTags: ["learning"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus segmentation does not cover target token: nemi-na" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports with morphemes outside the selected language lexicon", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "noru talo-na",
        textTranslation: "I walk near the invented token.",
        morphologicalSegmentation: [
          { surface: "noru", lemma: "noru", gloss: "invented-token", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus morpheme is not grounded in the Testlang lexicon: noru" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects corpus imports with target text outside the selected language phonology", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "mira-z talo-na",
        textTranslation: "I walk by the altered river.",
        morphologicalSegmentation: [
          { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
          { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ],
        topicTags: ["motion"],
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Corpus target text uses z outside Testlang phonology inventory: mira-z talo-na" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it.each([
    [
      "topic tags",
      {
        topicTags: ["learning", "imported", "learning"],
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ]
      },
      "Corpus topic tag is duplicated: learning"
    ],
    [
      "morpheme features",
      {
        topicTags: ["learning", "imported"],
        morphologicalSegmentation: [
          { surface: "saku", lemma: "saku", gloss: "child", features: ["noun", "noun"] },
          { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
          { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
        ]
      },
      "Corpus morpheme feature is duplicated for saku: noun"
    ]
  ])("rejects corpus imports with duplicate %s without mutating corpus", async (_, overrides, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        source: "local-import",
        sourceMetadata: {
          author: "Local Reviewer",
          year: 2026,
          license: "local-test-data",
          consentRecord: "local import consent"
        },
        textTarget: "saku nemi-na",
        textTranslation: "The child teaches me.",
        ...overrides,
        consentStatus: {
          use: "testing-only",
          restrictions: []
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  const validCorpusImportPayload = {
    source: "local-import",
    sourceMetadata: {
      author: "Local Reviewer",
      year: 2026,
      license: "local-test-data",
      consentRecord: "local import consent"
    },
    textTarget: "saku nemi-na",
    textTranslation: "The child teaches me.",
    morphologicalSegmentation: [
      { surface: "saku", lemma: "saku", gloss: "child", features: ["noun"] },
      { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["verb-root"] },
      { surface: "-na", lemma: "-na", gloss: "1sg", features: ["person"] }
    ],
    topicTags: ["learning", "imported"],
    consentStatus: {
      use: "testing-only",
      restrictions: ["local prototype import"]
    }
  };

  it("dry-runs corpus import validation without persisting", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });
    const before = await store.read();

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: validCorpusImportPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      errors: [],
      warnings: [],
      preview: validCorpusImportPayload
    });

    const after = await store.read();
    expect(after.corpus).toEqual(before.corpus);
    expect(after.auditEvents).toEqual(before.auditEvents);
  });

  it("dry-runs corpus import validation with body dryRun flag", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validCorpusImportPayload,
        dryRun: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      errors: [],
      preview: validCorpusImportPayload
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it("returns validation errors from corpus dry-run without persisting", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/corpus?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validCorpusImportPayload,
        morphologicalSegmentation: [
          { surface: "ghost", lemma: "ghost", gloss: "ghost", features: ["noun"] }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      errors: ["Corpus segmentation surface is not present in target text: ghost"],
      warnings: [],
      preview: null
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/corpus` });
    expect(after.json()).toEqual(before.json());
  });

  it.each(["corpus", "notes", "exercises"])("returns 404 for unknown language %s requests", async (resource) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({ method: "GET", url: `/languages/not-a-language/${resource}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("runs evaluations and appends them to state", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);

    const evaluations = await app.inject({ method: "GET", url: "/evaluations", headers: authHeaders("reviewer-1") });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toHaveLength(1);
  });

  it.each([
    ["elders", "elder-1", 403, "Forbidden"],
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects evaluation list and run from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const list = await app.inject({
      method: "GET",
      url: "/evaluations",
      headers: authHeaders(userId)
    });
    expect(list.statusCode).toBe(statusCode);
    expect(list.json()).toEqual({ error });

    const run = await app.inject({
      method: "POST",
      url: "/evaluations/run",
      headers: authHeaders(userId)
    });
    expect(run.statusCode).toBe(statusCode);
    expect(run.json()).toEqual({ error });
  });

  it("returns a client error for evaluations without languages and preserves prior runs", async () => {
    const initialState: AppState = {
      ...createEmptyState(),
      evaluationRuns: [existingRun]
    };
    const app = createServer({ initialState });

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "No languages available to evaluate",
      i18nKey: "errors.noLanguagesToEvaluate"
    });

    const evaluations = await app.inject({ method: "GET", url: "/evaluations", headers: authHeaders("reviewer-1") });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toEqual([existingRun]);
  });

  it("reads and writes evaluation state through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(1);

    const response = await app.inject({ method: "POST", url: "/evaluations/run", headers: authHeaders("reviewer-1") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);

    const persisted = await store.read();
    expect(persisted.evaluationRuns).toHaveLength(1);
  });

  it("lets leads create auditable governance records for an existing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        policyType: "generation",
        content: "Generated Testlang outputs must cite reviewed notes before learner use.",
        effectiveDate: "2026-06-05"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      policyType: "generation",
      content: "Generated Testlang outputs must cite reviewed notes before learner use.",
      effectiveDate: "2026-06-05",
      approvedBy: "lead-1"
    });
    expect(response.json().id).toMatch(/^governance-testlang-generation-/);

    const governance = await app.inject({ method: "GET", url: "/governance", headers: authHeaders("lead-1") });
    expect(governance.statusCode).toBe(200);
    expect(governance.json()).toEqual([response.json()]);
  });

  it.each([
    ["elders", "elder-1", 200],
    ["reviewers", "reviewer-1", 200]
  ])("lets %s list governance records", async (_, userId, statusCode) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/governance",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual([]);
  });

  it.each([
    ["programmers", "programmer-1", 403, "Forbidden"],
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects governance list reads from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/governance",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("records protected data mutations in a role-gated audit trail", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const governance = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        policyType: "generation",
        content: "Generated outputs must cite reviewed notes.",
        effectiveDate: "2026-06-06"
      }
    });
    expect(governance.statusCode).toBe(201);

    const reviewed = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "Approved for audit trail coverage."
      }
    });
    expect(reviewed.statusCode).toBe(200);

    const submission = await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });
    expect(submission.statusCode).toBe(200);

    const evaluation = await app.inject({
      method: "POST",
      url: "/evaluations/run",
      headers: authHeaders("programmer-1")
    });
    expect(evaluation.statusCode).toBe(200);

    const learnerAudit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("learner-1")
    });
    expect(learnerAudit.statusCode).toBe(403);
    expect(learnerAudit.json()).toEqual({ error: "Forbidden" });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });

    expect(audit.statusCode).toBe(200);
    const events = audit.json() as Array<{
      id: string;
      at: string;
      actorId: string;
      actorRole: string;
      action: string;
      entityType: string;
      entityId: string;
      languageId: string;
      metadata: Record<string, unknown>;
    }>;
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(events.every((event) => Date.parse(event.at) > 0)).toBe(true);
    expect(events.every((event) => event.languageId === TEST_LANGUAGE_ID)).toBe(true);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorId: "lead-1",
        actorRole: "lead",
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: governance.json().id,
        languageId: TEST_LANGUAGE_ID,
        metadata: expect.objectContaining({ policyType: "generation" })
      }),
      expect.objectContaining({
        actorId: "reviewer-1",
        actorRole: "reviewer",
        action: "note.reviewed",
        entityType: "note",
        entityId: reviewedNoteId,
        languageId: TEST_LANGUAGE_ID,
        metadata: expect.objectContaining({
          requestedStatus: "approved",
          status: "under_review",
          approvalCount: 1,
          approvalThreshold: 2
        })
      }),
      expect.objectContaining({
        actorId: "learner-1",
        actorRole: "learner",
        action: "exercise_submission.created",
        entityType: "exercise_submission",
        languageId: TEST_LANGUAGE_ID,
        metadata: expect.objectContaining({ accepted: true, exerciseId: submissionExerciseId })
      }),
      expect.objectContaining({
        actorId: "programmer-1",
        actorRole: "programmer",
        action: "evaluation_run.created",
        entityType: "evaluation_run",
        languageId: TEST_LANGUAGE_ID
      })
    ]));
    expect(JSON.stringify(events)).not.toContain("saku talo-ki");
  });

  it("enforces per-language review policy assignments and approval thresholds", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const policy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      id: "review-policy-testlang",
      languageId: TEST_LANGUAGE_ID,
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedBy: "lead-1"
    });

    const fetchedPolicy = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("reviewer-1")
    });
    expect(fetchedPolicy.statusCode).toBe(200);
    expect(fetchedPolicy.json()).toEqual(policy.json());

    const firstApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "First assigned reviewer approves."
      }
    });

    expect(firstApproval.statusCode).toBe(200);
    expect(firstApproval.json()).toMatchObject({
      id: reviewedNoteId,
      status: "under_review",
      reviewer: expect.objectContaining({ lastReviewedBy: "reviewer-1" })
    });

    const unassignedApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("lead-1"),
      payload: {
        status: "approved",
        reviewerComment: "Lead is not assigned for this note."
      }
    });
    expect(unassignedApproval.statusCode).toBe(403);
    expect(unassignedApproval.json()).toEqual({
      error: `Reviewer is not assigned to approve notes for language: ${TEST_LANGUAGE_ID}`
    });

    const finalApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: {
        status: "approved",
        reviewerComment: "Second assigned reviewer approves."
      }
    });

    expect(finalApproval.statusCode).toBe(200);
    expect(finalApproval.json()).toMatchObject({
      id: reviewedNoteId,
      status: "approved",
      reviewer: expect.objectContaining({ lastReviewedBy: "elder-1" })
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "review_policy.upserted",
        entityType: "review_policy",
        entityId: "review-policy-testlang",
        metadata: expect.objectContaining({ approvalThreshold: 2 })
      }),
      expect.objectContaining({
        action: "note.reviewed",
        entityType: "note",
        entityId: reviewedNoteId,
        metadata: expect.objectContaining({
          requestedStatus: "approved",
          status: "under_review",
          approvalCount: 1,
          approvalThreshold: 2
        })
      }),
      expect.objectContaining({
        action: "note.reviewed",
        entityType: "note",
        entityId: reviewedNoteId,
        metadata: expect.objectContaining({
          requestedStatus: "approved",
          status: "approved",
          approvalCount: 2,
          approvalThreshold: 2
        })
      })
    ]));
  });

  it("trims review policy reviewer ids and defaults assignment enforcement", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const policy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: [" reviewer-1 ", " elder-1 "],
        approvalThreshold: 2
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true
    });
  });

  it("lets prototype reviewers update review policies while preserving lead policy authority", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store, enablePrototypeAuth: true });

    const session = await app.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "reviewer-1" }
    });
    expect(session.statusCode).toBe(200);
    const setCookie = session.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    const policy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: { cookie: cookieHeader?.split(";")[0] ?? "" },
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      id: "review-policy-testlang",
      languageId: TEST_LANGUAGE_ID,
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedBy: "lead-1"
    });

    const persisted = await store.read();
    expect(persisted.reviewPolicies.find((item) => item.languageId === TEST_LANGUAGE_ID)).toMatchObject({
      updatedBy: "lead-1"
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorId: "reviewer-1",
        actorRole: "reviewer",
        action: "review_policy.upserted",
        entityType: "review_policy",
        entityId: "review-policy-testlang"
      })
    ]));
  });

  it("rejects review policies with impossible open reviewer quorum thresholds without mutation", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1")
    });

    const response = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 10,
        requiresAssignedReviewer: false
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Review policy approvalThreshold cannot exceed assignable reviewers" });

    const after = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1")
    });
    expect(after.json()).toEqual(before.json());
  });

  it("does not count stale approvals after review policy assignments change", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const originalPolicy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });
    expect(originalPolicy.statusCode).toBe(200);

    const staleApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "Approval before assignment changed."
      }
    });
    expect(staleApproval.statusCode).toBe(200);
    expect(staleApproval.json().status).toBe("under_review");

    const reassignedPolicy = await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["elder-1", "lead-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });
    expect(reassignedPolicy.statusCode).toBe(200);

    const firstCurrentApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: {
        status: "approved",
        reviewerComment: "First current assigned reviewer approves."
      }
    });
    expect(firstCurrentApproval.statusCode).toBe(200);
    expect(firstCurrentApproval.json().status).toBe("under_review");

    const finalCurrentApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("lead-1"),
      payload: {
        status: "approved",
        reviewerComment: "Second current assigned reviewer approves."
      }
    });
    expect(finalCurrentApproval.statusCode).toBe(200);
    expect(finalCurrentApproval.json().status).toBe("approved");
  });

  it("clears pending approval quorum when a note is deferred", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    await app.inject({
      method: "PUT",
      url: `/languages/${TEST_LANGUAGE_ID}/review-policy`,
      headers: authHeaders("lead-1"),
      payload: {
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      }
    });

    const firstApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "approved",
        reviewerComment: "First approval before deferral."
      }
    });
    expect(firstApproval.statusCode).toBe(200);
    expect(firstApproval.json().status).toBe("under_review");

    const deferred = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Defer until Elder confirms dialect scope."
      }
    });
    expect(deferred.statusCode).toBe(200);
    expect(deferred.json().status).toBe("deferred");

    const elderApproval = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: {
        status: "approved",
        reviewerComment: "Elder approves after deferral."
      }
    });
    expect(elderApproval.statusCode).toBe(200);
    expect(elderApproval.json().status).toBe("under_review");

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "note.reviewed",
        entityId: reviewedNoteId,
        metadata: expect.objectContaining({
          requestedStatus: "approved",
          status: "under_review",
          approvalCount: 1,
          approvalThreshold: 2
        })
      })
    ]));
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects governance writes from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders(userId),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        policyType: "access",
        content: "Only reviewers may approve lesson notes.",
        effectiveDate: "2026-06-05"
      }
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });

    const governance = await app.inject({ method: "GET", url: "/governance", headers: authHeaders("lead-1") });
    expect(governance.json()).toEqual([]);
  });

  it.each([
    ["missing content", { languageId: TEST_LANGUAGE_ID, policyType: "consent", effectiveDate: "2026-06-05" }, "Invalid governance body"],
    ["invalid policy type", { languageId: TEST_LANGUAGE_ID, policyType: "retention", content: "Policy.", effectiveDate: "2026-06-05" }, "Invalid governance body"],
    ["unparseable effective date", { languageId: TEST_LANGUAGE_ID, policyType: "consent", content: "Policy.", effectiveDate: "not-a-date" }, "Invalid governance body"],
    ["unknown language", { languageId: "not-a-language", policyType: "consent", content: "Policy.", effectiveDate: "2026-06-05" }, "Language not found: not-a-language"]
  ])("rejects %s governance writes without mutating records", async (_, payload, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/governance",
      headers: authHeaders("lead-1"),
      payload
    });

    expect(response.statusCode).toBe(error.startsWith("Language not found") ? 404 : 400);
    expect(response.json()).toEqual({ error });

    const governance = await app.inject({ method: "GET", url: "/governance", headers: authHeaders("lead-1") });
    expect(governance.json()).toEqual([]);
  });

  it("exports a role-gated sanitized language snapshot without hidden answer or learner data", async () => {
    const seeded = buildTestWorkspaceState();
    const testlangRun: EvaluationRun = {
      ...existingRun,
      id: "testlang-run",
      languageId: TEST_LANGUAGE_ID,
      summary: "Testlang snapshot evaluation."
    };
    const otherRun: EvaluationRun = {
      ...existingRun,
      id: "otherlang-run",
      languageId: "otherlang",
      summary: "Otherlang snapshot evaluation."
    };
    const initialState: AppState = {
      ...seeded,
      exerciseSubmissions: [
        ...seeded.exerciseSubmissions,
        {
          id: "private-submission",
          exerciseId: submissionExerciseId,
          languageId: TEST_LANGUAGE_ID,
          answer: "private learner answer",
          accepted: false,
          explanation: "private grading explanation",
          submittedAt: "2026-06-05T00:00:00.000Z",
          learnerId: "learner-1"
        }
      ],
      evaluationRuns: [...seeded.evaluationRuns, testlangRun, otherRun],
      governance: [
        {
          id: "gov-testlang-access",
          languageId: TEST_LANGUAGE_ID,
          policyType: "access",
          content: "Snapshot exports stay inside local review.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        },
        {
          id: "gov-otherlang-access",
          languageId: "otherlang",
          policyType: "access",
          content: "Otherlang exports require a separate review packet.",
          effectiveDate: "2026-06-05",
          approvedBy: "lead-1"
        }
      ]
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(200);
    const snapshot = response.json();
    expect(snapshot).toMatchObject({
      exportVersion: "language-snapshot-v2",
      language: { id: TEST_LANGUAGE_ID, status: "active" },
      integrity: {
        algorithm: "sha256",
        generatedBy: "assini-local-export-v1",
        redactionPolicy: EXPORT_REDACTION_POLICY
      }
    });
    expect(snapshot.integrity.contentHash).toMatch(SHA_256_HEX);
    expect(Date.parse(snapshot.exportedAt)).not.toBeNaN();
    expect(snapshot.corpus).toHaveLength(3);
    expect(snapshot.linguisticProfile).toMatchObject({
      phonology: {
        syllableTemplate: "CV",
        stress: "word-initial"
      },
      stats: {
        vocabularyItems: 7,
        grammarRules: 2,
        corpusPassages: 3,
        notes: 2,
        exercises: 3,
        sourceAssets: 0,
        pendingExtractionDrafts: 0
      }
    });
    expect(snapshot.linguisticProfile.vocabulary.find((item: { form: string }) => item.form === "-na")).toMatchObject({
      gloss: "first person singular",
      partOfSpeech: "suffix"
    });
    expect(snapshot.linguisticProfile.grammarRules[0]).toMatchObject({
      id: "testlang-note-basic-order",
      evidencePassageIds: ["testlang-c001", "testlang-c002"]
    });
    expect(snapshot.linguisticProfile.morphemeInventory.find((item: { surface: string }) => item.surface === "saku")).toMatchObject({
      lemma: "saku",
      occurrenceCount: 2,
      passageIds: expect.arrayContaining(["testlang-c002"])
    });
    expect(snapshot.corpus.every((passage: { languageId: string }) => passage.languageId === TEST_LANGUAGE_ID)).toBe(true);
    expect(snapshot.notes.every((note: { languageId: string }) => note.languageId === TEST_LANGUAGE_ID)).toBe(true);
    expect(snapshot.exercises.every((exercise: { languageId: string }) => exercise.languageId === TEST_LANGUAGE_ID)).toBe(true);
    expect(snapshot.governance).toEqual([initialState.governance[0]]);
    expect(snapshot.evaluations).toEqual([testlangRun]);
    expect(snapshot).not.toHaveProperty("exerciseSubmissions");
    expect(snapshot).not.toHaveProperty("noteAnswerKeys");
    expect(snapshot).not.toHaveProperty("corpusAnswerKeys");
    expect(snapshot).not.toHaveProperty("aiSessions");
    expect(snapshot).not.toHaveProperty("users");
    expect(snapshot.exercises[0]).not.toHaveProperty("expectedAnswers");
    expect(snapshot.exercises[0]).not.toHaveProperty("gradingExplanation");
    expect(snapshot.exercises[0]).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(snapshot)).not.toContain("private learner answer");
    expect(JSON.stringify(snapshot)).not.toContain("private grading explanation");
    expect(JSON.stringify(snapshot)).not.toContain("test-generator");
    expect(JSON.stringify(snapshot)).not.toContain("answer key");
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    ["programmers", "programmer-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects language snapshot exports from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("exports a role-gated sanitized evaluation artifact", async () => {
    const seeded = buildTestWorkspaceState();
    const latestRun: EvaluationRun = {
      id: "eval-testlang-latest",
      languageId: TEST_LANGUAGE_ID,
      createdAt: "2026-06-06T00:00:00.000Z",
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "workspace-corpus-v1",
      scores: { noteAccuracy: 1, corpusCoverage: 0.75 },
      failures: [
        {
          category: "corpusCoverage",
          languageId: TEST_LANGUAGE_ID,
          itemId: "testlang-c999",
          message: "Missing passage coverage."
        }
      ],
      summary: "Testlang: 87.5% average score across 2 categories."
    };
    const initialState: AppState = {
      ...seeded,
      evaluationRuns: [existingRun, latestRun],
      exerciseSubmissions: [
        {
          id: "private-submission",
          exerciseId: submissionExerciseId,
          languageId: TEST_LANGUAGE_ID,
          answer: "private learner answer",
          accepted: false,
          explanation: "private grading explanation",
          submittedAt: "2026-06-05T00:00:00.000Z",
          learnerId: "learner-1"
        }
      ]
    };
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exportVersion: "evaluation-artifact-v2",
      summary: {
        languages: 1,
        totalRuns: 2,
        latestRuns: 2,
        failedLatestRuns: 1,
        regressedLatestRuns: 0,
        improvedLatestRuns: 0,
        stableLatestRuns: 0,
        singleRunLanguages: 2,
        passed: false,
        failureCount: 2
      },
      latestRuns: [
        expect.objectContaining({ id: "existing-run" }),
        expect.objectContaining({ id: "eval-testlang-latest" })
      ],
      failureLines: [
        "Testlang corpusCoverage testlang-c999: Missing passage coverage.",
        "Testlang corpusCoverage threshold: score 75.0% is below required 96.0%."
      ],
      integrity: {
        algorithm: "sha256",
        generatedBy: "assini-local-export-v1",
        redactionPolicy: EXPORT_REDACTION_POLICY
      },
      trends: [
        expect.objectContaining({
          languageId: "archived-language",
          latestRunId: "existing-run",
          previousRunId: null,
          status: "single-run"
        }),
        expect.objectContaining({
          languageId: TEST_LANGUAGE_ID,
          latestRunId: "eval-testlang-latest",
          previousRunId: null,
          status: "single-run",
          categoryDeltas: {
            corpusCoverage: { latestScore: 0.75, previousScore: null, delta: null },
            noteAccuracy: { latestScore: 1, previousScore: null, delta: null }
          }
        })
      ]
    });
    expect(response.json().integrity.contentHash).toMatch(SHA_256_HEX);
    expect(Date.parse(response.json().exportedAt)).not.toBeNaN();
    expect(JSON.stringify(response.json())).not.toContain("private learner answer");
    expect(JSON.stringify(response.json())).not.toContain("private grading explanation");
    expect(JSON.stringify(response.json())).not.toContain("answer key");
    expect(response.json()).not.toHaveProperty("exerciseSubmissions");
    expect(response.json()).not.toHaveProperty("noteAnswerKeys");
    expect(response.json()).not.toHaveProperty("users");
    expect(response.json()).not.toHaveProperty("aiSessions");
  });

  it.each([
    ["learners", "learner-1", 403, "Forbidden"],
    // Elders may export language snapshots but not the evaluation artifact matrix.
    ["elders", "elder-1", 403, "Forbidden"],
    ["unknown users", "missing-user", 401, "Unauthorized"]
  ])("rejects evaluation artifact exports from %s", async (_, userId, statusCode, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders(userId)
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error });
  });

  it("allows elders to export a language snapshot while blocking evaluation artifacts", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const snapshot = await app.inject({
      method: "GET",
      url: `/exports/languages/${TEST_LANGUAGE_ID}/snapshot`,
      headers: authHeaders("elder-1")
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({ language: { id: TEST_LANGUAGE_ID } });

    const artifact = await app.inject({
      method: "GET",
      url: "/exports/evaluations/artifact",
      headers: authHeaders("elder-1")
    });
    expect(artifact.statusCode).toBe(403);
    expect(artifact.json()).toEqual({ error: "Forbidden" });
  });

  it("returns a not-found error for unknown language snapshot exports", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exports/languages/not-a-language/snapshot",
      headers: authHeaders("lead-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("authors validated exercises without exposing answer keys", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      type: "translate_to_target",
      prompt: "Translate into Testlang: The child walks.",
      allowedVocabulary: ["saku", "talo", "-ki"],
      allowedRuleIds: ["testlang-note-basic-order"]
    });
    expect(response.json().id).toMatch(/^authored-exercise-testlang-/);
    expect(response.json()).not.toHaveProperty("expectedAnswers");
    expect(response.json()).not.toHaveProperty("gradingExplanation");
    expect(response.json()).not.toHaveProperty("adversarialAnswers");
    expect(JSON.stringify(response.json())).not.toContain("Use saku for child");

    const exercises = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: response.json().id,
        prompt: "Translate into Testlang: The child walks."
      })
    ]));
    expect(JSON.stringify(exercises.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(exercises.json())).not.toContain("Use saku for child");

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "exercise.created",
        entityType: "exercise",
        entityId: response.json().id,
        metadata: expect.objectContaining({
          exerciseType: "translate_to_target",
          expectedAnswerCount: 1,
          adversarialAnswerCount: 2
        })
      })
    ]));
  });

  const validExerciseAuthoringPayload = {
    type: "translate_to_target",
    prompt: "Translate into Testlang: The child walks.",
    allowedVocabulary: ["saku", "talo", "-ki"],
    allowedRuleIds: ["testlang-note-basic-order"],
    expectedAnswers: ["saku talo-ki"],
    adversarialAnswers: [
      { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
      { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
    ],
    gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
  };

  it("dry-runs exercise authoring validation without persisting", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });
    const before = await store.read();

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: validExerciseAuthoringPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      errors: [],
      warnings: [],
      preview: validExerciseAuthoringPayload
    });

    const after = await store.read();
    expect(after.exercises).toEqual(before.exercises);
    expect(after.auditEvents).toEqual(before.auditEvents);
  });

  it("dry-runs exercise authoring validation with body dryRun flag", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validExerciseAuthoringPayload,
        dryRun: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      errors: [],
      preview: validExerciseAuthoringPayload
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("returns validation errors from exercise dry-run without persisting", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises?dryRun=1`,
      headers: authHeaders("reviewer-1"),
      payload: {
        ...validExerciseAuthoringPayload,
        allowedRuleIds: ["missing-rule"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      errors: ["Exercise references unknown rule: missing-rule"],
      warnings: [],
      preview: null
    });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects invalid exercise authoring references without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["missing-rule"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Exercise references unknown rule: missing-rule" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects exercise authoring with fewer than two adversarial probes without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Exercise authoring requires at least two adversarial probes." });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it.each([
    [
      "allowed vocabulary",
      {
        allowedVocabulary: ["saku", "talo", "saku", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"]
      },
      "Exercise allowed vocabulary is duplicated: saku"
    ],
    [
      "allowed rule IDs",
      {
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order", "testlang-note-basic-order"]
      },
      "Exercise allowed rule is duplicated: testlang-note-basic-order"
    ]
  ])("rejects duplicate exercise authoring %s without mutating exercises", async (_, overrides, error) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        ...overrides,
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects duplicate expected exercise answers without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki", "  saku   talo-ki  "],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Exercise expected answer is duplicated: saku talo-ki" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("rejects duplicate adversarial exercise probes without mutating exercises", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "  talo   saku-ki  ", reason: "Repeats the same word order probe with extra whitespace." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Exercise adversarial answer is duplicated: talo saku-ki" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
    expect(after.json()).toEqual(before.json());
  });

  it("grades and persists correct exercise submissions server-side", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exerciseId: submissionExerciseId,
      languageId: TEST_LANGUAGE_ID,
      accepted: true,
      explanation: "Submission accepted."
    });
    expect(response.json()).not.toHaveProperty("answer");
    expect(response.json()).not.toHaveProperty("learnerId");

    const submissions = await app.inject({
      method: "GET",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1")
    });
    expect(submissions.statusCode).toBe(200);
    expect(submissions.json()).toHaveLength(1);
    expect(submissions.json()[0]).toMatchObject({
      exerciseId: submissionExerciseId,
      accepted: true
    });
    expect(submissions.json()[0]).not.toHaveProperty("learnerId");
  });

  it("preserves concurrent exercise submissions through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-submissions-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildTestWorkspaceState());
    const app = createServer({ store });

    const responses = await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        app.inject({
          method: "POST",
          url: `/exercises/${submissionExerciseId}/submissions`,
          headers: authHeaders("learner-1"),
          payload: { answer: index % 2 === 0 ? "saku talo-ki" : "talo saku" }
        })
      )
    );

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);

    const persisted = await store.read();
    const submissions = persisted.exerciseSubmissions.filter((submission) => submission.exerciseId === submissionExerciseId);

    expect(submissions).toHaveLength(20);
    expect(new Set(submissions.map((submission) => submission.id)).size).toBe(20);
  });

  it("returns sanitized exercise submission history without learner answers", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });

    const submissions = await app.inject({
      method: "GET",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1")
    });

    expect(submissions.statusCode).toBe(200);
    expect(submissions.json()[0]).toMatchObject({
      exerciseId: submissionExerciseId,
      accepted: true,
      explanation: "Submission accepted."
    });
    expect(submissions.json()[0]).not.toHaveProperty("answer");
    expect(submissions.json()[0]).not.toHaveProperty("learnerId");
    expect(JSON.stringify(submissions.json())).not.toContain("saku talo-ki");
  });

  it("rejects anonymous exercise submission history reads", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const submissions = await app.inject({
      method: "GET",
      url: `/exercises/${submissionExerciseId}/submissions`
    });

    expect(submissions.statusCode).toBe(401);
    expect(submissions.json()).toEqual({ error: "Unauthorized" });
  });

  it("grades incorrect exercise submissions without exposing answer keys", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/exercises/${submissionExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "talo saku" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      exerciseId: submissionExerciseId,
      accepted: false,
      explanation: "Answer did not match the exercise answer key."
    });
    expect(JSON.stringify(response.json())).not.toContain("saku talo-ki");
    expect(response.json()).not.toHaveProperty("answer");
    expect(response.json()).not.toHaveProperty("learnerId");
  });

  it.each([
    ["missing exercise", "/exercises/missing-exercise/submissions", { answer: "saku talo-ki" }, 404],
    ["empty answer", `/exercises/${submissionExerciseId}/submissions`, { answer: " " }, 400],
    ["missing payload", `/exercises/${submissionExerciseId}/submissions`, undefined, 400]
  ])("returns a client error for %s submissions", async (_, url, payload, statusCode) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeaders("learner-1"),
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(statusCode);
  });

  it.each([
    ["missing payload", undefined],
    ["null payload", null],
    ["empty languageId", { languageId: " " }],
    ["non-string languageId", { languageId: 42 }],
    ["array payload", []]
  ])("returns 400 for a %s study-loop draft body and preserves notes", async (_, payload) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Missing languageId" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    expect(after.json()).toEqual(before.json());
  });

  it("returns 404 for study-loop drafts for an unknown language and preserves notes", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: "not-a-language" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });

    const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    expect(after.json()).toEqual(before.json());
  });

  it("adds generated study-loop drafts without removing reviewed notes", async () => {
    const initialState = buildTestWorkspaceState();
    const reviewedNote = initialState.notes.find((note) => note.id === reviewedNoteId);
    if (!reviewedNote) throw new Error("Missing reviewed note");

    reviewedNote.status = "approved";
    reviewedNote.explanation = "Reviewer-approved wording.";
    reviewedNote.reviewer = {
      ...reviewedNote.reviewer,
      lastReviewedBy: "local-reviewer",
      lastReviewedAt: "2026-06-04T00:00:00.000Z",
      comments: [...reviewedNote.reviewer.comments, "Approved reviewer edit."]
    };
    reviewedNote.editHistory = [
      ...reviewedNote.editHistory,
      {
        at: "2026-06-04T00:00:00.000Z",
        by: "local-reviewer",
        action: "reviewed",
        summary: "Approved reviewer edit."
      }
    ];

    const app = createServer({ initialState });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: TEST_LANGUAGE_ID }
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as Note[]).map((note) => note.id)).toContain("testlang-draft-basic-order");

    const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    const notes = notesResponse.json() as Note[];

    const expectedReviewedAndGeneratedNotes =
      initialState.notes.filter((note) => note.languageId === TEST_LANGUAGE_ID).length +
      draftNotesForLanguage(TEST_LANGUAGE_ID, initialState).length;

    expect(notes).toHaveLength(expectedReviewedAndGeneratedNotes);
    expect(new Set(notes.map((note) => note.id)).size).toBe(notes.length);
    expect(notes.find((note) => note.id === reviewedNoteId)).toMatchObject({
      status: "approved",
      explanation: "Reviewer-approved wording.",
      reviewer: expect.objectContaining({ lastReviewedBy: "local-reviewer" })
    });
    expect(notes.find((note) => note.id === "testlang-draft-basic-order")).toMatchObject({
      status: "draft",
      reviewer: expect.objectContaining({ lastReviewedBy: null, lastReviewedAt: null })
    });
  });

  it("refreshes only unreviewed generated drafts on repeated study-loop drafts", async () => {
    const initialState = buildTestWorkspaceState();
    const [generatedDraft, reviewedGeneratedDraft] = draftNotesForLanguage(TEST_LANGUAGE_ID, initialState);
    if (!generatedDraft || !reviewedGeneratedDraft) throw new Error("Missing generated drafts");

    const staleDraft: Note = {
      ...generatedDraft,
      explanation: "Stale generated draft text."
    };
    const reviewedDraft: Note = {
      ...reviewedGeneratedDraft,
      status: "approved",
      explanation: "Reviewer-edited generated draft.",
      reviewer: {
        ...reviewedGeneratedDraft.reviewer,
        lastReviewedBy: "local-reviewer",
        lastReviewedAt: "2026-06-04T00:00:00.000Z",
        comments: [...reviewedGeneratedDraft.reviewer.comments, "Keep reviewer edits."]
      },
      editHistory: [
        ...reviewedGeneratedDraft.editHistory,
        {
          at: "2026-06-04T00:00:00.000Z",
          by: "local-reviewer",
          action: "reviewed",
          summary: "Approved edited generated draft."
        }
      ]
    };
    initialState.notes.push(staleDraft, reviewedDraft);
    const app = createServer({ initialState });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: TEST_LANGUAGE_ID }
    });

    expect(response.statusCode).toBe(200);

    const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    const notes = notesResponse.json() as Note[];
    const refreshed = notes.find((note) => note.id === generatedDraft.id);
    const preserved = notes.find((note) => note.id === reviewedGeneratedDraft.id);

    expect(refreshed?.explanation).toBe(generatedDraft.explanation);
    expect(preserved).toMatchObject({
      status: "approved",
      explanation: "Reviewer-edited generated draft.",
      reviewer: expect.objectContaining({ lastReviewedBy: "local-reviewer" })
    });
    expect(notes.filter((note) => note.id === generatedDraft.id)).toHaveLength(1);
    expect(notes.filter((note) => note.id === reviewedGeneratedDraft.id)).toHaveLength(1);
  });

  describe("POST /languages/:languageId/study-loop/model-draft", () => {
    function noteProvider(content: string): LlmProvider {
      return {
        name: "fake-note-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return content;
        }
      };
    }

    const groundedNoteJson = JSON.stringify({
      notes: [
        {
          topic: "morphology/verb/third-person",
          explanation: "The suffix -ki marks a third-person singular subject on the verb form.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c003`],
          confidence: "medium"
        }
      ]
    });

    it("inserts model-backed draft notes and emits an audit event", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: noteProvider(groundedNoteJson)
      });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { notes: Note[]; warnings: string[]; generated: number };
      expect(body.generated).toBe(1);
      expect(body.notes).toHaveLength(1);
      expect(Array.isArray(body.warnings)).toBe(true);
      const [created] = body.notes;
      expect(created.status).toBe("draft");
      expect(created.topic).toBe("morphology/verb/third-person");
      expect(created.evidencePassageIds).toEqual([`${TEST_LANGUAGE_ID}-c003`]);
      expect(created.evidenceCount).toBe(1);
      expect(created.reviewer).toMatchObject({ lastReviewedBy: null, lastReviewedAt: null });
      expect(created.editHistory[0]).toMatchObject({ by: "deterministic-study-loop", action: "drafted" });

      const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
      const notes = notesResponse.json() as Note[];
      expect(notes.find((note) => note.id === created.id)).toMatchObject({ status: "draft" });

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("lead-1")
      });
      const actions = (audit.json() as Array<{ action: string }>).map((event) => event.action);
      expect(actions).toContain("note.draft_generated");
    });

    it("returns 400 when the configured provider cannot generate (no completeChat)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("A configured model is required");

      const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
      expect(after.json()).toEqual(before.json());
    });

    it("returns 404 for an unknown language", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: noteProvider(groundedNoteJson)
      });

      const response = await app.inject({
        method: "POST",
        url: "/languages/not-a-language/study-loop/model-draft",
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
    });

    it("forbids learners from generating model-backed draft notes", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: noteProvider(groundedNoteJson)
      });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
        headers: authHeaders("learner-1")
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });
  });

  describe("POST /languages/:languageId/exercises/generate", () => {
    function exerciseProvider(content: string): LlmProvider {
      return {
        name: "fake-exercise-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return content;
        }
      };
    }

    const groundedExerciseJson = JSON.stringify({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate to the target language: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: [`${TEST_LANGUAGE_ID}-note-basic-order`],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." },
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." }
        ],
        gradingExplanation: "Subject saku precedes the verb talo with the third-person suffix -ki."
      }
    });

    it("returns a grounded exercise draft without persisting anything", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: exerciseProvider(groundedExerciseJson)
      });

      const before = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
      const beforeCount = (before.json() as unknown[]).length;

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/exercises/generate`,
        headers: authHeaders("reviewer-1"),
        payload: { type: "translate_to_target" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { exercise: Record<string, unknown>; warnings: string[] };
      expect(body.exercise).toMatchObject({
        type: "translate_to_target",
        expectedAnswers: ["saku talo-ki"],
        allowedVocabulary: ["saku", "talo", "-ki"]
      });
      expect(Array.isArray(body.warnings)).toBe(true);

      const after = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/exercises` });
      expect((after.json() as unknown[]).length).toBe(beforeCount);
    });

    it("returns 400 when the configured provider cannot generate (no completeChat)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/exercises/generate`,
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("A configured model is required");
    });

    it("returns 404 for an unknown language", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: exerciseProvider(groundedExerciseJson)
      });

      const response = await app.inject({
        method: "POST",
        url: "/languages/not-a-language/exercises/generate",
        headers: authHeaders("reviewer-1")
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
    });

    it("forbids learners from generating exercises", async () => {
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider: exerciseProvider(groundedExerciseJson)
      });

      const response = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/exercises/generate`,
        headers: authHeaders("learner-1")
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });
  });

  it("updates note review details", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "contested",
        explanation: "Needs one more example before approval.",
        reviewerComment: "Please add a counterexample check."
      }
    });

    expect(response.statusCode).toBe(200);
    const note = response.json();
    expect(note.status).toBe("contested");
    expect(note.explanation).toBe("Needs one more example before approval.");
    expect(note.reviewer.lastReviewedBy).toBe("reviewer-1");
    expect(note.reviewer.comments).toContain("Please add a counterexample check.");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "reviewer-1",
      action: "reviewed",
      summary: "Please add a counterexample check."
    });
  });

  it("rejects underspecified note explanation edits without mutating the note", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        explanation: "Too short.",
        reviewerComment: "Edited note explanation in local prototype."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Note explanation edits require a substantive explanation." });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it.each([
    ["rejected", "Reject until the noun-case examples are corrected."],
    ["deferred", "Defer until an Elder checks the dialect scope."],
    ["escalated", "Escalate for language-lead review before release."]
  ] as const)("records %s note dispositions with comments and audit metadata", async (status, reviewerComment) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: { status, reviewerComment }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: reviewedNoteId,
      status,
      reviewer: expect.objectContaining({
        lastReviewedBy: "reviewer-1",
        comments: expect.arrayContaining([reviewerComment])
      })
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "note.reviewed",
        entityType: "note",
        entityId: reviewedNoteId,
        metadata: expect.objectContaining({
          requestedStatus: status,
          status,
          disposition: status
        })
      })
    ]));
  });

  it("tracks assigned review dispositions with due dates and resolution workflow", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const opened = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "escalated",
        reviewerComment: "Escalate until an Elder confirms this teaching note.",
        dispositionAssigneeId: "elder-1",
        dispositionDueAt: "2026-06-20"
      }
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().status).toBe("escalated");

    const dispositions = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-dispositions`,
      headers: authHeaders("reviewer-1")
    });
    expect(dispositions.statusCode).toBe(200);
    expect(dispositions.json()).toHaveLength(1);
    expect(dispositions.json()[0]).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      noteId: reviewedNoteId,
      disposition: "escalated",
      status: "open",
      reason: "Escalate until an Elder confirms this teaching note.",
      assignedTo: "elder-1",
      dueAt: "2026-06-20",
      openedBy: "reviewer-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null
    });

    const dispositionId = dispositions.json()[0].id as string;
    const unauthorizedResolve = await app.inject({
      method: "PATCH",
      url: "/review-dispositions/resolve",
      headers: authHeaders("reviewer-1"),
      payload: {
        dispositionId,
        resolutionSummary: "Reviewer should not resolve assigned Elder work."
      }
    });
    expect(unauthorizedResolve.statusCode).toBe(403);
    expect(unauthorizedResolve.json()).toEqual({ error: "Forbidden" });

    const resolved = await app.inject({
      method: "PATCH",
      url: "/review-dispositions/resolve",
      headers: authHeaders("elder-1"),
      payload: {
        dispositionId,
        resolutionSummary: "Elder confirmed the note can return to reviewer quorum."
      }
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({
      id: dispositionId,
      status: "resolved",
      resolvedBy: "elder-1",
      resolutionSummary: "Elder confirmed the note can return to reviewer quorum."
    });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("under_review");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "elder-1",
      action: "disposition_resolved",
      summary: "Elder confirmed the note can return to reviewer quorum."
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "review_disposition.created",
        entityType: "review_disposition",
        entityId: dispositionId,
        metadata: expect.objectContaining({
          disposition: "escalated",
          assignedTo: "elder-1",
          dueAt: "2026-06-20"
        })
      }),
      expect.objectContaining({
        action: "review_disposition.resolved",
        entityType: "review_disposition",
        entityId: dispositionId,
        metadata: expect.objectContaining({
          noteStatus: "under_review",
          resolvedBy: "elder-1"
        })
      })
    ]));
  });

  it("updates an existing open review disposition instead of creating duplicate open work", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const firstDeferral = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Pause until the next review workshop.",
        dispositionAssigneeId: "elder-1",
        dispositionDueAt: "2026-06-20"
      }
    });
    expect(firstDeferral.statusCode).toBe(200);

    const opened = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-dispositions`,
      headers: authHeaders("lead-1")
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toHaveLength(1);
    const dispositionId = opened.json()[0].id as string;

    const updatedDeferral = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("lead-1"),
      payload: {
        status: "deferred",
        reviewerComment: "Still paused; assign the follow-up to the lead.",
        dispositionAssigneeId: "lead-1",
        dispositionDueAt: "2026-06-27"
      }
    });
    expect(updatedDeferral.statusCode).toBe(200);

    const dispositions = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/review-dispositions`,
      headers: authHeaders("lead-1")
    });
    expect(dispositions.statusCode).toBe(200);
    expect(dispositions.json()).toHaveLength(1);
    expect(dispositions.json()[0]).toMatchObject({
      id: dispositionId,
      status: "open",
      reason: "Still paused; assign the follow-up to the lead.",
      assignedTo: "lead-1",
      dueAt: "2026-06-27",
      openedBy: "reviewer-1"
    });

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(audit.json().filter((event: { action: string }) => event.action === "review_disposition.created")).toHaveLength(1);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "review_disposition.updated",
        entityType: "review_disposition",
        entityId: dispositionId,
        metadata: expect.objectContaining({
          noteId: reviewedNoteId,
          disposition: "deferred",
          assignedTo: "lead-1",
          dueAt: "2026-06-27"
        })
      })
    ]));
  });

  it.each([
    ["contested missing reviewerComment", { status: "contested" }],
    ["contested blank reviewerComment", { status: "contested", reviewerComment: "   " }],
    ["rejected missing reviewerComment", { status: "rejected" }],
    ["deferred missing reviewerComment", { status: "deferred" }],
    ["escalated missing reviewerComment", { status: "escalated" }]
  ])("requires a substantive reviewer comment for note dispositions: %s", async (_, payload) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Review dispositions require reviewerComment" });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 400 for an invalid review body and does not update the note", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      payload: {
        status: "bogus",
        reviewerComment: "This should not be persisted."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid review body" });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("draft");
    expect(note.reviewer.comments).not.toContain("This should not be persisted.");
  });

  it.each([
    ["empty object", { payload: {} }],
    ["unknown-only object", { payload: { foo: "bar" } }],
    ["null payload", { payload: null }],
    ["missing payload", {}]
  ])("returns 400 for a %s review body and does not update the note", async (_, injectOptions) => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("reviewer-1"),
      ...injectOptions
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid review body" });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 404 when reviewing a missing note", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "PATCH",
      url: "/notes/missing-note/review",
      headers: authHeaders("reviewer-1"),
      payload: { status: "approved" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Note not found: missing-note" });
  });

  it("resolves authenticated users and uses them for note review audit fields", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const currentUser = await app.inject({ method: "GET", url: "/users/me", headers: authHeaders("elder-1") });
    expect(currentUser.statusCode).toBe(200);
    expect(currentUser.json()).toMatchObject({ id: "elder-1", role: "elder" });

    const unknown = await app.inject({ method: "GET", url: "/users/me", headers: authHeaders("missing-user") });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual({ error: "Unauthorized" });

    const review = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      headers: authHeaders("elder-1"),
      payload: { status: "approved", reviewerComment: "Elder approved the wording." }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().reviewer.lastReviewedBy).toBe("elder-1");
    expect(review.json().editHistory.at(-1)).toMatchObject({ by: "elder-1", action: "reviewed" });
  });

  it("enforces role-aware AI sessions and returns safe observability surfaces", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const blocked = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: { languageId: TEST_LANGUAGE_ID, mode: "programmer_debug", seedPrompt: "Show internals." }
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: "Forbidden" });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Trace what the AI knows about basic word order.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      mode: "programmer_debug",
      createdBy: "programmer-1",
      privacy: { exposesHiddenChainOfThought: false }
    });
    expect(created.json().thinkingSummary).toContain("observable trace");
    expect(created.json().neuralMap.nodes.length).toBeGreaterThan(0);
    expect(JSON.stringify(created.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(created.json())).not.toContain("gradingExplanation");
    expect(JSON.stringify(created.json())).not.toContain("noteAnswerKeys");

    const observability = await app.inject({
      method: "GET",
      url: "/observability/ai-sessions",
      headers: authHeaders("programmer-1")
    });
    expect(observability.statusCode).toBe(200);
    expect(observability.json().totals.sessions).toBe(1);
    expect(observability.json().sessions[0]).toMatchObject({ languageId: TEST_LANGUAGE_ID, messageCount: 2 });
    expect(JSON.stringify(observability.json())).not.toContain("Trace what the AI knows");
  });

  it("enforces canReadAiSession on GET /ai/sessions/:sessionId", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        return { content: `Safe response: ${input.prompt}`, warnings: [] };
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
    const sessionPayload = {
      languageId: TEST_LANGUAGE_ID,
      seedPrompt: "Trace learner practice safely.",
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["testlang-c001"]
    };

    async function createSession(mode: "learner_practice" | "elder_review" | "programmer_debug", userId: string) {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders(userId),
        payload: { ...sessionPayload, mode }
      });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    }

    async function readSession(sessionId: string, userId: string) {
      return app.inject({
        method: "GET",
        url: `/ai/sessions/${encodeURIComponent(sessionId)}`,
        headers: authHeaders(userId)
      });
    }

    const learnerPracticeId = await createSession("learner_practice", "learner-1");
    const elderReviewId = await createSession("elder_review", "elder-1");
    const programmerDebugId = await createSession("programmer_debug", "programmer-1");

    const anonymous = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(learnerPracticeId)}`
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "Unauthorized" });

    const learnerPracticeAccess = [
      ["learner-1", 200],
      ["elder-1", 200],
      ["reviewer-1", 200],
      ["lead-1", 200],
      ["admin-1", 200],
      ["programmer-1", 403]
    ] as const;
    for (const [userId, statusCode] of learnerPracticeAccess) {
      const response = await readSession(learnerPracticeId, userId);
      expect(response.statusCode).toBe(statusCode);
      if (statusCode === 403) {
        expect(response.json()).toEqual({ error: "Forbidden" });
      }
    }

    const elderReviewAccess = [
      ["elder-1", 200],
      ["lead-1", 200],
      ["reviewer-1", 403],
      ["learner-1", 403]
    ] as const;
    for (const [userId, statusCode] of elderReviewAccess) {
      const response = await readSession(elderReviewId, userId);
      expect(response.statusCode).toBe(statusCode);
    }

    const programmerDebugAccess = [
      ["programmer-1", 200],
      ["lead-1", 200],
      ["learner-1", 403],
      ["elder-1", 403],
      ["reviewer-1", 403]
    ] as const;
    for (const [userId, statusCode] of programmerDebugAccess) {
      const response = await readSession(programmerDebugId, userId);
      expect(response.statusCode).toBe(statusCode);
    }

    const reviewerView = await readSession(learnerPracticeId, "reviewer-1");
    expect(reviewerView.statusCode).toBe(200);
    expect(reviewerView.json()).toMatchObject({
      createdBy: "redacted",
      messages: [
        expect.objectContaining({ role: "user", content: "[redacted user input]", createdBy: "redacted" }),
        expect.objectContaining({ role: "assistant", content: expect.stringContaining("Safe response:") })
      ]
    });
  });

  it("enforces canWriteAiSessionMessage on POST /ai/sessions/:sessionId/messages", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        return { content: `Safe response: ${input.prompt}`, warnings: [] };
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
    const sessionPayload = {
      languageId: TEST_LANGUAGE_ID,
      seedPrompt: "Trace learner practice safely.",
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["testlang-c001"]
    };

    async function createSession(mode: "learner_practice" | "elder_review" | "programmer_debug", userId: string) {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders(userId),
        payload: { ...sessionPayload, mode }
      });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    }

    async function appendMessage(sessionId: string, userId: string) {
      return app.inject({
        method: "POST",
        url: `/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
        headers: authHeaders(userId),
        payload: { content: "Follow up safely." }
      });
    }

    const learnerPracticeId = await createSession("learner_practice", "learner-1");
    const programmerDebugId = await createSession("programmer_debug", "programmer-1");

    const learnerPracticeWriteAccess = [
      ["learner-1", 200],
      ["elder-1", 403],
      ["reviewer-1", 403],
      ["lead-1", 403],
      ["admin-1", 200],
      ["programmer-1", 403]
    ] as const;
    for (const [userId, statusCode] of learnerPracticeWriteAccess) {
      const response = await appendMessage(learnerPracticeId, userId);
      expect(response.statusCode).toBe(statusCode);
      if (statusCode === 403) {
        expect(response.json()).toEqual({ error: "Forbidden" });
      }
    }

    const programmerDebugWriteAccess = [
      ["programmer-1", 200],
      ["admin-1", 200],
      ["lead-1", 403],
      ["learner-1", 403]
    ] as const;
    for (const [userId, statusCode] of programmerDebugWriteAccess) {
      const response = await appendMessage(programmerDebugId, userId);
      expect(response.statusCode).toBe(statusCode);
    }
  });

  it("uses an injected LLM provider for AI sessions without exposing provider secrets or answer-key fields", async () => {
    const providerInputs: unknown[] = [];
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        providerInputs.push(input);
        return {
          content: `Provider response ${providerInputs.length}: ${input.prompt}`,
          warnings: ["test-provider"]
        };
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().messages[1]).toMatchObject({
      role: "assistant",
      content: "Provider response 1: Use the model safely.",
      createdBy: "local-ai"
    });
    expect(created.json().trace.at(-1).warnings).toContain("test-provider");

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Follow up safely." }
    });

    expect(followUp.statusCode).toBe(200);
    expect(followUp.json().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Provider response 2: Follow up safely.",
      createdBy: "local-ai"
    });
    expect(providerInputs).toHaveLength(2);
    expect(JSON.stringify(providerInputs)).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(providerInputs)).not.toContain("expectedAnswers");
    expect(JSON.stringify(followUp.json())).not.toContain("ASSINI_LLM_API_KEY");
    expect(JSON.stringify(followUp.json())).not.toContain("OPENAI_API_KEY");
  });

  it("returns sanitized LLM provider failure details for AI session creation", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 429: Rate limit for sk-route-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "LLM generation failed: LLM provider request failed with status 429: Rate limit for [redacted-secret]"
    });
    expect(JSON.stringify(response.json())).not.toContain("sk-route-secret");
  });

  it("persists failed AI session attempts with sanitized observable diagnostics", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 429: Rate limit for sk-route-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(response.statusCode).toBe(502);

    const observability = await app.inject({
      method: "GET",
      url: "/observability/ai-sessions",
      headers: authHeaders("programmer-1")
    });
    expect(observability.statusCode).toBe(200);
    expect(observability.json().totals).toMatchObject({ sessions: 1, activeSessions: 0 });
    expect(observability.json().sessions[0]).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      mode: "programmer_debug",
      status: "failed",
      createdBy: "programmer-1",
      messageCount: 1,
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["testlang-c001"]
    });

    const sessionId = observability.json().sessions[0].id;
    const storedSession = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(sessionId)}`,
      headers: authHeaders("programmer-1")
    });
    expect(storedSession.statusCode).toBe(200);
    expect(storedSession.json().status).toBe("failed");
    expect(storedSession.json().messages).toHaveLength(1);
    expect(storedSession.json().trace.at(-1)).toMatchObject({
      kind: "generation",
      label: "Provider failure",
      summary: "LLM generation failed: LLM provider request failed with status 429: Rate limit for [redacted-secret]"
    });
    expect(JSON.stringify(storedSession.json())).not.toContain("sk-route-secret");
  });

  it("redacts configured non-sk provider secrets from AI session failures", async () => {
    const previousAssiniKey = process.env.ASSINI_LLM_API_KEY;
    process.env.ASSINI_LLM_API_KEY = "plain-provider-secret";
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 500: plain-provider-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders("programmer-1"),
        payload: {
          languageId: TEST_LANGUAGE_ID,
          mode: "programmer_debug",
          seedPrompt: "Use the model safely.",
          contextNoteIds: [reviewedNoteId],
          contextPassageIds: ["testlang-c001"]
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: "LLM generation failed: LLM provider request failed with status 500: [redacted-secret]"
      });
      expect(JSON.stringify(response.json())).not.toContain("plain-provider-secret");

      const observability = await app.inject({
        method: "GET",
        url: "/observability/ai-sessions",
        headers: authHeaders("programmer-1")
      });
      const storedSession = await app.inject({
        method: "GET",
        url: `/ai/sessions/${encodeURIComponent(observability.json().sessions[0].id)}`,
        headers: authHeaders("programmer-1")
      });
      expect(JSON.stringify(storedSession.json())).not.toContain("plain-provider-secret");
    } finally {
      if (previousAssiniKey === undefined) {
        delete process.env.ASSINI_LLM_API_KEY;
      } else {
        process.env.ASSINI_LLM_API_KEY = previousAssiniKey;
      }
    }
  });

  it("returns sanitized LLM provider failure details for AI session follow-ups", async () => {
    let callCount = 0;
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        callCount += 1;
        if (callCount === 1) {
          return { content: `Provider response: ${input.prompt}`, warnings: [] };
        }
        throw new Error("LLM provider request timed out after 25ms");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Start safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Continue safely." }
    });

    expect(followUp.statusCode).toBe(502);
    expect(followUp.json()).toEqual({
      error: "LLM generation failed: LLM provider request timed out after 25ms"
    });
  });

  it("marks existing AI sessions failed when follow-up generation fails", async () => {
    let callCount = 0;
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        callCount += 1;
        if (callCount === 1) {
          return { content: `Provider response: ${input.prompt}`, warnings: [] };
        }
        throw new Error("LLM provider request failed with status 500: Retry with sk-followup-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Start safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Continue safely." }
    });
    expect(followUp.statusCode).toBe(502);

    const storedSession = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}`,
      headers: authHeaders("programmer-1")
    });
    expect(storedSession.statusCode).toBe(200);
    expect(storedSession.json().status).toBe("failed");
    expect(storedSession.json().messages).toHaveLength(3);
    expect(storedSession.json().messages.at(-1)).toMatchObject({
      role: "user",
      content: "Continue safely.",
      createdBy: "programmer-1"
    });
    expect(storedSession.json().trace.at(-1)).toMatchObject({
      kind: "generation",
      label: "Provider failure",
      summary: "LLM generation failed: LLM provider request failed with status 500: Retry with [redacted-secret]"
    });
    const sessionNode = storedSession.json().neuralMap.nodes.find((node: { id: string }) => node.id === `ai_session:${created.json().id}`);
    expect(sessionNode.metadata.status).toBe("failed");
    expect(JSON.stringify(storedSession.json())).not.toContain("sk-followup-secret");
  });

  it("lets Elders add pending correction/context records without mutating notes", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const correction = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major",
        contextText: "Keep this local-only until governance approval."
      }
    });

    expect(correction.statusCode).toBe(201);
    expect(correction.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      noteId: reviewedNoteId,
      status: "pending_review",
      proposedBy: "elder-1",
      severity: "major"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(before.explanation);
    expect(after.editHistory).toEqual(before.editHistory);

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.statusCode).toBe(200);
    expect(context.json().corrections).toHaveLength(1);
    expect(JSON.stringify(context.json())).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(context.json())).not.toContain("expectedAnswers");
  });

  it("lets leads review elder corrections with audit attribution", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });

    const denied = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("learner-1"),
      payload: { status: "accepted" }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "Forbidden" });

    const reviewed = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });

    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });
    expect(reviewed.json().reviewedAt).toEqual(expect.any(String));

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(before.explanation);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("rejects review attempts for elder corrections that are no longer pending", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });
    expect(created.statusCode).toBe(201);

    const accepted = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(accepted.statusCode).toBe(200);

    const rejectedAfterAcceptance = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("elder-1"),
      payload: { status: "rejected" }
    });

    expect(rejectedAfterAcceptance.statusCode).toBe(409);
    expect(rejectedAfterAcceptance.json()).toEqual({
      error: `Elder correction is no longer pending review: ${created.json().id}`
    });

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "accepted",
      reviewedBy: "lead-1"
    });
  });

  it("applies accepted note-linked elder corrections as auditable note edits", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const before = await fetchReviewedNote(app);
    const revisedExplanation = `${before.explanation} Accepted elder correction: mention suffix order before approval.`;

    const created = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });

    const accepted = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(accepted.statusCode).toBe(200);

    const applied = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(created.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: revisedExplanation }
    });

    expect(applied.statusCode).toBe(200);
    expect(applied.json().correction).toMatchObject({
      id: created.json().id,
      status: "applied",
      reviewedBy: "lead-1"
    });
    expect(applied.json().note).toMatchObject({
      id: reviewedNoteId,
      explanation: revisedExplanation,
      status: "under_review",
      reviewer: {
        lastReviewedBy: "lead-1",
        comments: expect.arrayContaining([`Applied elder correction ${created.json().id}.`])
      }
    });
    expect(applied.json().note.editHistory.at(-1)).toMatchObject({
      by: "lead-1",
      action: "applied_correction",
      summary: `Applied elder correction ${created.json().id}.`
    });

    const context = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/elder-context`,
      headers: authHeaders("elder-1")
    });
    expect(context.json().corrections[0]).toMatchObject({
      id: created.json().id,
      status: "applied"
    });

    const after = await fetchReviewedNote(app);
    expect(after.explanation).toBe(revisedExplanation);
    expect(after.editHistory).toHaveLength(before.editHistory.length + 1);
  });

  it("rejects apply for pending elder corrections and for accepted corrections without a note link", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const pending = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: reviewedNoteId,
        correction: "Mention suffix order before approval.",
        rationale: "Elder review found the explanation underspecified.",
        severity: "major"
      }
    });
    expect(pending.statusCode).toBe(201);

    const applyPending = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(pending.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: "Should not apply while still pending review." }
    });
    expect(applyPending.statusCode).toBe(409);
    expect(applyPending.json()).toEqual({
      error: `Elder correction must be accepted before apply: ${pending.json().id}`
    });

    const passageOnly = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        passageId: "testlang-c001",
        correction: "Clarify river-path morphology in the passage gloss.",
        rationale: "Passage context needs a clearer gloss before learner use.",
        severity: "minor"
      }
    });
    expect(passageOnly.statusCode).toBe(201);
    expect(passageOnly.json().noteId).toBeUndefined();

    const acceptedPassageOnly = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(passageOnly.json().id)}/review`,
      headers: authHeaders("lead-1"),
      payload: { status: "accepted" }
    });
    expect(acceptedPassageOnly.statusCode).toBe(200);

    const applyPassageOnly = await app.inject({
      method: "PATCH",
      url: `/elder/corrections/${encodeURIComponent(passageOnly.json().id)}/apply`,
      headers: authHeaders("lead-1"),
      payload: { explanation: "Should not apply without a linked note." }
    });
    expect(applyPassageOnly.statusCode).toBe(400);
    expect(applyPassageOnly.json()).toEqual({
      error: `Elder correction is not linked to a note: ${passageOnly.json().id}`
    });
  });

  it("returns a programmer-only neural map and rate limits protected writes", async () => {
    let now = 1_000;
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(
      {
        id: "source-right",
        languageId: TEST_LANGUAGE_ID,
        kind: "text",
        title: "Shared title",
        rawText: "right",
        status: "processed",
        createdBy: "reviewer-1",
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "source-wrong",
        languageId: TEST_LANGUAGE_ID,
        kind: "text",
        title: "Shared title",
        rawText: "wrong",
        status: "processed",
        createdBy: "reviewer-1",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    );
    const firstPassage = state.corpus[0];
    if (!firstPassage) throw new Error("Missing first corpus passage");
    state.corpus[0] = {
      ...firstPassage,
      source: "source-asset:Shared title",
      sourceAssetId: "source-right"
    };
    const firstPassageId = firstPassage.id;
    const app = createServer({
      initialState: state,
      rateLimit: { max: 2, windowMs: 60_000, now: () => now }
    });

    const neuralMap = await app.inject({
      method: "GET",
      url: `/observability/neural-map?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("programmer-1")
    });
    expect(neuralMap.statusCode).toBe(200);
    expect(neuralMap.json().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `language:${TEST_LANGUAGE_ID}`, type: "language" }),
        expect.objectContaining({ id: `note:${reviewedNoteId}`, type: "note" })
      ])
    );
    expect(neuralMap.json().edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "source_asset:source-right", target: `corpus:${firstPassageId}` })
      ])
    );
    expect(neuralMap.json().edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "source_asset:source-wrong", target: `corpus:${firstPassageId}` })
      ])
    );
    expect(JSON.stringify(neuralMap.json())).not.toContain("expectedAnswers");

    const payload = { languageId: TEST_LANGUAGE_ID, mode: "learner_practice", seedPrompt: "Practice safely." };
    const first = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    const second = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    const third = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: "Rate limit exceeded" });

    now += 60_001;
    const afterWindow = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    expect(afterWindow.statusCode).toBe(201);
  });

  it("flags duplicate extraction drafts at read time without persisting the flag", async () => {
    const baseState = buildTestWorkspaceState();
    const sourceAssetId = "source-duplicate-check";
    const draftBase = {
      languageId: TEST_LANGUAGE_ID,
      sourceAssetId,
      confidence: "medium" as const,
      status: "proposed" as const
    };
    const emptyPayload = { tags: [], morphologicalSegmentation: [], topicTags: [] };
    const app = createServer({
      initialState: {
        ...baseState,
        sourceAssets: [
          ...baseState.sourceAssets,
          {
            id: sourceAssetId,
            languageId: TEST_LANGUAGE_ID,
            kind: "text" as const,
            title: "Overlapping source",
            rawText: "mira = river",
            status: "processed" as const,
            createdBy: "reviewer-1",
            createdAt: "2026-06-09T00:00:00.000Z"
          }
        ],
        extractionDrafts: [
          {
            ...draftBase,
            id: "draft-lexeme-exact",
            kind: "lexeme" as const,
            payload: { ...emptyPayload, form: "Mira", gloss: "River" },
            createdAt: "2026-06-09T00:00:01.000Z"
          },
          {
            ...draftBase,
            id: "draft-lexeme-form",
            kind: "lexeme" as const,
            payload: { ...emptyPayload, form: "MIRA", gloss: "stream" },
            createdAt: "2026-06-09T00:00:02.000Z"
          },
          {
            ...draftBase,
            id: "draft-passage-exact",
            kind: "corpus_passage" as const,
            payload: { ...emptyPayload, textTarget: "  Mira   talo-na ", textTranslation: "I walk by the river." },
            createdAt: "2026-06-09T00:00:03.000Z"
          },
          {
            ...draftBase,
            id: "draft-topic-duplicate",
            kind: "grammar_note" as const,
            payload: { ...emptyPayload, topic: "syntax/basic-order", explanation: "Subjects come before verbs." },
            createdAt: "2026-06-09T00:00:04.000Z"
          },
          {
            ...draftBase,
            id: "draft-pending-first",
            kind: "lexeme" as const,
            payload: { ...emptyPayload, form: "pelu", gloss: "stone" },
            createdAt: "2026-06-09T00:00:05.000Z"
          },
          {
            ...draftBase,
            id: "draft-pending-second",
            kind: "lexeme" as const,
            payload: { ...emptyPayload, form: "pelu", gloss: "stone" },
            createdAt: "2026-06-09T00:00:06.000Z"
          },
          {
            ...draftBase,
            id: "draft-unique",
            kind: "grammar_note" as const,
            payload: { ...emptyPayload, topic: "phonology/vowel-harmony", explanation: "Vowels agree across suffixes." },
            createdAt: "2026-06-09T00:00:07.000Z"
          }
        ]
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
      headers: authHeaders("reviewer-1")
    });
    expect(response.statusCode).toBe(200);
    const byId = new Map<string, { duplicate?: unknown }>(
      response.json().map((draft: { id: string }) => [draft.id, draft])
    );

    expect(byId.get("draft-lexeme-exact")?.duplicate).toEqual({ kind: "exact", entityId: "testlang-lex-001" });
    expect(byId.get("draft-lexeme-form")?.duplicate).toEqual({ kind: "form", entityId: "testlang-lex-001" });
    expect(byId.get("draft-passage-exact")?.duplicate).toEqual({ kind: "exact", entityId: "testlang-c001" });
    expect(byId.get("draft-topic-duplicate")?.duplicate).toEqual({ kind: "topic", entityId: "testlang-note-basic-order" });
    expect(byId.get("draft-pending-first")?.duplicate).toBeUndefined();
    expect(byId.get("draft-pending-second")?.duplicate).toEqual({ kind: "pending", draftId: "draft-pending-first" });
    expect(byId.get("draft-unique")?.duplicate).toBeUndefined();
  });

  it("rejects anonymous extraction draft list reads", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  describe("background source processing", () => {
    async function registerWordlistSource(app: ReturnType<typeof createServer>, title: string): Promise<string> {
      const registered = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1"),
        payload: { kind: "wordlist", title, rawText: "mira = river\nsaku = child" }
      });
      expect(registered.statusCode).toBe(201);
      return registered.json().id as string;
    }

    async function fetchStoredSource(app: ReturnType<typeof createServer>, sourceId: string) {
      const sources = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1")
      });
      expect(sources.statusCode).toBe(200);
      return sources.json().find((item: { id: string }) => item.id === sourceId);
    }

    it("imports Obsidian Markdown files as pending text sources", async () => {
      const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const vaultPath = await mkdtemp(join(tmpdir(), "assini-vault-"));
      process.env.ASSINI_OBSIDIAN_VAULT_ROOTS = vaultPath;
      await writeFile(
        join(vaultPath, "Story.md"),
        "---\ntags: [river]\n---\n[[mira|river]] water note\n![[field-image.png]]",
        "utf8"
      );
      await writeFile(join(vaultPath, "Empty.md"), "---\ntags: [empty]\n---\n", "utf8");

      try {
        const response = await app.inject({
          method: "POST",
          url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
          headers: authHeaders("reviewer-1"),
          payload: {
            vaultPath,
            includeSubfolders: true,
            maxFiles: 10
          }
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().summary).toMatchObject({ scanned: 2, imported: 1, skipped: 1 });
        expect(response.json().imported[0]).toMatchObject({
          kind: "text",
          title: "Story",
          status: "pending",
          rawText: "river water note\nfield-image.png"
        });
        expect(response.json().skipped[0]).toMatchObject({ path: "Empty.md" });

        const audit = await app.inject({
          method: "GET",
          url: "/audit/events",
          headers: authHeaders("programmer-1")
        });
        expect(audit.statusCode).toBe(200);
        const importEvent = audit.json().find((event: { action: string }) => event.action === "source_asset.obsidian_vault_imported");
        expect(importEvent).toBeDefined();
        expect(importEvent.summary).toContain(basename(vaultPath));
        expect(importEvent.summary).not.toContain(vaultPath);
        expect(importEvent.metadata).toMatchObject({ vaultName: basename(vaultPath), imported: 1, skipped: 1 });
        expect(importEvent.metadata).not.toHaveProperty("vaultPath");

        const sources = await app.inject({
          method: "GET",
          url: `/languages/${TEST_LANGUAGE_ID}/sources`,
          headers: authHeaders("reviewer-1")
        });
        expect(sources.statusCode).toBe(200);
        expect(sources.json().some((source: { title: string }) => source.title === "Story")).toBe(true);
      } finally {
        restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
      }
    });

    it("rejects Obsidian vault paths outside ASSINI_OBSIDIAN_VAULT_ROOTS with 400", async () => {
      const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
      const outsideVault = await mkdtemp(join(tmpdir(), "assini-outside-"));
      process.env.ASSINI_OBSIDIAN_VAULT_ROOTS = allowedRoot;
      await writeFile(join(outsideVault, "Secret.md"), "should not import", "utf8");

      try {
        const app = createServer({ initialState: buildTestWorkspaceState() });
        const response = await app.inject({
          method: "POST",
          url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
          headers: authHeaders("reviewer-1"),
          payload: {
            vaultPath: outsideVault,
            includeSubfolders: true,
            maxFiles: 10
          }
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error).toMatch(/ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/);
      } finally {
        restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
      }
    });

    it("rejects Obsidian vault import when ASSINI_OBSIDIAN_VAULT_ROOTS is unset", async () => {
      const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      delete process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      const vaultPath = await mkdtemp(join(tmpdir(), "assini-vault-"));
      await writeFile(join(vaultPath, "Note.md"), "note text", "utf8");

      try {
        const app = createServer({ initialState: buildTestWorkspaceState() });
        const response = await app.inject({
          method: "POST",
          url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
          headers: authHeaders("reviewer-1"),
          payload: {
            vaultPath,
            includeSubfolders: true,
            maxFiles: 10
          }
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error).toMatch(/ASSINI_OBSIDIAN_VAULT_ROOTS is set/);
      } finally {
        restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
      }
    });

    it("accepts async processing with 202, then persists drafts and the processed status", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Background word list");

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });

      expect(accepted.statusCode).toBe(202);
      expect(accepted.json()).toMatchObject({
        asset: { id: sourceId, status: "processing" },
        drafts: [],
        warnings: []
      });

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, sourceId);
        expect(stored.status).toBe("processed");
      });

      const stored = await fetchStoredSource(app, sourceId);
      expect(stored.error).toBeUndefined();
      expect(typeof stored.processedAt).toBe("string");

      const drafts = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
        headers: authHeaders("reviewer-1")
      });
      expect(drafts.statusCode).toBe(200);
      const sourceDrafts = drafts.json().filter((draft: { sourceAssetId: string }) => draft.sourceAssetId === sourceId);
      expect(sourceDrafts.length).toBeGreaterThanOrEqual(2);

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("programmer-1")
      });
      expect(audit.statusCode).toBe(200);
      const actions = audit.json().map((event: { action: string }) => event.action);
      expect(actions).toContain("source_asset.process_started");
      expect(actions).toContain("source_asset.processed");
    });

    it("records a failed status and sanitized error when background extraction throws", async () => {
      const baseState = buildTestWorkspaceState();
      const documentAssetId = "source-async-unsupported-document";
      const app = createServer({
        initialState: {
          ...baseState,
          sourceAssets: [
            ...baseState.sourceAssets,
            {
              id: documentAssetId,
              languageId: TEST_LANGUAGE_ID,
              kind: "document" as const,
              title: "Legacy ebook",
              originalName: "notes.epub",
              filePath: "assets/testlang/notes.epub",
              status: "pending" as const,
              createdBy: "reviewer-1",
              createdAt: "2026-06-09T00:00:00.000Z"
            }
          ]
        }
      });

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${documentAssetId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(accepted.statusCode).toBe(202);
      expect(accepted.json().asset.status).toBe("processing");

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, documentAssetId);
        expect(stored.status).toBe("failed");
      });

      const stored = await fetchStoredSource(app, documentAssetId);
      expect(stored.error).toMatch(/not supported yet/);

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("programmer-1")
      });
      expect(audit.statusCode).toBe(200);
      const actions = audit.json().map((event: { action: string }) => event.action);
      expect(actions).toContain("source_asset.process_failed");
    });

    it("returns 409 in both modes while a source is already processing", async () => {
      let release: (value: string) => void = () => {};
      const blocked = new Promise<string>((resolve) => {
        release = resolve;
      });
      const llmProvider: LlmProvider = {
        name: "blocking-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return blocked;
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Slow word list");

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(accepted.statusCode).toBe(202);

      const conflictAsync = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(conflictAsync.statusCode).toBe(409);
      expect(conflictAsync.json()).toMatchObject({
        error: expect.stringContaining("already processing"),
        i18nKey: "ingest.sourceAlreadyProcessing"
      });

      const conflictSync = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(conflictSync.statusCode).toBe(409);
      expect(conflictSync.json()).toMatchObject({
        error: expect.stringContaining("already processing"),
        i18nKey: "ingest.sourceAlreadyProcessing"
      });

      release(JSON.stringify({ summary: "Done.", lexemes: [{ form: "mira", gloss: "river" }] }));

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, sourceId);
        expect(stored.status).toBe("processed");
      });
    });

    it("keeps the synchronous response shape when async is not requested", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Synchronous word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });

      expect(processed.statusCode).toBe(200);
      expect(processed.json().asset).toMatchObject({ id: sourceId, status: "processed" });
      expect(processed.json().drafts.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(processed.json().warnings)).toBe(true);
    });

    it("increments processingAttempts and sets processingStartedAt when a source is claimed", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Attempt-tracked word list");

      const first = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().asset).toMatchObject({
        id: sourceId,
        status: "processed",
        processingAttempts: 1
      });
      expect(typeof first.json().asset.processingStartedAt).toBe("string");
      expect(typeof first.json().asset.processingHeartbeatAt).toBe("string");

      const second = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().asset).toMatchObject({
        id: sourceId,
        status: "processed",
        processingAttempts: 2
      });
      expect(typeof second.json().asset.processingStartedAt).toBe("string");
      expect(typeof second.json().asset.processingHeartbeatAt).toBe("string");
    });

    it("returns 409 with i18n metadata when processingAttempts reaches the max", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Max-attempt word list");

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: `/sources/${sourceId}/process`,
          headers: authHeaders("reviewer-1")
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().asset).toMatchObject({
          id: sourceId,
          status: "processed",
          processingAttempts: attempt
        });
      }

      const refused = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({
        error: "Source processing attempt limit reached (5).",
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: 5, count: 5 }
      });
    });

    it("returns 409 for a concurrent synchronous process request", async () => {
      let release: (value: string) => void = () => {};
      let markStarted: () => void = () => {};
      const blocked = new Promise<string>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const llmProvider: LlmProvider = {
        name: "blocking-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          markStarted();
          return blocked;
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Slow sync word list");

      const firstRequest = app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      await started;

      const conflict = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        error: expect.stringContaining("already processing"),
        i18nKey: "ingest.sourceAlreadyProcessing"
      });

      release(JSON.stringify({ summary: "Done.", lexemes: [{ form: "mira", gloss: "river" }] }));
      const processed = await firstRequest;
      expect(processed.statusCode).toBe(200);
      expect(processed.json().asset).toMatchObject({ id: sourceId, status: "processed" });
    });

    it("persists source processing failures with audit-safe redacted secrets", async () => {
      const dir = await mkdtemp(join(tmpdir(), "assini-source-failure-"));
      const store = new JsonStore(join(dir, "local-db.json"));
      await store.write(buildTestWorkspaceState());
      const llmProvider: LlmProvider = {
        name: "secret-failing-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          throw new Error("Remote failure OPENAI_API_KEY=plain-provider-secret Bearer sk-route-secret");
        }
      };
      const app = createServer({ store, llmProvider });
      const sourceId = await registerWordlistSource(app, "Secret failure word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });

      expect(processed.statusCode).toBe(422);
      expect(processed.json().error).toBe("Remote failure [redacted-secret] [redacted-secret]");
      expect(JSON.stringify(processed.json())).not.toContain("plain-provider-secret");
      expect(JSON.stringify(processed.json())).not.toContain("sk-route-secret");

      const stored = await fetchStoredSource(app, sourceId);
      expect(stored).toMatchObject({
        id: sourceId,
        status: "failed",
        error: "Remote failure [redacted-secret] [redacted-secret]"
      });

      const audit = await app.inject({
        method: "GET",
        url: "/audit/events",
        headers: authHeaders("programmer-1")
      });
      expect(audit.statusCode).toBe(200);
      expect(audit.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: "source_asset.process_failed",
          metadata: { reason: "Remote failure [redacted-secret] [redacted-secret]" }
        })
      ]));
    });

    it("persists deterministic-mode warnings onto the source asset (sync path)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Deterministic word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().warnings.some((warning: string) => warning.includes("deterministic mode"))).toBe(true);

      const stored = await fetchStoredSource(app, sourceId);
      expect(Array.isArray(stored.warnings)).toBe(true);
      expect(stored.warnings.some((warning: string) => warning.includes("deterministic mode"))).toBe(true);
    });

    it("persists deterministic-mode warnings onto the source asset (async path)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Async deterministic word list");

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(accepted.statusCode).toBe(202);

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, sourceId);
        expect(stored.status).toBe("processed");
      });

      const stored = await fetchStoredSource(app, sourceId);
      expect(Array.isArray(stored.warnings)).toBe(true);
      expect(stored.warnings.some((warning: string) => warning.includes("deterministic mode"))).toBe(true);
    });

    it("leaves the warnings array unset when processing yields no warnings", async () => {
      const llmProvider: LlmProvider = {
        name: "clean-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return JSON.stringify({ summary: "Clean extraction.", lexemes: [{ form: "mira", gloss: "river" }] });
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Clean word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().warnings).toEqual([]);

      const stored = await fetchStoredSource(app, sourceId);
      expect(stored.status).toBe("processed");
      expect(stored.warnings).toBeUndefined();
    });
  });

  describe("server startup self-healing", () => {
    it("resets stuck processing source assets to failed on startup ready", async () => {
      const state = buildTestWorkspaceState();
      state.sourceAssets.push({
        id: "stuck-asset-id",
        languageId: TEST_LANGUAGE_ID,
        kind: "text",
        title: "Stuck raw source",
        status: "processing",
        createdBy: "reviewer-1",
        createdAt: new Date().toISOString()
      });

      const app = createServer({ initialState: state });
      await app.ready();

      const sources = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1")
      });
      const stuck = sources.json().find((item: { id: string }) => item.id === "stuck-asset-id");
      expect(stuck).toBeDefined();
      expect(stuck.status).toBe("failed");
      expect(stuck.error).toContain("interrupted by a server restart");

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("admin-1")
      });
      expect(audit.statusCode).toBe(200);
      const recoveryEvent = audit.json().find(
        (item: { action: string; entityId: string }) =>
          item.action === "source_asset.processing_recovered" && item.entityId === "stuck-asset-id"
      );
      expect(recoveryEvent).toBeDefined();
      expect(recoveryEvent.metadata).toEqual({ sourceId: "stuck-asset-id", previousStatus: "processing" });
    });

    it("allows a recovered source to be processed again", async () => {
      const state = buildTestWorkspaceState();
      state.sourceAssets.push({
        id: "stuck-asset-id",
        languageId: TEST_LANGUAGE_ID,
        kind: "wordlist",
        title: "Stuck word list",
        rawText: "mira = river",
        status: "processing",
        processingStartedAt: "2026-06-06T00:00:30.000Z",
        processingAttempts: 1,
        createdBy: "reviewer-1",
        createdAt: new Date().toISOString()
      });

      const app = createServer({ initialState: state });
      await app.ready();

      const processed = await app.inject({
        method: "POST",
        url: "/sources/stuck-asset-id/process",
        headers: authHeaders("reviewer-1")
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().asset.status).toBe("processed");
      expect(processed.json().asset.error).toBeUndefined();
      expect(processed.json().asset.processingAttempts).toBe(2);
    });
  });
});
