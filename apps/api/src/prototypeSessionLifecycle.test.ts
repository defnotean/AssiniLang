import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, JsonStore } from "@assini/db";
import { createServer } from "./server.js";
import {
  DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS,
  DEFAULT_PROTOTYPE_SESSION_TTL_MS,
  prototypeSessionCookieSecure,
  readPrototypeSessionAbsoluteMaxMs,
  readPrototypeSessionTtlMs,
  serializeExpiredPrototypeSessionCookie,
  serializePrototypeSessionCookie,
  type PrototypeSessionMap
} from "./routeHelpers.js";

const HOUR_MS = 60 * 60 * 1000;

type TestClock = { now: () => number; advance: (ms: number) => void };

function createClock(start = 1_750_000_000_000): TestClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

function createSessionServer(
  clock: TestClock,
  options: {
    prototypeSessionTtlMs?: number;
    prototypeSessionAbsoluteMaxMs?: number;
    prototypeSessions?: PrototypeSessionMap;
  } = {}
) {
  return createServer({
    initialState: buildTestWorkspaceState(),
    enablePrototypeAuth: true,
    rateLimit: false,
    now: clock.now,
    ...options
  });
}

function firstSetCookie(response: { headers: { "set-cookie"?: string | string[] } }): string {
  const setCookie = response.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(cookieHeader).toBeTruthy();
  return cookieHeader!;
}

/** Asserts the shared Secure/HttpOnly/SameSite/Path contract for every Set-Cookie path. */
function expectPrototypeSessionCookieAttributes(
  cookieHeader: string,
  options: { maxAge: number; secure?: boolean }
): void {
  expect(cookieHeader).toContain("assini_prototype_session=");
  expect(cookieHeader).toContain(`Max-Age=${options.maxAge}`);
  expect(cookieHeader).toContain("HttpOnly");
  expect(cookieHeader).toContain("SameSite=Strict");
  expect(cookieHeader).toContain("Path=/");
  if (options.secure) {
    expect(cookieHeader).toMatch(/(?:^|;\s*)Secure(?:;|$)/);
  } else if (options.secure === false) {
    expect(cookieHeader).not.toMatch(/(?:^|;\s*)Secure(?:;|$)/);
  }
}

async function withCookieSecureFlag<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ASSINI_COOKIE_SECURE;
  if (value === undefined) delete process.env.ASSINI_COOKIE_SECURE;
  else process.env.ASSINI_COOKIE_SECURE = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ASSINI_COOKIE_SECURE;
    else process.env.ASSINI_COOKIE_SECURE = previous;
  }
}

async function openSession(app: ReturnType<typeof createServer>, userId = "learner-1"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/prototype-session",
    payload: { userId }
  });
  expect(response.statusCode).toBe(200);
  const cookieHeader = firstSetCookie(response);
  expect(cookieHeader).toContain("assini_prototype_session=");
  return cookieHeader.split(";")[0];
}

