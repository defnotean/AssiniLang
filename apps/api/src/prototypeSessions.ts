export const PROTOTYPE_SESSION_COOKIE = "assini_prototype_session";
export const PROTOTYPE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export const DEFAULT_PROTOTYPE_SESSION_TTL_MS = PROTOTYPE_SESSION_MAX_AGE_SECONDS * 1000;
export const PROTOTYPE_SESSION_TTL_ENV_NAME = "ASSINI_PROTOTYPE_SESSION_TTL_MS";

export type PrototypeSessionRecord = {
  userId: string;
  createdAt: number;
  /** Absolute epoch-ms deadline. Refreshed on every successful session use (sliding renewal). */
  expiresAt: number;
  /** TTL captured at session creation so renewal keeps the configured window. */
  ttlMs: number;
};

/**
 * Session map with an optional injectable clock attached at creation time
 * (createServer options.now). Keeps every requireActor/resolveActor call site
 * unchanged while letting lifecycle tests control time deterministically.
 */
export type PrototypeSessionMap = Map<string, PrototypeSessionRecord> & { now?: () => number };

/** Reads ASSINI_PROTOTYPE_SESSION_TTL_MS following the readPositiveInteger pattern in runtimeConfig.ts. */
export function readPrototypeSessionTtlMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env[PROTOTYPE_SESSION_TTL_ENV_NAME]?.trim();
  if (!raw) return DEFAULT_PROTOTYPE_SESSION_TTL_MS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${PROTOTYPE_SESSION_TTL_ENV_NAME} must be an integer between 1 and ${Number.MAX_SAFE_INTEGER}`);
  }
  return value;
}

export function prototypeSessionCookieSecure(
  env: Record<string, string | undefined> = process.env
): boolean {
  const flag = env.ASSINI_COOKIE_SECURE?.trim().toLowerCase();
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return env.NODE_ENV === "production";
}

export function serializePrototypeSessionCookie(
  sessionId: string,
  maxAgeSeconds: number = PROTOTYPE_SESSION_MAX_AGE_SECONDS,
  options: { secure?: boolean; env?: Record<string, string | undefined> } = {}
): string {
  const secure = options.secure ?? prototypeSessionCookieSecure(options.env ?? process.env);
  const parts = [
    `${PROTOTYPE_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Same attributes as the create path, but Max-Age=0 so the browser drops the cookie immediately. */
export function serializeExpiredPrototypeSessionCookie(): string {
  return serializePrototypeSessionCookie("", 0);
}

export function isPrototypeSessionActive(session: PrototypeSessionRecord, now = Date.now()): boolean {
  return now <= session.expiresAt;
}

export function pruneExpiredPrototypeSessions(
  prototypeSessions: Map<string, PrototypeSessionRecord>,
  now = Date.now()
): void {
  prototypeSessions.forEach((session, sessionId) => {
    if (!isPrototypeSessionActive(session, now)) {
      prototypeSessions.delete(sessionId);
    }
  });
}
