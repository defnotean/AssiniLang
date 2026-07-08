import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  applyRuntimeSettingsPatch,
  readRuntimeSettingsFromEnv,
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
      allowPrivateUrls: true
    });
    expect(JSON.stringify(settings)).not.toContain("secret-local-key");
    expect(JSON.stringify(settings)).not.toContain("secret-transcribe-key");
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
      OPENAI_API_KEY: "legacy-key"
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
    const env: Record<string, string | undefined> = { ASSINI_LLM_PROVIDER: "deterministic" };

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
});