describe("prototype session lifecycle", () => {
  it("rejects requests with an expired session cookie and lazily evicts the record", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);
    const cookie = await openSession(app);

    // Just inside the default 8h TTL the session still works.
    clock.advance(DEFAULT_PROTOTYPE_SESSION_TTL_MS - 1);
    const fresh = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(fresh.statusCode).toBe(200);

    // Sliding renewal restarted the window above; jump past a full TTL to expire it.
    clock.advance(DEFAULT_PROTOTYPE_SESSION_TTL_MS + 1);
    const expired = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(expired.statusCode).toBe(401);
    expectPrototypeSessionCookieAttributes(firstSetCookie(expired), { maxAge: 0, secure: false });

    // requireActor paths (not only /users/me) also expire the stale cookie on 401.
    const expiredList = await app.inject({ method: "GET", url: "/evaluations", headers: { cookie } });
    expect(expiredList.statusCode).toBe(401);
    expectPrototypeSessionCookieAttributes(firstSetCookie(expiredList), { maxAge: 0, secure: false });

    // Lazy eviction: the expired record was deleted, so a retry is still 401.
    const retried = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(retried.statusCode).toBe(401);
  });

  it("evicts orphan sessions when the cookie user no longer exists", async () => {
    const clock = createClock();
    const dir = await mkdtemp(join(tmpdir(), "assini-orphan-session-"));
    const dbPath = join(dir, "local-db.json");
    const store = new JsonStore(dbPath);
    await store.write(buildTestWorkspaceState());

    const app = createServer({
      store,
      enablePrototypeAuth: true,
      rateLimit: false,
      now: clock.now
    });
    const cookie = await openSession(app, "learner-1");

    const before = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(before.statusCode).toBe(200);

    // Simulate reseed / manual user edit: drop the session's user while the cookie remains.
    await store.update((state) => ({
      ...state,
      users: state.users.filter((user) => user.id !== "learner-1")
    }));

    const orphaned = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(orphaned.statusCode).toBe(401);
    expectPrototypeSessionCookieAttributes(firstSetCookie(orphaned), { maxAge: 0, secure: false });

    // Orphan eviction: the map entry is gone, so a retry stays 401 (no zombie renewal).
    const retried = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(retried.statusCode).toBe(401);

    // Other users can still open a fresh session after the orphan was cleared.
    const elderCookie = await openSession(app, "elder-1");
    const elder = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: elderCookie } });
    expect(elder.statusCode).toBe(200);
  });

  it("expires an unknown prototype-session cookie on 401 without inventing a session", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);

    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { cookie: "assini_prototype_session=does-not-exist" }
    });
    expect(response.statusCode).toBe(401);
    expectPrototypeSessionCookieAttributes(firstSetCookie(response), { maxAge: 0, secure: false });
  });

  it("does not emit Set-Cookie on 401 when no prototype-session cookie was sent", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);

    const response = await app.inject({ method: "GET", url: "/users/me" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("slides the session expiry forward on each successful use until the absolute max", async () => {
    const clock = createClock();
    const ttlMs = 8 * HOUR_MS;
    const absoluteMaxMs = 24 * HOUR_MS;
    const app = createSessionServer(clock, {
      prototypeSessionTtlMs: ttlMs,
      prototypeSessionAbsoluteMaxMs: absoluteMaxMs
    });
    const cookie = await openSession(app);

    // Use the session every 6 hours: each use renews expiresAt to now + TTL,
    // so total lifetime exceeds the sliding TTL as long as use keeps occurring.
    for (let i = 0; i < 3; i += 1) {
      clock.advance(6 * HOUR_MS);
      const response = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
      expect(response.statusCode).toBe(200);
    }

    // Past absolute max (24h from createdAt): sliding cannot keep the session alive.
    clock.advance(6 * HOUR_MS + 1);
    const expired = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(expired.statusCode).toBe(401);
    expectPrototypeSessionCookieAttributes(firstSetCookie(expired), { maxAge: 0, secure: false });
  });

  it("rejects a session that reaches the absolute max even when sliding would still renew", async () => {
    const clock = createClock();
    const ttlMs = 60_000;
    const absoluteMaxMs = 90_000;
    const app = createSessionServer(clock, {
      prototypeSessionTtlMs: ttlMs,
      prototypeSessionAbsoluteMaxMs: absoluteMaxMs
    });
    const cookie = await openSession(app);

    clock.advance(50_000);
    const mid = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(mid.statusCode).toBe(200);
    // Remaining lifetime is absoluteMax - elapsed (40s), not a full TTL reset.
    expectPrototypeSessionCookieAttributes(firstSetCookie(mid), { maxAge: 40, secure: false });

    clock.advance(40_001);
    const pastAbsolute = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(pastAbsolute.statusCode).toBe(401);
    expectPrototypeSessionCookieAttributes(firstSetCookie(pastAbsolute), { maxAge: 0, secure: false });
  });

  it("expires an absolute-max session cookie with Secure when ASSINI_COOKIE_SECURE is enabled", async () => {
    await withCookieSecureFlag("1", async () => {
      const clock = createClock();
      const ttlMs = 60_000;
      const absoluteMaxMs = 90_000;
      const app = createSessionServer(clock, {
        prototypeSessionTtlMs: ttlMs,
        prototypeSessionAbsoluteMaxMs: absoluteMaxMs
      });
      const cookie = await openSession(app);

      clock.advance(absoluteMaxMs + 1);
      const pastAbsolute = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
      expect(pastAbsolute.statusCode).toBe(401);
      expectPrototypeSessionCookieAttributes(firstSetCookie(pastAbsolute), { maxAge: 0, secure: true });
    });
  });

  it("revokes prior sessions for the same user when a new session is minted", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);
    const firstCookie = await openSession(app, "learner-1");
    const secondCookie = await openSession(app, "learner-1");

    const first = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: firstCookie } });
    expect(first.statusCode).toBe(401);
    const second = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: secondCookie } });
    expect(second.statusCode).toBe(200);
  });

  it("logout revokes every session for the cookie user, not only the presented id", async () => {
    const clock = createClock();
    const start = clock.now();
    const sessions: PrototypeSessionMap = new Map([
      [
        "sibling-a",
        {
          userId: "learner-1",
          createdAt: start,
          expiresAt: start + DEFAULT_PROTOTYPE_SESSION_TTL_MS,
          ttlMs: DEFAULT_PROTOTYPE_SESSION_TTL_MS,
          absoluteMaxMs: DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS
        }
      ],
      [
        "sibling-b",
        {
          userId: "learner-1",
          createdAt: start,
          expiresAt: start + DEFAULT_PROTOTYPE_SESSION_TTL_MS,
          ttlMs: DEFAULT_PROTOTYPE_SESSION_TTL_MS,
          absoluteMaxMs: DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS
        }
      ],
      [
        "other-user",
        {
          userId: "elder-1",
          createdAt: start,
          expiresAt: start + DEFAULT_PROTOTYPE_SESSION_TTL_MS,
          ttlMs: DEFAULT_PROTOTYPE_SESSION_TTL_MS,
          absoluteMaxMs: DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS
        }
      ]
    ]);
    const app = createSessionServer(clock, { prototypeSessions: sessions });

    const logout = await app.inject({
      method: "DELETE",
      url: "/auth/prototype-session",
      headers: { cookie: "assini_prototype_session=sibling-a" }
    });
    expect(logout.statusCode).toBe(204);

    const sibling = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { cookie: "assini_prototype_session=sibling-b" }
    });
    expect(sibling.statusCode).toBe(401);

    const other = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: { cookie: "assini_prototype_session=other-user" }
    });
    expect(other.statusCode).toBe(200);
  });

  it("refreshes Set-Cookie Max-Age on successful prototype-session use so browsers track sliding renewal", async () => {
    const clock = createClock();
    const ttlMs = 90_000;
    const app = createSessionServer(clock, { prototypeSessionTtlMs: ttlMs });
    const cookie = await openSession(app);

    clock.advance(30_000);
    const response = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expectPrototypeSessionCookieAttributes(firstSetCookie(response), { maxAge: 90, secure: false });
  });

  it("refreshes the sliding Set-Cookie with Secure when ASSINI_COOKIE_SECURE is enabled", async () => {
    await withCookieSecureFlag("1", async () => {
      const clock = createClock();
      const ttlMs = 90_000;
      const app = createSessionServer(clock, { prototypeSessionTtlMs: ttlMs });
      const cookie = await openSession(app);

      clock.advance(30_000);
      const response = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expectPrototypeSessionCookieAttributes(firstSetCookie(response), { maxAge: 90, secure: true });
    });
  });

  it("clears the session record and expires the cookie on logout", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);
    const cookie = await openSession(app);

    const logout = await app.inject({
      method: "DELETE",
      url: "/auth/prototype-session",
      headers: { cookie }
    });
    expect(logout.statusCode).toBe(204);
    expectPrototypeSessionCookieAttributes(firstSetCookie(logout), { maxAge: 0, secure: false });

    // The server-side record is gone: the old cookie no longer authenticates.
    const afterLogout = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("expires the logout cookie with Secure when ASSINI_COOKIE_SECURE is enabled", async () => {
    await withCookieSecureFlag("1", async () => {
      const clock = createClock();
      const app = createSessionServer(clock);
      const cookie = await openSession(app);

      const logout = await app.inject({
        method: "DELETE",
        url: "/auth/prototype-session",
        headers: { cookie }
      });
      expect(logout.statusCode).toBe(204);
      expectPrototypeSessionCookieAttributes(firstSetCookie(logout), { maxAge: 0, secure: true });
    });
  });

  it("treats logout as idempotent when no session exists", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);

    const withoutCookie = await app.inject({ method: "DELETE", url: "/auth/prototype-session" });
    expect(withoutCookie.statusCode).toBe(204);

    const withUnknownCookie = await app.inject({
      method: "DELETE",
      url: "/auth/prototype-session",
      headers: { cookie: "assini_prototype_session=does-not-exist" }
    });
    expect(withUnknownCookie.statusCode).toBe(204);
  });

  it("purges expired sessions opportunistically when a new session is created", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);

    const staleCookie = await openSession(app, "learner-1");
    clock.advance(DEFAULT_PROTOTYPE_SESSION_TTL_MS + 1);

    // Creating a fresh session sweeps the expired one from the map.
    const freshCookie = await openSession(app, "elder-1");

    const stale = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: staleCookie } });
    expect(stale.statusCode).toBe(401);
    const fresh = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: freshCookie } });
    expect(fresh.statusCode).toBe(200);
  });

  it("sweeps orphan sessions during session creation without requiring a prior GET", async () => {
    const clock = createClock();
    const dir = await mkdtemp(join(tmpdir(), "assini-orphan-create-sweep-"));
    const dbPath = join(dir, "local-db.json");
    const store = new JsonStore(dbPath);
    await store.write(buildTestWorkspaceState());

    const app = createServer({
      store,
      enablePrototypeAuth: true,
      rateLimit: false,
      now: clock.now
    });
    const orphanCookie = await openSession(app, "learner-1");

    // Drop the session's user while the cookie remains (reseed / manual edit).
    await store.update((state) => ({
      ...state,
      users: state.users.filter((user) => user.id !== "learner-1")
    }));

    // Creating any new session should sweep the orphan from the map.
    const freshCookie = await openSession(app, "elder-1");

    const orphaned = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: orphanCookie } });
    expect(orphaned.statusCode).toBe(401);
    const orphanSetCookie = orphaned.headers["set-cookie"];
    const orphanCookieHeader = Array.isArray(orphanSetCookie) ? orphanSetCookie[0] : orphanSetCookie;
    expect(orphanCookieHeader).toContain("Max-Age=0");

    const fresh = await app.inject({ method: "GET", url: "/users/me", headers: { cookie: freshCookie } });
    expect(fresh.statusCode).toBe(200);
  });

  it("honors a short TTL override and expires sessions accordingly", async () => {
    const clock = createClock();
    const ttlMs = 1_000;
    const app = createSessionServer(clock, { prototypeSessionTtlMs: ttlMs });
    const cookie = await openSession(app);

    clock.advance(ttlMs - 1);
    const fresh = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(fresh.statusCode).toBe(200);

    clock.advance(ttlMs + 1);
    const expired = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(expired.statusCode).toBe(401);
  });

  it("reads ASSINI_PROTOTYPE_SESSION_TTL_MS and ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS", () => {
    expect(readPrototypeSessionTtlMs({})).toBe(DEFAULT_PROTOTYPE_SESSION_TTL_MS);
    expect(readPrototypeSessionTtlMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: " " })).toBe(DEFAULT_PROTOTYPE_SESSION_TTL_MS);
    expect(readPrototypeSessionTtlMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: "60000" })).toBe(60_000);

    for (const invalid of ["0", "-1", "1.5", "abc", "1e3kb"]) {
      expect(() => readPrototypeSessionTtlMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: invalid })).toThrow(
        /ASSINI_PROTOTYPE_SESSION_TTL_MS must be an integer/
      );
    }

    expect(readPrototypeSessionAbsoluteMaxMs({})).toBe(DEFAULT_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS);
    expect(readPrototypeSessionAbsoluteMaxMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: "60000" }, 60_000)).toBe(180_000);
    expect(readPrototypeSessionAbsoluteMaxMs({ ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS: "120000" }, 60_000)).toBe(
      120_000
    );

    for (const invalid of ["0", "-1", "1.5", "abc"]) {
      expect(() =>
        readPrototypeSessionAbsoluteMaxMs({ ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS: invalid }, 60_000)
      ).toThrow(/ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS must be an integer/);
    }
    expect(() =>
      readPrototypeSessionAbsoluteMaxMs({ ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS: "1000" }, 60_000)
    ).toThrow(/must be >= ASSINI_PROTOTYPE_SESSION_TTL_MS/);
  });

  it("issues a session cookie whose Max-Age matches the configured TTL", async () => {
    const clock = createClock();
    const app = createSessionServer(clock, { prototypeSessionTtlMs: 90_000 });

    const response = await app.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "learner-1" }
    });
    expect(response.statusCode).toBe(200);
    expectPrototypeSessionCookieAttributes(firstSetCookie(response), { maxAge: 90, secure: false });
  });

  it("appends Secure on Set-Cookie when ASSINI_COOKIE_SECURE is enabled", async () => {
    expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "1" })).toBe(true);
    expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "true" })).toBe(true);
    expect(prototypeSessionCookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "0", NODE_ENV: "production" })).toBe(false);
    expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "false", NODE_ENV: "production" })).toBe(false);
    expect(prototypeSessionCookieSecure({})).toBe(false);

    await withCookieSecureFlag("1", async () => {
      const clock = createClock();
      const app = createSessionServer(clock);
      const response = await app.inject({
        method: "POST",
        url: "/auth/prototype-session",
        payload: { userId: "learner-1" }
      });
      expect(response.statusCode).toBe(200);
      expectPrototypeSessionCookieAttributes(firstSetCookie(response), {
        maxAge: Math.ceil(DEFAULT_PROTOTYPE_SESSION_TTL_MS / 1000),
        secure: true
      });
    });
  });

  it("omits Secure on Set-Cookie for local HTTP when ASSINI_COOKIE_SECURE is unset", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      await withCookieSecureFlag(undefined, async () => {
        const clock = createClock();
        const app = createSessionServer(clock);
        const response = await app.inject({
          method: "POST",
          url: "/auth/prototype-session",
          payload: { userId: "learner-1" }
        });
        expect(response.statusCode).toBe(200);
        expectPrototypeSessionCookieAttributes(firstSetCookie(response), {
          maxAge: Math.ceil(DEFAULT_PROTOTYPE_SESSION_TTL_MS / 1000),
          secure: false
        });
      });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("keeps Secure/SameSite/Path aligned on create, refresh, and 401 expire serializers", () => {
    const issued = serializePrototypeSessionCookie("session-id-1", 120, {
      env: { ASSINI_COOKIE_SECURE: "1" }
    });
    expectPrototypeSessionCookieAttributes(issued, { maxAge: 120, secure: true });

    const local = serializePrototypeSessionCookie("session-id-1", 120, {
      env: { NODE_ENV: "test" }
    });
    expectPrototypeSessionCookieAttributes(local, { maxAge: 120, secure: false });

    const expiredSecure = serializeExpiredPrototypeSessionCookie({
      env: { ASSINI_COOKIE_SECURE: "true" }
    });
    expectPrototypeSessionCookieAttributes(expiredSecure, { maxAge: 0, secure: true });

    const expiredLocal = serializeExpiredPrototypeSessionCookie({
      env: { ASSINI_COOKIE_SECURE: "0", NODE_ENV: "production" }
    });
    expectPrototypeSessionCookieAttributes(expiredLocal, { maxAge: 0, secure: false });
  });

  it("expires unknown and TTL-stale cookies with Secure when ASSINI_COOKIE_SECURE is enabled", async () => {
    await withCookieSecureFlag("1", async () => {
      const clock = createClock();
      const app = createSessionServer(clock, { prototypeSessionTtlMs: 1_000 });

      const unknown = await app.inject({
        method: "GET",
        url: "/users/me",
        headers: { cookie: "assini_prototype_session=does-not-exist" }
      });
      expect(unknown.statusCode).toBe(401);
      expectPrototypeSessionCookieAttributes(firstSetCookie(unknown), { maxAge: 0, secure: true });

      const cookie = await openSession(app);
      clock.advance(1_002);
      const expired = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
      expect(expired.statusCode).toBe(401);
      expectPrototypeSessionCookieAttributes(firstSetCookie(expired), { maxAge: 0, secure: true });
    });
  });
});
