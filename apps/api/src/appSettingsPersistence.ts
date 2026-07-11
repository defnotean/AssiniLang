import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import type { Env } from "./llmEnvShared.js";

export const RUNTIME_ENV_KEYS = [
  "ASSINI_LLM_PROVIDER",
  "ASSINI_LLM_BASE_URL",
  "ASSINI_LLM_MODEL",
  "ASSINI_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ASSINI_LLM_TIMEOUT_MS",
  "ASSINI_LLM_MAX_TOKENS",
  "ASSINI_LLM_JSON_MODE",
  "ASSINI_EMBEDDING_BASE_URL",
  "ASSINI_EMBEDDING_MODEL",
  "ASSINI_EMBEDDING_API_KEY",
  "ASSINI_EMBEDDING_TIMEOUT_MS",
  "ASSINI_TRANSCRIBE_BASE_URL",
  "ASSINI_TRANSCRIBE_MODEL",
  "ASSINI_TRANSCRIBE_API_KEY",
  "ASSINI_OCR_BASE_URL",
  "ASSINI_OCR_MODEL",
  "ASSINI_OCR_API_KEY",
  "ASSINI_OCR_LANG",
  "ASSINI_ALLOW_PRIVATE_URLS",
  "ASSINI_LLM_ACTIVE_PROFILE_ID",
  "ASSINI_LLM_MODEL_PROFILES",
  "ASSINI_OBSIDIAN_MCP_ENDPOINT_URL",
  "ASSINI_OBSIDIAN_MCP_TOKEN",
  "ASSINI_OBSIDIAN_MCP_TIMEOUT_MS"
] as const;

export type RuntimeEnvKey = (typeof RUNTIME_ENV_KEYS)[number];
export type RuntimeEnvUpdates = Partial<Record<RuntimeEnvKey, string>>;

function formatEnvValue(value: string): string {
  if (value.length === 0) return "";
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function updateEnvFileText(existingText: string, updates: RuntimeEnvUpdates): string {
  const pending = new Map(Object.entries(updates));
  const seen = new Set<string>();
  const sourceLines =
    existingText.length > 0
      ? existingText.split(/\r?\n/)
      : ["# AssiniLang local configuration.", "# Edited by the Model Setup screen."];
  const nextLines = sourceLines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=).*/);
    const key = match?.[2];
    if (!key || !pending.has(key)) return line;

    seen.add(key);
    return `${key}=${formatEnvValue(pending.get(key) ?? "")}`;
  });

  for (const [key, value] of pending) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  return `${nextLines.join("\n").replace(/\n+$/g, "")}\n`;
}

/** Replaces the settings file only after the complete replacement has been written. */
export async function writeEnvFileAtomically(settingsPath: string, text: string): Promise<void> {
  const tempPath = `${settingsPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, settingsPath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Preserve the original write or rename failure if cleanup also fails.
    }
    throw error;
  }
}

export async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") return "";
    throw error;
  }
}

export function applyUpdatesToEnv(updates: RuntimeEnvUpdates, env: Env = process.env): void {
  for (const [key, value] of Object.entries(updates)) {
    env[key] = value ?? "";
  }
}
