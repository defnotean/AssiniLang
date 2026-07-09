import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState } from "@assini/db";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

describe("LLM/runtime settings validation i18nKeys", () => {
  it("rejects invalid runtime settings bodies with i18nKey", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath: join(dir, ".env")
    });

    const response = await app.inject({
      method: "PUT",
      url: "/llm/settings",
      headers: authHeaders("programmer-1"),
      payload: { timeoutMs: -1, unknown: true }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid runtime settings body",
      i18nKey: "errors.invalidRuntimeSettingsBody"
    });
  });

  it("rejects private runtime URLs with i18nKey when allow-private is off", async () => {
    const previousAllowPrivate = process.env.ASSINI_ALLOW_PRIVATE_URLS;
    delete process.env.ASSINI_ALLOW_PRIVATE_URLS;

    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath
    });

    try {
      const response = await app.inject({
        method: "PUT",
        url: "/llm/settings",
        headers: authHeaders("programmer-1"),
        payload: { baseUrl: "http://127.0.0.1:11434/v1" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: expect.stringMatching(/Invalid LLM base URL:/),
        i18nKey: "errors.invalidRuntimeSettingsUrl"
      });
      expect(await readFile(settingsPath, "utf8")).not.toContain("ASSINI_LLM_BASE_URL=");
    } finally {
      restoreEnv("ASSINI_ALLOW_PRIVATE_URLS", previousAllowPrivate);
    }
  });

  it("rejects invalid model profile bodies with i18nKey", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath: join(dir, ".env")
    });

    const response = await app.inject({
      method: "POST",
      url: "/llm/model-profiles",
      headers: authHeaders("programmer-1"),
      payload: { provider: "ollama" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid model profile body",
      i18nKey: "errors.invalidModelProfileBody"
    });
  });

  it("rejects private URLs on model profile save with i18nKey", async () => {
    const previousAllowPrivate = process.env.ASSINI_ALLOW_PRIVATE_URLS;
    delete process.env.ASSINI_ALLOW_PRIVATE_URLS;

    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/llm/model-profiles",
        headers: authHeaders("programmer-1"),
        payload: {
          name: "Private Ollama",
          provider: "ollama",
          baseUrl: "http://127.0.0.1:11434/v1",
          timeoutMs: 30_000,
          maxTokens: 1024,
          jsonMode: false,
          transcriptionModel: "whisper-1",
          ocrModel: "llava",
          ocrLang: "eng",
          allowPrivateUrls: false
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: expect.stringMatching(/Invalid LLM base URL:/),
        i18nKey: "errors.invalidRuntimeSettingsUrl"
      });
      expect(await readFile(settingsPath, "utf8")).not.toContain("ASSINI_LLM_MODEL_PROFILES=");
    } finally {
      restoreEnv("ASSINI_ALLOW_PRIVATE_URLS", previousAllowPrivate);
    }
  });

  it("rejects blank model profile ids with i18nKey", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath: join(dir, ".env")
    });

    const activate = await app.inject({
      method: "PUT",
      url: "/llm/model-profiles/%20/activate",
      headers: authHeaders("programmer-1")
    });
    expect(activate.statusCode).toBe(400);
    expect(activate.json()).toEqual({
      error: "Invalid model profile id",
      i18nKey: "errors.invalidModelProfileId"
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: "/llm/model-profiles/%20",
      headers: authHeaders("programmer-1")
    });
    expect(deleted.statusCode).toBe(400);
    expect(deleted.json()).toEqual({
      error: "Invalid model profile id",
      i18nKey: "errors.invalidModelProfileId"
    });
  });

  it("returns modelProfileNotFound i18nKey for missing profiles", async () => {
    const previousProfiles = process.env.ASSINI_LLM_MODEL_PROFILES;
    delete process.env.ASSINI_LLM_MODEL_PROFILES;

    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath: join(dir, ".env")
    });

    try {
      const response = await app.inject({
        method: "PUT",
        url: "/llm/model-profiles/missing-profile/activate",
        headers: authHeaders("programmer-1")
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "Model profile not found: missing-profile",
        i18nKey: "errors.modelProfileNotFound"
      });
    } finally {
      restoreEnv("ASSINI_LLM_MODEL_PROFILES", previousProfiles);
    }
  });

  it("returns modelProfilesCorrupt i18nKey when stored profiles JSON is corrupt", async () => {
    const previousProfiles = process.env.ASSINI_LLM_MODEL_PROFILES;
    process.env.ASSINI_LLM_MODEL_PROFILES = "{not-json";

    const dir = await mkdtemp(join(tmpdir(), "assini-llm-val-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_MODEL_PROFILES={not-json\n", "utf8");
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      settingsPath
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/llm/model-profiles",
        headers: authHeaders("programmer-1"),
        payload: {
          name: "Repair needed",
          provider: "deterministic",
          timeoutMs: 1000,
          maxTokens: 256,
          jsonMode: false,
          transcriptionModel: "whisper-1",
          ocrModel: "llava",
          ocrLang: "eng",
          allowPrivateUrls: false
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "Stored model profiles JSON is corrupt and must be repaired before profiles can be changed.",
        i18nKey: "errors.modelProfilesCorrupt"
      });
      expect(process.env.ASSINI_LLM_MODEL_PROFILES).toBe("{not-json");
    } finally {
      restoreEnv("ASSINI_LLM_MODEL_PROFILES", previousProfiles);
    }
  });
});
