import type { RuntimeSettingsPatch } from "@assini/api-contract";
import { redactErrorSecrets } from "./secretRedaction.js";
import { assertOutboundHttpUrlAllowed } from "./urlSafety.js";
import { trimValue, type Env } from "./llmEnvShared.js";

export class RuntimeSettingsUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSettingsUrlValidationError";
  }
}

type RuntimeSettingsUrlFieldLabel =
  "LLM base URL" | "embedding base URL" | "transcription base URL" | "OCR base URL" | "Obsidian MCP endpoint URL";

export type StoredProfileUrlSettings = {
  baseUrl: string;
  embeddingBaseUrl: string;
  transcriptionBaseUrl: string;
  ocrBaseUrl: string;
  allowPrivateUrls: boolean;
};

function effectiveEnvForPatchValidation(patch: RuntimeSettingsPatch, env: Env): Env {
  if (patch.allowPrivateUrls === undefined) return env;
  return {
    ...env,
    ASSINI_ALLOW_PRIVATE_URLS: patch.allowPrivateUrls ? "1" : ""
  };
}

async function assertRuntimeSettingsUrlFieldAllowed(
  label: RuntimeSettingsUrlFieldLabel,
  url: string,
  env: Env
): Promise<URL> {
  try {
    return await assertOutboundHttpUrlAllowed(url, { env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RuntimeSettingsUrlValidationError(`Invalid ${label}: ${redactErrorSecrets(message)}`);
  }
}

export async function assertObsidianMcpEndpointAllowed(endpointUrl: string, env: Env, token?: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = await assertRuntimeSettingsUrlFieldAllowed("Obsidian MCP endpoint URL", endpointUrl, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/must not include credentials/i.test(message)) {
      throw new RuntimeSettingsUrlValidationError(
        "Invalid Obsidian MCP endpoint URL: URL credentials are not allowed. Use the token field instead."
      );
    }
    throw new RuntimeSettingsUrlValidationError(token ? message.split(token).join("[redacted-secret]") : message);
  }
  if (parsed.username || parsed.password) {
    throw new RuntimeSettingsUrlValidationError(
      "Invalid Obsidian MCP endpoint URL: URL credentials are not allowed. Use the token field instead."
    );
  }
}

export async function assertRuntimeSettingsPatchUrlsAllowed(
  patch: RuntimeSettingsPatch,
  env: Env = process.env
): Promise<void> {
  const validationEnv = effectiveEnvForPatchValidation(patch, env);

  const fields: Array<[RuntimeSettingsUrlFieldLabel, string | undefined]> = [
    ["LLM base URL", patch.baseUrl],
    ["transcription base URL", patch.transcriptionBaseUrl],
    ["embedding base URL", patch.embeddingBaseUrl],
    ["OCR base URL", patch.ocrBaseUrl]
  ];
  for (const [label, value] of fields) {
    const url = trimValue(value);
    if (url) await assertRuntimeSettingsUrlFieldAllowed(label, url, validationEnv);
  }
}

/** Validates the URLs a stored profile would actually persist (including inherited fields). */
export async function assertStoredProfileUrlsAllowed(profile: StoredProfileUrlSettings, env: Env): Promise<void> {
  const validationEnv: Env = {
    ...env,
    ASSINI_ALLOW_PRIVATE_URLS: profile.allowPrivateUrls ? "1" : ""
  };

  const fields: Array<[RuntimeSettingsUrlFieldLabel, string]> = [
    ["LLM base URL", profile.baseUrl],
    ["transcription base URL", profile.transcriptionBaseUrl],
    ["embedding base URL", profile.embeddingBaseUrl],
    ["OCR base URL", profile.ocrBaseUrl]
  ];
  for (const [label, value] of fields) {
    const url = trimValue(value);
    if (url) await assertRuntimeSettingsUrlFieldAllowed(label, url, validationEnv);
  }
}
