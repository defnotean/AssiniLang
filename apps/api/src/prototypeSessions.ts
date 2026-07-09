export const PROTOTYPE_SESSION_COOKIE = "assini_prototype_session";
export const PROTOTYPE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export const DEFAULT_PROTOTYPE_SESSION_TTL_MS = PROTOTYPE_SESSION_MAX_AGE_SECONDS * 1000;
/** Hard cap on total session age (3× default TTL) so sliding renewal cannot run forever. */
export const DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS = DEFAULT_PROTOTYPE_SESSION_TTL_MS * 3;
export const PROTOTYPE_SESSION_TTL_ENV_NAME = "ASSINI_PROTOTYPE_SESSION_TTL_MS";
export const PROTOTYPE_SESSION_ABSOLUTE_MAX_ENV_NAME = "ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS";

export type PrototypeSessionRecord = {
  userId: string;
  createdAt: number;
  /** Absolute epoch-ms deadline. Refreshed on every successful session use (sliding renewal). */
  expiresAt: number;
  /** TTL captured at session creation so renewal keeps the configured window. */
  ttlMs: number;
  /**
   * Hard cap from createdAt. Sliding renewal may not push expiresAt past
   * createdAt + absoluteMaxMs; sessions past this deadline are inactive.
   */
  absoluteMaxMs: number;
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

/**
 * Reads ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS. Defaults to 3× the sliding TTL so
 * activity can extend a session but not indefinitely. Must be >= ttlMs.
 */
export function readPrototypeSessionAbsoluteMaxMs(
  env: Record<string, string | undefined> = process.env,
  ttlMs: number = readPrototypeSessionTtlMs(env)
): number {
  const raw = env[PROTOTYPE_SESSION_ABSOLUTE_MAX_ENV_NAME]?.trim();
  if (!raw) {
    return ttlMs === DEFAULT_PROTOTYPE_SESSION_TTL_MS
      ? DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS
      : ttlMs * 3;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `${PROTOTYPE_SESSION_ABSOLUTE_MAX_ENV_NAME} must be an integer between 1 and ${Number.MAX_SAFE_INTEGER}`
    );
  }
  if (value < ttlMs) {
    throw new Error(
      `${PROTOTYPE_SESSION_ABSOLUTE_MAX_ENV_NAME} (${value}) must be >= ${PROTOTYPE_SESSION_TTL_ENV_NAME} (${ttlMs})`
    );
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

export function prototypeSessionAbsoluteDeadline(session: PrototypeSessionRecord): number {
  return session.createdAt + session.absoluteMaxMs;
}

export function isPrototypeSessionActive(session: PrototypeSessionRecord, now = Date.now()): boolean {
  return now <= session.expiresAt && now <= prototypeSessionAbsoluteDeadline(session);
}

/** Sliding renewal capped by the absolute lifetime from createdAt. */
export function renewPrototypeSessionExpiry(session: PrototypeSessionRecord, now = Date.now()): number {
  return Math.min(now + session.ttlMs, prototypeSessionAbsoluteDeadline(session));
}

/** Remaining ms until the earlier of sliding expiry and absolute deadline (0 when inactive). */
export function remainingPrototypeSessionMs(session: PrototypeSessionRecord, now = Date.now()): number {
  if (!isPrototypeSessionActive(session, now)) return 0;
  return Math.max(0, Math.min(session.expiresAt, prototypeSessionAbsoluteDeadline(session)) - now);
}

/**
 * Opportunistic map sweep used on session create (and available for tests).
 * Drops expired records always; when `knownUserIds` is provided, also drops
 * orphan sessions whose user no longer exists (reseed / manual user edit).
 */
export function pruneExpiredPrototypeSessions(
  prototypeSessions: Map<string, PrototypeSessionRecord>,
  now = Date.now(),
  knownUserIds?: ReadonlySet<string>
): void {
  prototypeSessions.forEach((session, sessionId) => {
    if (!isPrototypeSessionActive(session, now)) {
      prototypeSessions.delete(sessionId);
      return;
    }
    if (knownUserIds && !knownUserIds.has(session.userId)) {
      prototypeSessions.delete(sessionId);
    }
  });
}

/** Drops every map entry for userId, optionally keeping one session id (e.g. the newly minted one). */
export function revokePrototypeSessionsForUser(
  prototypeSessions: Map<string, PrototypeSessionRecord>,
  userId: string,
  exceptSessionId?: string
): number {
  let revoked = 0;
  prototypeSessions.forEach((session, sessionId) => {
    if (session.userId === userId && sessionId !== exceptSessionId) {
      prototypeSessions.delete(sessionId);
      revoked += 1;
    }
  });
  return revoked;
}
