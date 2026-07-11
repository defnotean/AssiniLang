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
import { verifyExportIntegrity } from "./publicLanguageViews.js";
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
          return new Response(
            JSON.stringify({
              data: [{ id: "irene-fusion" }]
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
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
        expect(response.json().models).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              provider: "openai-compatible",
              baseUrl: "http://irene-box:8080/v1",
              model: "irene-fusion"
            })
          ])
        );
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
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        completionBodies.push(body);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Irene is connected." } }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
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
        expect(rejected.json()).toEqual({
          error: expect.stringMatching(/Invalid OCR base URL:/),
          i18nKey: "errors.invalidRuntimeSettingsUrl"
        });
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
    expect(profile.json().morphemeInventory.find((item: { surface: string }) => item.surface === "saku")).toMatchObject(
      {
        lemma: "saku",
        glosses: ["child"],
        features: ["noun"],
        occurrenceCount: 2,
        passageIds: expect.arrayContaining(["testlang-c002", "testlang-c003"]),
        vocabulary: expect.objectContaining({
          form: "saku",
          partOfSpeech: "noun"
        })
      }
    );
    expect(profile.json().stats.exerciseTypes).toMatchObject({
      translate_to_target: 1,
      segment: 1,
      choose_particle: 1
    });
    expect(JSON.stringify(profile.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(profile.json())).not.toContain("gradingExplanation");

    const missing = await app.inject({ method: "GET", url: "/languages/not-a-language/profile" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
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
    expect(audit.json().every((event: { languageId: string | null }) => event.languageId !== TEST_LANGUAGE_ID)).toBe(
      true
    );
  });

  it("returns 404 when deleting a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "DELETE",
      url: "/languages/not-a-language",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("restricts browser CORS to configured local development origins", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState(), allowedOrigins: ["http://localhost:5173"] });

    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://example.invalid" }
    });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
    expect(blocked.headers["access-control-allow-credentials"]).toBeUndefined();

    const noOrigin = await app.inject({ method: "GET", url: "/health" });
    expect(noOrigin.statusCode).toBe(200);
    expect(noOrigin.headers["access-control-allow-origin"]).toBeUndefined();

    const nullOrigin = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "null" }
    });
    expect(nullOrigin.headers["access-control-allow-origin"]).toBeUndefined();

    const wildcardOrigin = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "*" }
    });
    expect(wildcardOrigin.headers["access-control-allow-origin"]).toBeUndefined();

    const preflightAllowed = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-assini-user-id"
      }
    });
    expect(preflightAllowed.statusCode).toBe(204);
    expect(preflightAllowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(preflightAllowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(preflightAllowed.headers["access-control-allow-methods"] ?? "")).toMatch(/POST/);

    const preflightBlocked = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "https://example.invalid",
        "access-control-request-method": "POST"
      }
    });
    expect(preflightBlocked.headers["access-control-allow-origin"]).toBeUndefined();
    expect(preflightBlocked.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("rejects wildcard, null, and empty createServer CORS allow-lists", () => {
    expect(() => createServer({ initialState: buildTestWorkspaceState(), allowedOrigins: ["*"] })).toThrow(
      /wildcard|null/
    );
    expect(() => createServer({ initialState: buildTestWorkspaceState(), allowedOrigins: ["null"] })).toThrow(
      /wildcard|null/
    );
    expect(() => createServer({ initialState: buildTestWorkspaceState(), allowedOrigins: [] })).toThrow(
      "allowedOrigins must include at least one origin"
    );
  });

  it("keeps prototype session auth explicit, cookie scoped, and non-admin", async () => {
    const disabled = createServer({ initialState: buildTestWorkspaceState() });

    const disabledResponse = await disabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "elder-1" }
    });
    expect(disabledResponse.statusCode).toBe(404);
    expect(disabledResponse.json()).toEqual({
      error: "Prototype auth is disabled",
      i18nKey: "errors.prototypeAuthDisabled"
    });

    const enabled = createServer({ initialState: buildTestWorkspaceState(), enablePrototypeAuth: true });
    const invalidBody = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "   " }
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json()).toEqual({
      error: "Invalid prototype session body",
      i18nKey: "errors.invalidPrototypeSessionBody"
    });

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
    expect(leadSession.json()).toEqual({
      error: "Forbidden",
      i18nKey: "errors.prototypeAuthForbidden"
    });

    const adminSession = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "admin-1" }
    });
    expect(adminSession.statusCode).toBe(403);
    expect(adminSession.json()).toEqual({
      error: "Forbidden",
      i18nKey: "errors.prototypeAuthForbidden"
    });

    const unknownUser = await enabled.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "not-a-user" }
    });
    expect(unknownUser.statusCode).toBe(403);
    expect(unknownUser.json()).toEqual({
      error: "Forbidden",
      i18nKey: "errors.prototypeAuthForbidden"
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

    const neuralMapMissingLanguage = await app.inject({
      method: "GET",
      url: "/observability/neural-map",
      headers: authHeaders("programmer-1")
    });
    expect(neuralMapMissingLanguage.statusCode).toBe(400);
    expect(neuralMapMissingLanguage.json()).toEqual({
      error: "Missing languageId",
      i18nKey: "errors.missingLanguageId"
    });

    const neuralMapUnknownLanguage = await app.inject({
      method: "GET",
      url: "/observability/neural-map?languageId=not-a-language",
      headers: authHeaders("programmer-1")
    });
    expect(neuralMapUnknownLanguage.statusCode).toBe(404);
    expect(neuralMapUnknownLanguage.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });

    const payload = { languageId: TEST_LANGUAGE_ID, mode: "learner_practice", seedPrompt: "Practice safely." };
    const first = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });
    const second = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload
    });
    const third = await app.inject({ method: "POST", url: "/ai/sessions", headers: authHeaders("learner-1"), payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBe("60");
    const rateLimitRequestId = third.headers["x-request-id"];
    expect(rateLimitRequestId).toEqual(expect.any(String));
    expect(third.json()).toEqual({
      error: "Rate limit exceeded",
      i18nKey: "app.rateLimitExceeded",
      i18nParams: { seconds: 60 },
      requestId: rateLimitRequestId
    });

    now += 60_001;
    const afterWindow = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload
    });
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
            payload: {
              ...emptyPayload,
              topic: "phonology/vowel-harmony",
              explanation: "Vowels agree across suffixes."
            },
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
    expect(byId.get("draft-topic-duplicate")?.duplicate).toEqual({
      kind: "topic",
      entityId: "testlang-note-basic-order"
    });
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
});
