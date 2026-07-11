import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  activateRuntimeModelProfile,
  applyObsidianMcpSettingsPatch,
  applyRuntimeSettingsPatch,
  deleteRuntimeModelProfile,
  normalizeProfileId,
  readObsidianMcpConnectionConfigFromEnv,
  readObsidianMcpSettingsFromEnv,
  readRuntimeSettingsFromEnv,
  RuntimeModelProfilesCorruptError,
  RuntimeSettingsUrlValidationError,
  saveRuntimeModelProfile,
  writeEnvFileAtomically,
  updateEnvFileText
} from "./appSettings.js";

describe("runtime app settings", () => {
  it("reads Obsidian MCP settings without returning the configured token", () => {
    const env = {
      ASSINI_OBSIDIAN_MCP_ENDPOINT_URL: "http://127.0.0.1:27124/mcp",
      ASSINI_OBSIDIAN_MCP_TOKEN: "mcp-settings-secret",
      ASSINI_OBSIDIAN_MCP_TIMEOUT_MS: "24000"
    };

    expect(readObsidianMcpSettingsFromEnv(env)).toEqual({
      endpointUrl: "http://127.0.0.1:27124/mcp",
      tokenConfigured: true,
      timeoutMs: 24_000
    });
    expect(readObsidianMcpConnectionConfigFromEnv(env)).toEqual({
      endpointUrl: "http://127.0.0.1:27124/mcp",
      token: "mcp-settings-secret",
      timeoutMs: 24_000
    });
    expect(JSON.stringify(readObsidianMcpSettingsFromEnv(env))).not.toContain("mcp-settings-secret");
  });

  it("persists and clears write-only Obsidian MCP settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "CUSTOM_VALUE=keep-me\n", "utf8");
    const env: Record<string, string | undefined> = { ASSINI_ALLOW_PRIVATE_URLS: "1" };

    const saved = await applyObsidianMcpSettingsPatch({
      settingsPath,
      env,
      patch: {
        endpointUrl: "http://127.0.0.1:27124/mcp",
        token: "persisted-mcp-secret",
        timeoutMs: 22_000
      }
    });
    expect(saved).toEqual({
      endpointUrl: "http://127.0.0.1:27124/mcp",
      tokenConfigured: true,
      timeoutMs: 22_000
    });
    expect(JSON.stringify(saved)).not.toContain("persisted-mcp-secret");
    expect(await readFile(settingsPath, "utf8")).toContain("ASSINI_OBSIDIAN_MCP_TOKEN=persisted-mcp-secret");

    const cleared = await applyObsidianMcpSettingsPatch({
      settingsPath,
      env,
      patch: { clearToken: true }
    });
    expect(cleared.tokenConfigured).toBe(false);
    expect(await readFile(settingsPath, "utf8")).toMatch(/ASSINI_OBSIDIAN_MCP_TOKEN=\s*(?:\n|$)/);
  });

  it("serializes MCP and LLM changes through the same atomic settings queue", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "CUSTOM_VALUE=keep-me\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    await Promise.all([
      applyRuntimeSettingsPatch({
        settingsPath,
        env,
        patch: { model: "queue-model", maxTokens: 2048 }
      }),
      applyObsidianMcpSettingsPatch({
        settingsPath,
        env,
        patch: {
          endpointUrl: "http://127.0.0.1:27124/mcp",
          token: "queue-mcp-secret",
          timeoutMs: 12_000
        }
      })
    ]);

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_LLM_MODEL=queue-model");
    expect(persisted).toContain("ASSINI_LLM_MAX_TOKENS=2048");
    expect(persisted).toContain("ASSINI_OBSIDIAN_MCP_ENDPOINT_URL=http://127.0.0.1:27124/mcp");
    expect(persisted).toContain("ASSINI_OBSIDIAN_MCP_TOKEN=queue-mcp-secret");
    expect(persisted).toContain("CUSTOM_VALUE=keep-me");
  });

  it("applies URL safety checks to persisted Obsidian MCP endpoints", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "CUSTOM_VALUE=keep-me\n", "utf8");

    await expect(
      applyObsidianMcpSettingsPatch({
        settingsPath,
        env: {},
        patch: { endpointUrl: "http://127.0.0.1:27124/mcp" }
      })
    ).rejects.toBeInstanceOf(RuntimeSettingsUrlValidationError);

    await expect(
      applyObsidianMcpSettingsPatch({
        settingsPath,
        env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
        patch: { endpointUrl: "http://user:password@127.0.0.1:27124/mcp" }
      })
    ).rejects.toMatchObject({
      message: "Invalid Obsidian MCP endpoint URL: URL credentials are not allowed. Use the token field instead."
    });

    await expect(
      applyObsidianMcpSettingsPatch({
        settingsPath,
        env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
        patch: {
          endpointUrl: "http://127.0.0.1:27124/embedded-mcp-secret",
          token: "embedded-mcp-secret"
        }
      })
    ).rejects.toMatchObject({
      message: "Invalid Obsidian MCP endpoint URL: configured tokens must use the token field only."
    });
    expect(await readFile(settingsPath, "utf8")).not.toContain("ASSINI_OBSIDIAN_MCP_ENDPOINT_URL");
  });

  it("reads sanitized settings from environment without exposing secret values", () => {
    const settings = readRuntimeSettingsFromEnv({
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_LLM_MODEL: "irene",
      ASSINI_LLM_API_KEY: "secret-local-key",
      ASSINI_LLM_TIMEOUT_MS: "180000",
      ASSINI_LLM_MAX_TOKENS: "8192",
      ASSINI_LLM_JSON_MODE: "1",
      ASSINI_EMBEDDING_BASE_URL: "https://embed.example/v1",
      ASSINI_EMBEDDING_MODEL: "embed-small",
      ASSINI_EMBEDDING_API_KEY: "secret-embedding-key",
      ASSINI_EMBEDDING_TIMEOUT_MS: "12000",
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
      embeddingBaseUrl: "https://embed.example/v1",
      embeddingModel: "embed-small",
      embeddingApiKeyConfigured: true,
      embeddingTimeoutMs: 12000,
      transcriptionApiKeyConfigured: true,
      ocrBaseUrl: "",
      ocrModel: "llava",
      ocrApiKeyConfigured: true,
      allowPrivateUrls: true
    });
    expect(JSON.stringify(settings)).not.toContain("secret-local-key");
    expect(JSON.stringify(settings)).not.toContain("secret-embedding-key");
    expect(JSON.stringify(settings)).not.toContain("secret-transcribe-key");
    expect(JSON.stringify(settings)).not.toContain("secret-ocr-key");
  });

  it("defaults dedicated embedding and OCR settings without enabling either service", () => {
    const settings = readRuntimeSettingsFromEnv({});

    expect(settings).toMatchObject({
      embeddingBaseUrl: "",
      embeddingModel: "",
      embeddingApiKeyConfigured: false,
      embeddingTimeoutMs: 30_000,
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
      ["# local settings", "ASSINI_LLM_PROVIDER=deterministic", "CUSTOM_VALUE=keep-me"].join("\n"),
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
    const next = updateEnvFileText(["ASSINI_LLM_API_KEY=local-secret", "OPENAI_API_KEY=remote-secret"].join("\n"), {
      ASSINI_LLM_API_KEY: "",
      OPENAI_API_KEY: ""
    });

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
        embeddingBaseUrl: "http://127.0.0.1:8080/v1",
        embeddingModel: "nomic-embed-text",
        embeddingApiKey: "dedicated-embedding-secret",
        embeddingTimeoutMs: 14_000,
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
    expect(persisted).toContain("ASSINI_EMBEDDING_BASE_URL=http://127.0.0.1:8080/v1");
    expect(persisted).toContain("ASSINI_EMBEDDING_MODEL=nomic-embed-text");
    expect(persisted).toContain("ASSINI_EMBEDDING_API_KEY=dedicated-embedding-secret");
    expect(persisted).toContain("ASSINI_EMBEDDING_TIMEOUT_MS=14000");
    expect(persisted).toContain("ASSINI_LLM_API_KEY=");
    expect(persisted).toContain("OPENAI_API_KEY=");
    expect(env.ASSINI_LLM_PROVIDER).toBe("openai-compatible");
    expect(env.OPENAI_API_KEY).toBe("");
    expect(response.settings.provider).toBe("openai-compatible");
    expect(response.settings.apiKeyConfigured).toBe(false);
    expect(response.settings).toMatchObject({
      embeddingBaseUrl: "http://127.0.0.1:8080/v1",
      embeddingModel: "nomic-embed-text",
      embeddingApiKeyConfigured: true,
      embeddingTimeoutMs: 14_000
    });
    expect(JSON.stringify(response)).not.toContain("dedicated-embedding-secret");
    expect(reloadCount).toBe(1);
  });

  it("clears remote credentials when the active provider and endpoint move to a LAN target", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(
      settingsPath,
      [
        "ASSINI_LLM_PROVIDER=openai",
        "ASSINI_LLM_BASE_URL=https://api.openai.com/v1",
        "ASSINI_LLM_API_KEY=remote-assini-secret",
        "OPENAI_API_KEY=remote-legacy-secret"
      ].join("\n"),
      "utf8"
    );
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "openai",
      ASSINI_LLM_BASE_URL: "https://api.openai.com/v1",
      ASSINI_LLM_API_KEY: "remote-assini-secret",
      OPENAI_API_KEY: "remote-legacy-secret",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    const response = await applyRuntimeSettingsPatch({
      settingsPath,
      env,
      patch: {
        provider: "openai-compatible",
        baseUrl: "http://192.168.1.40:8080/v1"
      }
    });

    const persisted = await readFile(settingsPath, "utf8");
    expect(response.settings.apiKeyConfigured).toBe(false);
    expect(env.ASSINI_LLM_API_KEY).toBe("");
    expect(env.OPENAI_API_KEY).toBe("");
    expect(persisted).not.toContain("remote-assini-secret");
    expect(persisted).not.toContain("remote-legacy-secret");
  });

  it("preserves credentials for canonical same-endpoint edits and accepts an explicit replacement", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_API_KEY=keep-secret\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:8080",
      ASSINI_LLM_API_KEY: "keep-secret",
      OPENAI_API_KEY: "legacy-secret",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    await applyRuntimeSettingsPatch({
      settingsPath,
      env,
      patch: {
        baseUrl: "http://127.0.0.1:8080/v1/",
        model: "same-endpoint-model"
      }
    });

    expect(env.ASSINI_LLM_API_KEY).toBe("keep-secret");
    expect(env.OPENAI_API_KEY).toBe("legacy-secret");

    await applyRuntimeSettingsPatch({
      settingsPath,
      env,
      patch: { baseUrl: "http://127.0.0.1:8081/v1" }
    });

    expect(env.ASSINI_LLM_API_KEY).toBe("");
    expect(env.OPENAI_API_KEY).toBe("");

    env.OPENAI_API_KEY = "stale-legacy-secret";
    await applyRuntimeSettingsPatch({
      settingsPath,
      env,
      patch: {
        provider: "ollama",
        apiKey: "replacement-secret"
      }
    });

    expect(env.ASSINI_LLM_API_KEY).toBe("replacement-secret");
    expect(env.OPENAI_API_KEY).toBe("");
  });

  it("leaves no temporary file after an atomic settings write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");

    await writeEnvFileAtomically(settingsPath, "ASSINI_LLM_PROVIDER=openai-compatible\n");

    expect(await readFile(settingsPath, "utf8")).toBe("ASSINI_LLM_PROVIDER=openai-compatible\n");
    expect(await readdir(dir)).toEqual([".env"]);
  });

  it("cleans up the temporary file and leaves the destination unchanged when rename fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, "destination");
    await mkdir(settingsPath);

    await expect(writeEnvFileAtomically(settingsPath, "replacement\n")).rejects.toBeDefined();

    expect((await readdir(dir)).filter((name) => name === "destination")).toEqual(["destination"]);
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
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

    await expect(
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { baseUrl: "http://127.0.0.1:11434/v1" },
        env
      })
    ).rejects.toBeInstanceOf(RuntimeSettingsUrlValidationError);

    await expect(
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { transcriptionBaseUrl: "http://127.0.0.1:9000/v1" },
        env
      })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid transcription base URL:/)
    });

    await expect(
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { embeddingBaseUrl: "http://127.0.0.1:8081/v1" },
        env
      })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid embedding base URL:/)
    });

    await expect(
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { ocrBaseUrl: "http://127.0.0.1:8080/v1" },
        env
      })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid OCR base URL:/)
    });

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).not.toContain("ASSINI_LLM_BASE_URL=");
    expect(persisted).not.toContain("ASSINI_TRANSCRIBE_BASE_URL=");
    expect(persisted).not.toContain("ASSINI_EMBEDDING_BASE_URL=");
    expect(persisted).not.toContain("ASSINI_OCR_BASE_URL=");
    expect(env.ASSINI_LLM_BASE_URL).toBeUndefined();
    expect(env.ASSINI_TRANSCRIBE_BASE_URL).toBeUndefined();
    expect(env.ASSINI_EMBEDDING_BASE_URL).toBeUndefined();
    expect(env.ASSINI_OCR_BASE_URL).toBeUndefined();
  });

  it("redacts URL userinfo from runtime settings URL validation errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = { ASSINI_LLM_PROVIDER: "deterministic" };

    await expect(
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: { baseUrl: "https://user:url-pass-secret@%zz" },
        env
      })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid LLM base URL:.*\[redacted-secret\]/)
    });

    try {
      await applyRuntimeSettingsPatch({
        settingsPath,
        patch: { baseUrl: "https://user:url-pass-secret@%zz" },
        env
      });
    } catch (error) {
      expect((error as Error).message).not.toContain("url-pass-secret");
    }
  });

  it("validates private URLs against allowPrivateUrls in the same settings patch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = { ASSINI_LLM_PROVIDER: "deterministic" };

    const accepted = await applyRuntimeSettingsPatch({
      settingsPath,
      patch: {
        allowPrivateUrls: true,
        baseUrl: "http://127.0.0.1:11434/v1"
      },
      env
    });
    expect(accepted.settings).toMatchObject({
      allowPrivateUrls: true,
      baseUrl: "http://127.0.0.1:11434/v1"
    });

    await expect(
      applyRuntimeSettingsPatch({
        settingsPath,
        patch: {
          allowPrivateUrls: false,
          ocrBaseUrl: "http://127.0.0.1:8080/v1"
        },
        env
      })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid OCR base URL:/)
    });
  });

  it("rejects private URLs when saving a model profile without allow-private", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = { ASSINI_LLM_PROVIDER: "deterministic" };

    await expect(
      saveRuntimeModelProfile({
        settingsPath,
        env,
        payload: {
          name: "Blocked private",
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:11434/v1",
          timeoutMs: 30_000,
          maxTokens: 1024,
          jsonMode: false,
          transcriptionModel: "whisper-1",
          ocrModel: "llava",
          ocrLang: "eng",
          allowPrivateUrls: false
        }
      })
    ).rejects.toBeInstanceOf(RuntimeSettingsUrlValidationError);

    expect(env.ASSINI_LLM_MODEL_PROFILES).toBeUndefined();
    expect(await readFile(settingsPath, "utf8")).not.toContain("ASSINI_LLM_MODEL_PROFILES=");
  });

  it("rejects inherited private profile URLs when allowPrivateUrls is false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "deterministic",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    await expect(
      saveRuntimeModelProfile({
        settingsPath,
        env,
        payload: {
          name: "Inherit blocked",
          provider: "openai-compatible",
          timeoutMs: 30_000,
          maxTokens: 1024,
          jsonMode: false,
          transcriptionModel: "whisper-1",
          ocrModel: "llava",
          ocrLang: "eng",
          allowPrivateUrls: false
        }
      })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Invalid LLM base URL:/)
    });
  });

  it("accepts private profile URLs when the payload enables allowPrivateUrls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=deterministic\n", "utf8");
    const env: Record<string, string | undefined> = { ASSINI_LLM_PROVIDER: "deterministic" };

    const saved = await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        name: "Local private",
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        timeoutMs: 30_000,
        maxTokens: 1024,
        jsonMode: false,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: true
      }
    });

    expect(saved.profiles[0]).toMatchObject({
      name: "Local private",
      baseUrl: "http://127.0.0.1:11434/v1",
      allowPrivateUrls: true
    });
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
        embeddingBaseUrl: "http://127.0.0.1:8080/v1",
        embeddingModel: "nomic-embed-text",
        embeddingApiKey: "profile-embedding-secret",
        embeddingTimeoutMs: 12_000,
        timeoutMs: 180000,
        maxTokens: 8192,
        jsonMode: true,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: true,
        activate: true
      }
    });

    expect(saved.activeProfileId).toBe("irene-local");
    expect(saved.settings.model).toBe("irene-fusion");
    expect(saved.profiles[0]).toMatchObject({
      id: "irene-local",
      name: "Irene local",
      apiKeyConfigured: true,
      embeddingBaseUrl: "http://127.0.0.1:8080/v1",
      embeddingModel: "nomic-embed-text",
      embeddingApiKeyConfigured: true,
      embeddingTimeoutMs: 12_000
    });
    expect(JSON.stringify(saved)).not.toContain("profile-secret");
    expect(JSON.stringify(saved)).not.toContain("profile-embedding-secret");
    expect(env.ASSINI_LLM_API_KEY).toBe("profile-secret");
    expect(env.ASSINI_EMBEDDING_API_KEY).toBe("profile-embedding-secret");
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
        embeddingBaseUrl: "http://127.0.0.1:1234/v1",
        embeddingModel: "studio-embed",
        clearEmbeddingApiKey: true,
        embeddingTimeoutMs: 9_000,
        timeoutMs: 90000,
        maxTokens: 4096,
        jsonMode: false,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: true
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
      model: "irene-small",
      embeddingBaseUrl: "http://127.0.0.1:1234/v1",
      embeddingModel: "studio-embed",
      embeddingApiKeyConfigured: false,
      embeddingTimeoutMs: 9_000
    });
    expect(env.ASSINI_LLM_API_KEY).toBe("");
    expect(env.ASSINI_EMBEDDING_API_KEY).toBe("");
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
      apiKeyConfigured: false,
      embeddingBaseUrl: "",
      embeddingModel: "",
      embeddingApiKeyConfigured: false,
      embeddingTimeoutMs: 30_000
    });
    expect(env.ASSINI_LLM_PROVIDER).toBe("deterministic");
    expect(env.ASSINI_LLM_BASE_URL).toBe("");
    expect(env.ASSINI_LLM_MODEL).toBe("");
    expect(env.ASSINI_LLM_API_KEY).toBe("");
    expect(env.ASSINI_EMBEDDING_BASE_URL).toBe("");
    expect(env.ASSINI_EMBEDDING_MODEL).toBe("");
    expect(env.ASSINI_EMBEDDING_API_KEY).toBe("");
    expect(env.ASSINI_LLM_ACTIVE_PROFILE_ID).toBe("");
    expect(reloadCount).toBe(3);

    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_LLM_PROVIDER=deterministic");
    expect(persisted).toMatch(/ASSINI_LLM_BASE_URL=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_LLM_MODEL=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_LLM_API_KEY=\s*(?:\n|$)/);
    expect(persisted).toMatch(/ASSINI_LLM_ACTIVE_PROFILE_ID=\s*(?:\n|$)/);
  });

  it("does not inherit an active remote key into a new LAN profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=openai\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "openai",
      ASSINI_LLM_BASE_URL: "https://api.openai.com/v1",
      ASSINI_LLM_API_KEY: "remote-profile-secret",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };

    const saved = await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        id: "lan-target",
        name: "LAN target",
        provider: "openai-compatible",
        baseUrl: "http://192.168.1.50:8080/v1",
        model: "local-model",
        timeoutMs: 30_000,
        maxTokens: 1024,
        jsonMode: false,
        transcriptionModel: "whisper-1",
        ocrModel: "llava",
        ocrLang: "eng",
        allowPrivateUrls: true
      }
    });

    const storedProfiles = JSON.parse(env.ASSINI_LLM_MODEL_PROFILES ?? "[]") as Array<{ apiKey?: string }>;
    expect(saved.profiles[0]?.apiKeyConfigured).toBe(false);
    expect(storedProfiles[0]?.apiKey).toBeUndefined();
    expect(env.ASSINI_LLM_API_KEY).toBe("remote-profile-secret");
  });

  it("binds active profile credentials to both provider and canonical endpoint identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-settings-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_PROVIDER=openai-compatible\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_PROVIDER: "openai-compatible",
      ASSINI_LLM_BASE_URL: "http://127.0.0.1:11434",
      ASSINI_LLM_API_KEY: "bound-secret",
      ASSINI_ALLOW_PRIVATE_URLS: "1"
    };
    const basePayload = {
      id: "bound-profile",
      name: "Bound profile",
      provider: "openai-compatible" as const,
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "local-model",
      timeoutMs: 30_000,
      maxTokens: 1024,
      jsonMode: false,
      transcriptionModel: "whisper-1",
      ocrModel: "llava",
      ocrLang: "eng",
      allowPrivateUrls: true,
      activate: true
    };

    const created = await saveRuntimeModelProfile({ settingsPath, env, payload: basePayload });
    expect(created.profiles[0]?.apiKeyConfigured).toBe(true);
    expect(env.ASSINI_LLM_API_KEY).toBe("bound-secret");

    const sameEndpoint = await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        ...basePayload,
        baseUrl: "http://127.0.0.1:11434",
        model: "edited-model"
      }
    });
    expect(sameEndpoint.profiles[0]?.apiKeyConfigured).toBe(true);
    expect(env.ASSINI_LLM_API_KEY).toBe("bound-secret");

    const changedProvider = await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        ...basePayload,
        provider: "ollama"
      }
    });
    expect(changedProvider.profiles[0]?.apiKeyConfigured).toBe(false);
    expect(env.ASSINI_LLM_API_KEY).toBe("");

    const replacement = await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        ...basePayload,
        provider: "ollama",
        apiKey: "new-bound-secret"
      }
    });
    expect(replacement.profiles[0]?.apiKeyConfigured).toBe(true);
    expect(env.ASSINI_LLM_API_KEY).toBe("new-bound-secret");

    const changedEndpoint = await saveRuntimeModelProfile({
      settingsPath,
      env,
      payload: {
        ...basePayload,
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11435/v1"
      }
    });
    expect(changedEndpoint.profiles[0]?.apiKeyConfigured).toBe(false);
    expect(env.ASSINI_LLM_API_KEY).toBe("");
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
        allowPrivateUrls: true,
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
        allowPrivateUrls: true
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
    await writeFile(settingsPath, "ASSINI_LLM_MODEL_PROFILES={not-json\n", "utf8");
    const env: Record<string, string | undefined> = {
      ASSINI_LLM_MODEL_PROFILES: "{not-json"
    };

    await expect(
      saveRuntimeModelProfile({
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
      })
    ).rejects.toBeInstanceOf(RuntimeModelProfilesCorruptError);

    expect(env.ASSINI_LLM_MODEL_PROFILES).toBe("{not-json");
  });
});
