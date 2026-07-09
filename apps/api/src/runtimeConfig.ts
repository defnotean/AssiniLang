import type { FastifyServerOptions } from "fastify";
import { readAllowedOrigins } from "./corsOrigins.js";

export type RuntimeConfig = {
  host: string;
  port: number;
  allowedOrigins: string[];
  bodyLimitBytes: number;
  logger: FastifyServerOptions["logger"];
};

const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;
/** Align with the multipart upload cap so JSON bodies cannot exceed file-upload limits. */
const MAX_BODY_LIMIT_BYTES = 25 * 1024 * 1024;

function readOptionalString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function readHost(value: string | undefined): string {
  const host = readOptionalString(value, "127.0.0.1");
  if (/[\s/?#]/.test(host) || host.includes("://")) {
    throw new Error("HOST must be a hostname or IP address without scheme, path, or whitespace");
  }
  return host;
}

function readPositiveInteger(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  options: { min?: number; max?: number } = {}
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readLogger(value: string | undefined): FastifyServerOptions["logger"] {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function readRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  return {
    host: readHost(env.HOST),
    port: readPositiveInteger(env, "PORT", 4321, { min: 1, max: 65535 }),
    allowedOrigins: readAllowedOrigins(env.ASSINI_ALLOWED_ORIGINS),
    bodyLimitBytes: readPositiveInteger(env, "ASSINI_BODY_LIMIT_BYTES", DEFAULT_BODY_LIMIT_BYTES, {
      min: 1,
      max: MAX_BODY_LIMIT_BYTES
    }),
    logger: readLogger(env.ASSINI_API_LOGGER)
  };
}
