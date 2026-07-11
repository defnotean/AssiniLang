const SECRET_ENV_NAMES = [
  "ASSINI_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ASSINI_TRANSCRIBE_API_KEY",
  "ASSINI_OCR_API_KEY"
] as const;

export function redactConfiguredSecrets(message: string): string {
  let redacted = message;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value && value.length >= 8) {
      redacted = redacted.split(value).join("[redacted-secret]");
    }
  }
  return redacted;
}

export function redactErrorSecrets(message: string): string {
  return (
    redactConfiguredSecrets(message)
      .replace(/\bsk-[A-Za-z0-9._-]+/g, "[redacted-secret]")
      .replace(
        /\b(?:ASSINI_LLM_API_KEY|OPENAI_API_KEY|ASSINI_TRANSCRIBE_API_KEY|ASSINI_OCR_API_KEY)=\S+/g,
        "[redacted-secret]"
      )
      .replace(/\b(?:api[_-]?key|x-api-key|access[_-]?token|auth[_-]?token)=([^\s&]+)/gi, "[redacted-secret]")
      .replace(/\bx-api-key\s*[:=]\s*\S+/gi, "[redacted-secret]")
      .replace(/\bBearer\s+\S+/gi, "[redacted-secret]")
      // Strip URL userinfo (https://user:pass@host) before it reaches logs or client errors.
      .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[redacted-secret]@")
  );
}

/**
 * Pino/Fastify redact censor: keep diagnostic err.message text while scrubbing
 * secrets; fully censor known credential field paths.
 */
export function censorLogSecret(value: unknown, path?: readonly string[]): unknown {
  const leaf = Array.isArray(path) ? path[path.length - 1] : undefined;
  if (leaf === "message" && typeof value === "string") {
    return redactErrorSecrets(value);
  }
  return "[REDACTED]";
}
