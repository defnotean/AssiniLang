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
const INSECURE_NETWORK_AUTH_OVERRIDE = "ASSINI_ALLOW_INSECURE_NETWORK_AUTH";

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

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "[::1]"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function applyLoopbackPrivateUrlDefault(
  env: Record<string, string | undefined>,
  host: string
): void {
  if (
    isLoopbackHost(host)
    && !Object.prototype.hasOwnProperty.call(env, "ASSINI_ALLOW_PRIVATE_URLS")
  ) {
    env.ASSINI_ALLOW_PRIVATE_URLS = "1";
  }
}

function assertNetworkAuthIsExplicit(host: string, env: Record<string, string | undefined>): void {
  if (isLoopbackHost(host) || env[INSECURE_NETWORK_AUTH_OVERRIDE]?.trim().toLowerCase() === "true") return;

  const prototypeAuthEnabled = env.ASSINI_ENABLE_PROTOTYPE_AUTH?.trim().toLowerCase() === "true";
  const devToken = env.ASSINI_DEV_AUTH_TOKEN?.trim().toLowerCase();
  const predictableDevToken = devToken === "dev-local" || devToken === "test" || devToken === "changeme";
  if (!prototypeAuthEnabled && !predictableDevToken) return;

  throw new Error(
    `Refusing to expose insecure prototype authentication on HOST=${host}. `
    + `Use loopback, configure production authentication, or set ${INSECURE_NETWORK_AUTH_OVERRIDE}=true `
    + "only for an intentionally isolated development network."
  );
}

export function readRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const host = readHost(env.HOST);
  assertNetworkAuthIsExplicit(host, env);
  return {
    host,
    port: readPositiveInteger(env, "PORT", 4321, { min: 1, max: 65535 }),
    allowedOrigins: readAllowedOrigins(env.ASSINI_ALLOWED_ORIGINS),
    bodyLimitBytes: readPositiveInteger(env, "ASSINI_BODY_LIMIT_BYTES", DEFAULT_BODY_LIMIT_BYTES, {
      min: 1,
      max: MAX_BODY_LIMIT_BYTES
    }),
    logger: readLogger(env.ASSINI_API_LOGGER)
  };
}
