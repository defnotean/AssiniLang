import { readFileSync } from "node:fs";

type Env = Record<string, string | undefined>;

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export function loadRuntimeEnvFile(path: string, env: Env = process.env): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    const existing = env[key]?.trim();
    if (existing) continue;
    env[key] = parseEnvValue(match[2]);
  }
}
