/** Default Vite dev origins used when ASSINI_ALLOWED_ORIGINS is unset/empty. */
export const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] as const;

/**
 * Validates one CORS allow-list entry. Origins must be exact `scheme://host[:port]`
 * values — no paths, queries, trailing slashes, wildcards, or the opaque `null` origin.
 */
export function assertCorsAllowedOrigin(origin: string, envName = "ASSINI_ALLOWED_ORIGINS"): void {
  const trimmed = origin.trim();
  if (!trimmed) {
    throw new Error(`${envName} contains an empty origin`);
  }
  if (trimmed === "*" || trimmed.toLowerCase() === "null") {
    throw new Error(
      `${envName} does not allow wildcard or null origins (credentials-safe allow-list only): ${origin}`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${envName} contains an invalid origin: ${origin}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${envName} origins must use http or https: ${origin}`);
  }

  const hasExtraPath = parsed.pathname !== "/" && parsed.pathname !== "";
  if (hasExtraPath || parsed.search !== "" || parsed.hash !== "" || trimmed.endsWith("/")) {
    throw new Error(
      `${envName} origins must be scheme://host[:port] with no path, query, or trailing slash: ${origin}`
    );
  }

  // Reject userinfo (https://user:pass@host) — not a browser Origin value.
  if (parsed.username || parsed.password) {
    throw new Error(`${envName} origins must not include credentials: ${origin}`);
  }
}

/**
 * Parses a comma-separated ASSINI_ALLOWED_ORIGINS value into a validated allow-list.
 * Blank / empty lists fall back to the local Vite defaults.
 */
export function readAllowedOrigins(
  value: string | undefined,
  envName = "ASSINI_ALLOWED_ORIGINS"
): string[] {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (!origins || origins.length === 0) return [...DEFAULT_ALLOWED_ORIGINS];

  for (const origin of origins) {
    assertCorsAllowedOrigin(origin, envName);
  }
  return origins;
}

/**
 * Validates a programmatic allow-list (createServer options). Empty arrays are rejected
 * so callers cannot accidentally open CORS by passing `[]`.
 */
export function resolveAllowedOrigins(origins: readonly string[] | undefined): string[] {
  if (origins === undefined) return [...DEFAULT_ALLOWED_ORIGINS];
  if (origins.length === 0) {
    throw new Error("allowedOrigins must include at least one origin");
  }
  for (const origin of origins) {
    assertCorsAllowedOrigin(origin, "allowedOrigins");
  }
  return [...origins];
}

/**
 * Browser CORS check. Missing Origin (non-browser / same-origin tooling) is allowed.
 * Wildcard, opaque `null`, and non-allow-listed Origins are always denied — even if a
 * misconfigured allow-list somehow contained them.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean {
  if (origin === undefined) return true;
  if (origin === "*" || origin === "null") return false;
  return allowedOrigins.includes(origin);
}
