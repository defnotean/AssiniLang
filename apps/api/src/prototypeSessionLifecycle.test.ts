import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, JsonStore } from "@assini/db";
import { createServer } from "./server.js";
import {
  DEFAULT_PROTOTYPE_SESSION_TTL_MS,
  prototypeSessionCookieSecure,
  readPrototypeSessionTtlMs
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

function createSessionServer(clock: TestClock, prototypeSessionTtlMs?: number) {
  return createServer({
    initialState: buildTestWorkspaceState(),
    enablePrototypeAuth: true,
    rateLimit: false,
    now: clock.now,
    prototypeSessionTtlMs
  });
}

async function openSession(app: ReturnType<typeof createServer>, userId = "learner-1"): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/prototype-session",
    payload: { userId }
  });
  expect(response.statusCode).toBe(200);
  const setCookie = response.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(cookieHeader).toContain("assini_prototype_session=");
  return cookieHeader!.split(";")[0];
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
    const expiredSetCookie = expired.headers["set-cookie"];
    const expiredCookieHeader = Array.isArray(expiredSetCookie) ? expiredSetCookie[0] : expiredSetCookie;
    expect(expiredCookieHeader).toContain("assini_prototype_session=");
    expect(expiredCookieHeader).toContain("Max-Age=0");
    expect(expiredCookieHeader).toContain("HttpOnly");
    expect(expiredCookieHeader).toContain("SameSite=Strict");
    expect(expiredCookieHeader).toContain("Path=/");

    // requireActor paths (not only /users/me) also expire the stale cookie on 401.
    const expiredList = await app.inject({ method: "GET", url: "/evaluations", headers: { cookie } });
    expect(expiredList.statusCode).toBe(401);
    const listSetCookie = expiredList.headers["set-cookie"];
    const listCookieHeader = Array.isArray(listSetCookie) ? listSetCookie[0] : listSetCookie;
    expect(listCookieHeader).toContain("Max-Age=0");

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
    const orphanSetCookie = orphaned.headers["set-cookie"];
    const orphanCookieHeader = Array.isArray(orphanSetCookie) ? orphanSetCookie[0] : orphanSetCookie;
    expect(orphanCookieHeader).toContain("Max-Age=0");
    expect(orphanCookieHeader).toContain("HttpOnly");
    expect(orphanCookieHeader).toContain("SameSite=Strict");

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
    const setCookie = response.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain("assini_prototype_session=");
    expect(cookieHeader).toContain("Max-Age=0");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).toContain("Path=/");
  });

  it("does not emit Set-Cookie on 401 when no prototype-session cookie was sent", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);

    const response = await app.inject({ method: "GET", url: "/users/me" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("slides the session expiry forward on each successful use (documented sliding renewal)", async () => {
    const clock = createClock();
    const app = createSessionServer(clock);
    const cookie = await openSession(app);

    // Use the session every 6 hours: each use renews expiresAt to now + TTL,
    // so total lifetime exceeds the 8h TTL as long as use keeps occurring.
    for (let i = 0; i < 4; i += 1) {
      clock.advance(6 * HOUR_MS);
      const response = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
      expect(response.statusCode).toBe(200);
    }

    // 24 hours since the last renewal exceeds the TTL: the session is gone.
    clock.advance(24 * HOUR_MS);
    const expired = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(expired.statusCode).toBe(401);
  });

  it("refreshes Set-Cookie Max-Age on successful prototype-session use so browsers track sliding renewal", async () => {
    const clock = createClock();
    const ttlMs = 90_000;
    const app = createSessionServer(clock, ttlMs);
    const cookie = await openSession(app);

    clock.advance(30_000);
    const response = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(response.statusCode).toBe(200);

    const setCookie = response.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain("assini_prototype_session=");
    expect(cookieHeader).toContain("Max-Age=90");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).toContain("Path=/");
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
    const setCookie = logout.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain("assini_prototype_session=");
    expect(cookieHeader).toContain("Max-Age=0");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).toContain("Path=/");

    // The server-side record is gone: the old cookie no longer authenticates.
    const afterLogout = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("expires the logout cookie with Secure when ASSINI_COOKIE_SECURE is enabled", async () => {
    const previous = process.env.ASSINI_COOKIE_SECURE;
    process.env.ASSINI_COOKIE_SECURE = "1";
    try {
      const clock = createClock();
      const app = createSessionServer(clock);
      const cookie = await openSession(app);

      const logout = await app.inject({
        method: "DELETE",
        url: "/auth/prototype-session",
        headers: { cookie }
      });
      expect(logout.statusCode).toBe(204);
      const setCookie = logout.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieHeader).toContain("Max-Age=0");
      expect(cookieHeader).toContain("Secure");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("SameSite=Strict");
      expect(cookieHeader).toContain("Path=/");
    } finally {
      if (previous === undefined) delete process.env.ASSINI_COOKIE_SECURE;
      else process.env.ASSINI_COOKIE_SECURE = previous;
    }
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

  it("honors a short TTL override and expires sessions accordingly", async () => {
    const clock = createClock();
    const ttlMs = 1_000;
    const app = createSessionServer(clock, ttlMs);
    const cookie = await openSession(app);

    clock.advance(ttlMs - 1);
    const fresh = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(fresh.statusCode).toBe(200);

    clock.advance(ttlMs + 1);
    const expired = await app.inject({ method: "GET", url: "/users/me", headers: { cookie } });
    expect(expired.statusCode).toBe(401);
  });

  it("reads ASSINI_PROTOTYPE_SESSION_TTL_MS and rejects invalid values", () => {
    expect(readPrototypeSessionTtlMs({})).toBe(DEFAULT_PROTOTYPE_SESSION_TTL_MS);
    expect(readPrototypeSessionTtlMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: " " })).toBe(DEFAULT_PROTOTYPE_SESSION_TTL_MS);
    expect(readPrototypeSessionTtlMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: "60000" })).toBe(60_000);

    for (const invalid of ["0", "-1", "1.5", "abc", "1e3kb"]) {
      expect(() => readPrototypeSessionTtlMs({ ASSINI_PROTOTYPE_SESSION_TTL_MS: invalid })).toThrow(
        /ASSINI_PROTOTYPE_SESSION_TTL_MS must be an integer/
      );
    }
  });

  it("issues a session cookie whose Max-Age matches the configured TTL", async () => {
    const clock = createClock();
    const app = createSessionServer(clock, 90_000);

    const response = await app.inject({
      method: "POST",
      url: "/auth/prototype-session",
      payload: { userId: "learner-1" }
    });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain("Max-Age=90");
  });

  it("appends Secure on Set-Cookie when ASSINI_COOKIE_SECURE is enabled", async () => {
    const previous = process.env.ASSINI_COOKIE_SECURE;
    process.env.ASSINI_COOKIE_SECURE = "1";
    try {
      expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "1" })).toBe(true);
      expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "true" })).toBe(true);
      expect(prototypeSessionCookieSecure({ NODE_ENV: "production" })).toBe(true);
      expect(prototypeSessionCookieSecure({ ASSINI_COOKIE_SECURE: "0", NODE_ENV: "production" })).toBe(false);
      expect(prototypeSessionCookieSecure({})).toBe(false);

      const clock = createClock();
      const app = createSessionServer(clock);
      const response = await app.inject({
        method: "POST",
        url: "/auth/prototype-session",
        payload: { userId: "learner-1" }
      });
      expect(response.statusCode).toBe(200);
      const setCookie = response.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieHeader).toContain("Secure");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("SameSite=Strict");
    } finally {
      if (previous === undefined) delete process.env.ASSINI_COOKIE_SECURE;
      else process.env.ASSINI_COOKIE_SECURE = previous;
    }
  });

  it("omits Secure on Set-Cookie for local HTTP when ASSINI_COOKIE_SECURE is unset", async () => {
    const previousSecure = process.env.ASSINI_COOKIE_SECURE;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.ASSINI_COOKIE_SECURE;
    process.env.NODE_ENV = "test";
    try {
      const clock = createClock();
      const app = createSessionServer(clock);
      const response = await app.inject({
        method: "POST",
        url: "/auth/prototype-session",
        payload: { userId: "learner-1" }
      });
      expect(response.statusCode).toBe(200);
      const setCookie = response.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieHeader).not.toMatch(/(?:^|;\s*)Secure(?:;|$)/);
    } finally {
      if (previousSecure === undefined) delete process.env.ASSINI_COOKIE_SECURE;
      else process.env.ASSINI_COOKIE_SECURE = previousSecure;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
