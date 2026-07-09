import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  activateRuntimeModelProfile,
  applyRuntimeSettingsPatch,
  deleteRuntimeModelProfile,
  normalizeProfileId,
  readRuntimeSettingsFromEnv,
  RuntimeModelProfilesCorruptError,
  RuntimeSettingsUrlValidationError,
  saveRuntimeModelProfile,
  updateEnvFileText
} from "./appSettings.js";

describe("runtime app settings", () => {
  it("reads sanitized settings from environment without exposing secret values", () => {
    const settings = readRuntimeSettingsFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "irene",
      ASSINI_LLM_API_KEY: "secret-local-key",
      ASSINI_LLM_TIMEOUT_MS: "180000",
      ASSINI_LLM_MAX_TOKENS: "8192",
      ASSINI_LLM_JSON_MODE: "1",
      ASSINI_TRANSCRIBE_API_KEY: "secret-transcribe-key",
      ASSINI_OCR_API_KEY: "secret-ocr-key",
      ASSINI_ALLOW_PRIVATE_URLS: "true"
    });

    expect(settings).toMatchObject({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "irene",
      apiKeyConfigured: true,
      timeoutMs: 180000,
      maxTokens: 8192,
      jsonMode: true,
      transcriptionApiKeyConfigured: true,
      ocrBaseUrl: "",
      ocrModel: "llava",
      ocrApiKeyConfigured: true,
      allowPrivateUrls: true
    });
    expect(JSON.stringify(settings)).not.toContain("secret-local-key");
    expect(JSON.stringify(settings)).not.toContain("secret-transcribe-key");
    expect(JSON.stringify(settings)).not.toContain("secret-ocr-key");
  });

  it("defaults OCR settings to empty base URL, llava model, and no API key", () => {
    const settings = readRuntimeSettingsFromEnv({});

    expect(settings).toMatchObject({
      ocrBaseUrl: "",
      ocrModel: "llava",
      ocrApiKeyConfigured: false,
      ocrLang: "eng"
    });
  });

  it("keeps legacy OpenAI model and API key fallbacks sanitized", () => {
    const settings = readRuntimeSettingsFromEnv({
      OPENAI_MODEL: "gpt-4o-mini",
      OPENAI_API_KEY: "legacy-secret"
    });

    expect(settings.provider).toBe("deterministic");
    expect(settings.model).toBe("gpt-4o-mini");
    expect(settings.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("legacy-secret");
  });

  it("updates known .env keys while preserving comments and unknown values", () => {
    const next = updateEnvFileText(
      [
        "# local settings",
        "ASSINI_LLM_PROVIDER=deterministic",
        "CUSTOM_VALUE=keep-me"
      ].join("\n"),
      {
        ASSINI_LLM_PROVIDER: "openai-compatible",
        ASSINI_LLM_MODEL: "irene fusion",
        ASSINI_LLM_JSON_MODE: "1"
      }
    );

    expect(next).toContain("# local settings");
    expect(next).toContain("CUSTOM_VALUE=keep-me");
    expect(next).toContain("ASSINI_LLM_PROVIDER=openai-compatible");
    expect(next).toContain('ASSINI_LLM_MODEL="irene fusion"');
    expect(next).toContain("ASSINI_LLM_JSON_MODE=1");
  });

  it("clears both ASSINI_LLM_API_KEY and OPENAI_API_KEY when clearApiKey is set", () => {
    const next = updateEnvFileText(
      [
        "ASSINI_LLM_API_KEY=local-secret",
        "OPENAI_API_KEY=remote-secret"
      ].join("\n"),
      {
        ASSINI_LLM_API_KEY: "",
        OPENAI_API_KEY: ""
      }
    );

    expect(next).toContain("ASSINI_LLM_API_KEY=");
    expect(next).toContain("OPENAI_API_KEY=");
    expect(next).not.toContain("local-secret");
    expect(next).not.toContain("remote-secret");
  });

  it("writes settings to disk, updates process env, and invokes reload callback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\nOPENAI_API_KEY=legacy-key\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      OPENAI_API_KEY: "legacy-key",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };
    let reloadCount = 0;

    const response = await applyRuntimeSettingsPatch({
      settingsPath,
      patch: {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
        clearApiKey: true
      },
      env,
      reloadLlmProvider: () => {
        reloadCount += 1;
      }
    });

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_LLM_PROVIDER=openai-compatible");
    expect(persisted).toContain("ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1");
    expect(persisted).toContain("ASSINI_LLM_MODEL=llama3.1");
    expect(persisted).toContain("ASSINI_LLM_API_KEY=");
    expect(persisted).toContain("OPENAI_API_KEY=");
    expect(env.ASSINI_LLM_PROVIDER).toBe("openai-compatible");
    expect(env.OPENAI_API_KEY).toBe("");
    expect(response.settings.provider).toBe("openai-compatible");
    expect(response.settings.apiKeyConfigured).toBe(false);
    expect(reloadCount).toBe(1);
  });

  it("serializes concurrent settings writes so patches are not lost", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    await Promise.all([
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { model: "model-a" },
        env
      }),
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { baseUrl: "http://127.0.0.1:8080/v1" },
        env
      })
    ]);

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_LLM_MODEL=model-a");
    expect(persisted).toContain("ASSINI_LLM_BASE_URL=http://127.0.0.1:8080/v1");
    expect(env.ASSINI_LLM_MODEL).toBe("model-a");
    expect(env.ASSINI_LLM_BASE_URL).toBe("http://127.0.0.1:8080/v1");
  });

  it("rejects private runtime URLs when ASSINI_ALLOW_PRIVATE_URLS is unset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = { ASSINI_LLM_PROVIDER: "deterministic" };

    await expect(applyRuntimeSettingsPatch({
      settingsPath,
      patch: { baseUrl: "http://127.0.0.1:11434/v1" },
      env
    })).rejects.toBeInstanceOf(RuntimeSettingsUrlValidationError);

    await expect(applyRuntimeSettingsPatch({
      settingsPath,
      patch: { transcriptionBaseUrl: "http://127.0.0.1:9000/v1" },
      env
    })).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid transcription base URL:/)
    });

    await expect(applyRuntimeSettingsPatch({
      settingsPath,
      patch: { ocrBaseUrl: "http://127.0.0.1:8080/v1" },
      env
    })).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid OCR base URL:/)
    });

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).not.toContain("ASSINI_LLM_BASE_URL=");
    expect(persisted).not.toContain("ASSINI_TRANSCRIBE_BASE_URL=");
    expect(persisted).not.toContain("ASSINI_OCR_BASE_URL=");
    expect(env.ASSINI_LLM_BASE_URL).toBeUndefined();
    expect(env.ASSINI_TRANSCRIBE_BASE_URL).toBeUndefined();
    expect(env.ASSINI_OCR_BASE_URL).toBeUndefined();
  });

  it("accepts private runtime URLs when ASSINI_ALLOW_PRIVATE_URLS=1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    const response = await applyRuntimeSettingsPatch({
      settingsPath,
      patch: {
        baseUrl: "http://127.0.0.1:11434/v1",
        transcriptionBaseUrl: "http://127.0.0.1:9000/v1",
        ocrBaseUrl: "http://127.0.0.1:8080/v1"
      },
      env
    });

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1");
    expect(persisted).toContain("ASSINI_TRANSCRIBE_BASE_URL=http://127.0.0.1:9000/v1");
    expect(persisted).toContain("ASSINI_OCR_BASE_URL=http://127.0.0.1:8080/v1");
    expect(response.settings).toMatchObject({
      baseUrl: "http://127.0.0.1:11434/v1",
      transcriptionBaseUrl: "http://127.0.0.1:9000/v1",
      ocrBaseUrl: "http://127.0.0.1:8080/v1"
    });
  });

  it("allows empty runtime URLs to clear settings without validation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(
      settingsPath,
      [
        "ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1",
        "ASSINI_TRANSCRIBE_BASE_URL=http://127.0.0.1:9000/v1",
        "ASSINI_OCR_BASE_URL=http://127.0.0.1:8080/v1"
      ].join("\n"),
      "utf8"
    );
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_TRANSCRIBE_BASE_URL: "http://127.0.0.1:9000/v1",
      ASSINI_OCR_BASE_URL: "http://127.0.0.1:8080/v1"
    };

    const response = await applyRuntimeSettingsPatch({
      settingsPath,
      patch: {
        baseUrl: "",
        transcriptionBaseUrl: "",
        ocrBaseUrl: ""
      },
      env
    });

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toMatch(/ASSINI_LLM_BASE_URL=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_TRANSCRIBE_BASE_URL=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_OCR_BASE_URL=\s*(?:\n|$)/);
    expect(response.settings).toMatchObject({
      baseUrl: "",
      transcriptionBaseUrl: "",
      ocrBaseUrl: ""
    });
  });

  it("saves, activates, and deletes redacted runtime model profiles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };
    let reloadCount = 0;

    const saved = await saveRuntimeModelProfile({
      settingsPath,
      env,
      reloadLlmProvider: () => {
        reloadCount += 1;
      },
      payload: {
        id: "irene-local",
        name: "Irene local",
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "irene-fusion",
        apiKey: "profile-secret",
        timeoutMs: 180000,
        maxTokens: 8192,
        jsonMode: true,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: false,
        activate: true
      }
    });

    expect(saved.activeProfileId).toBe("irene-local");
    expect(saved.settings.model).toBe("irene-fusion");
    expect(saved.profiles[0]).toMatchObject({
      id: "irene-local",
      name: "Irene local",
      apiKeyConfigured: true
    });
    expect(JSON.stringify(saved)).not.toContain("profile-secret");
    expect(env.ASSINI_LLM_API_KEY).toBe("profile-secret");
    expect(reloadCount).toBe(1);

    await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        id: "studio-small",
        name: "Studio small",
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "irene-small",
        clearApiKey: true,
        timeoutMs: 90000,
        maxTokens: 4096,
        jsonMode: false,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: false
      }
    });

    const activated = await activateRuntimeModelProfile({
      settingsPath,
      env,
      profileId: "studio-small",
      reloadLlmProvider: () => {
        reloadCount += 1;
      }
    });

    expect(activated.activeProfileId).toBe("studio-small");
    expect(activated.settings).toMatchObject({
      provider: "lm-studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "irene-small"
    });
    expect(env.ASSINI_LLM_API_KEY).toBe("");
    expect(reloadCount).toBe(2);

    const deleted = await deleteRuntimeModelProfile({
      settingsPath,
      env,
      profileId: "studio-small",
      reloadLlmProvider: () => {
        reloadCount += 1;
      }
    });
    expect(deleted.activeProfileId).toBeUndefined();
    expect(deleted.profiles.map((profile) => profile.id)).toEqual(["irene-local"]);
    expect(deleted.settings).toMatchObject({
      provider: "deterministic",
      baseUrl: "",
      model: "",
      apiKeyConfigured: false
    });
    expect(env.ASSINI_LLM_PROVIDER).toBe("deterministic");
    expect(env.ASSINI_LLM_BASE_URL).toBe("");
    expect(env.ASSINI_LLM_MODEL).toBe("");
    expect(env.ASSINI_LLM_API_KEY).toBe("");
    expect(env.ASSINI_LLM_ACTIVE_PROFILE_ID).toBe("");
    expect(reloadCount).toBe(3);

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_LLM_PROVIDER=deterministic");
    expect(persisted).toMatch(/ASSINI_LLM_BASE_URL=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_LLM_MODEL=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_LLM_API_KEY=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_LLM_ACTIVE_PROFILE_ID=\s*(?:\n|$)/);
  });

  it("leaves live provider env intact when deleting a non-active profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };
    let reloadCount = 0;

    await saveRuntimeModelProfile({
      settingsPath,
      env,
      reloadLlmProvider: () => {
        reloadCount += 1;
      },
      payload: {
        id: "active-one",
        name: "Active one",
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "keep-me",
        apiKey: "keep-secret",
        timeoutMs: 180000,
        maxTokens: 8192,
        jsonMode: true,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: false,
        activate: true
      }
    });

    await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        id: "spare-one",
        name: "Spare one",
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "spare",
        clearApiKey: true,
        timeoutMs: 90000,
        maxTokens: 4096,
        jsonMode: false,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: false
      }
    });

    const deleted = await deleteRuntimeModelProfile({
      settingsPath,
      env,
      profileId: "spare-one",
      reloadLlmProvider: () => {
        reloadCount += 1;
      }
    });

    expect(deleted.activeProfileId).toBe("active-one");
    expect(deleted.settings).toMatchObject({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "keep-me",
      apiKeyConfigured: true
    });
    expect(env.ASSINI_LLM_PROVIDER).toBe("openai-compatible");
    expect(env.ASSINI_LLM_MODEL).toBe("keep-me");
    expect(env.ASSINI_LLM_API_KEY).toBe("keep-secret");
    expect(reloadCount).toBe(1);
  });

  it("normalizes empty-looking profile ids instead of persisting a blank id", () => {
    expect(normalizeProfileId("@@@")).toBe("");
    expect(normalizeProfileId(" Irene Local ")).toBe("Irene-Local");
  });

  it("refuses profile mutations when stored profiles JSON is corrupt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, 'ASSINI_LLM_MODEL_PROFILES={not-json\n', "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_MODEL_PROFILES: "{not-json"
    };

    await expect(saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        name: "Broken store",
        provider: "deterministic",
        timeoutMs: 1000,
        maxTokens: 256,
        jsonMode: false,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: false
      }
    })).rejects.toBeInstanceOf(RuntimeModelProfilesCorruptError);

    expect(env.ASSINI_LLM_MODEL_PROFILES).toBe("{not-json");
  });
});
