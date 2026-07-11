import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, createEmptyState, JsonStore, type AppState } from "@assini/db";
import { buildObservabilityMetricsSnapshot } from "./observabilityMetrics.js";
import { createServer } from "./server.js";
import type { RequestMetrics } from "./routes/context.js";
import type { JobQueueMetrics } from "./jobQueue.js";
import type { RecoveryMetrics } from "./routes/context.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function emptyRequestMetrics(startedAtMs = Date.parse("2026-06-15T12:00:00.000Z")): RequestMetrics {
  return {
    startedAtMs,
    requests: {
      total: 0,
      byStatusClass: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
      latencyMs: {
        count: 0,
        total: 0,
        max: 0,
        byBucket: { le10: 0, le50: 0, le250: 0, le1000: 0, gt1000: 0 }
      }
    }
  };
}

function emptyJobMetrics(): JobQueueMetrics {
  return {
    enqueued: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    duplicateRejected: 0,
    durationMs: { count: 0, total: 0, max: 0 }
  };
}

function emptyRecoveryMetrics(): RecoveryMetrics {
  return {
    startup: { status: "succeeded", recovered: 0, completedAtMs: 0 },
    staleSweep: { status: "idle", runs: 0, failures: 0, totalRecovered: 0 }
  };
}

describe("buildObservabilityMetricsSnapshot", () => {
  it("returns counts without materializing job ids or exception text", () => {
    const snapshot = buildObservabilityMetricsSnapshot({
      nowMs: Date.parse("2026-06-15T12:00:02.500Z"),
      requestMetrics: {
        startedAtMs: Date.parse("2026-06-15T12:00:00.000Z"),
        requests: {
          total: 4,
          byStatusClass: { "1xx": 0, "2xx": 3, "3xx": 0, "4xx": 1, "5xx": 0 },
          latencyMs: {
            count: 4,
            total: 1_114,
            max: 1_001,
            byBucket: { le10: 1, le50: 1, le250: 1, le1000: 0, gt1000: 1 }
          }
        }
      },
      readJobQueueStatus: () => ({ pending: 2, active: 1 }),
      readJobQueueMetrics: () => ({
        enqueued: 4,
        completed: 2,
        failed: 1,
        cancelled: 1,
        duplicateRejected: 0,
        durationMs: { count: 3, total: 90, max: 50 }
      }),
      recoveryMetrics: {
        startup: { status: "succeeded", recovered: 2, completedAtMs: Date.parse("2026-06-15T12:00:01.000Z") },
        staleSweep: {
          status: "idle",
          runs: 1,
          failures: 0,
          totalRecovered: 1,
          lastRunAtMs: Date.parse("2026-06-15T12:00:02.000Z"),
          lastSuccessAtMs: Date.parse("2026-06-15T12:00:02.100Z")
        }
      },
      state: createEmptyState()
    });

    expect(snapshot).toEqual({
      uptimeMs: 2_500,
      serverTime: "2026-06-15T12:00:02.500Z",
      requests: {
        total: 4,
        byStatusClass: { "1xx": 0, "2xx": 3, "3xx": 0, "4xx": 1, "5xx": 0 },
        errors: { total: 1, client: 1, server: 0 },
        latencyMs: {
          count: 4,
          average: 278,
          max: 1_001,
          byBucket: { le10: 1, le50: 1, le250: 1, le1000: 0, gt1000: 1 }
        }
      },
      jobQueue: { pending: 2, active: 1 },
      jobs: {
        enqueued: 4,
        completed: 2,
        failed: 1,
        cancelled: 1,
        duplicateRejected: 0,
        durationMs: { count: 3, total: 90, average: 30, max: 50 }
      },
      recovery: {
        startup: { status: "succeeded", recovered: 2, completedAt: "2026-06-15T12:00:01.000Z" },
        staleSweep: {
          status: "idle",
          runs: 1,
          failures: 0,
          totalRecovered: 1,
          lastRunAt: "2026-06-15T12:00:02.000Z",
          lastSuccessAt: "2026-06-15T12:00:02.100Z"
        }
      },
      storage: { ok: true, schemaVersion: 9 }
    });
  });

  it("sanitizes queue inspection failures and unsafe counts without leaking details", () => {
    const throwing = buildObservabilityMetricsSnapshot({
      nowMs: Date.parse("2026-06-15T12:00:00.000Z"),
      requestMetrics: emptyRequestMetrics(),
      readJobQueueStatus: () => {
        throw new Error("Cannot inspect source-secret-123 at C:/secret/queue.json with sk-live-secret");
      },
      readJobQueueMetrics: emptyJobMetrics,
      recoveryMetrics: emptyRecoveryMetrics(),
      state: createEmptyState()
    });

    expect(throwing.jobQueue).toEqual({ pending: 0, active: 0 });
    expect(JSON.stringify(throwing)).not.toContain("source-secret-123");
    expect(JSON.stringify(throwing)).not.toContain("C:/secret/queue.json");
    expect(JSON.stringify(throwing)).not.toContain("sk-live-secret");

    const unsafe = buildObservabilityMetricsSnapshot({
      nowMs: Date.parse("2026-06-15T12:00:00.000Z"),
      requestMetrics: {
        startedAtMs: Date.parse("2026-06-15T12:00:00.000Z"),
        requests: {
          total: Number.NaN,
          byStatusClass: {
            "1xx": -1,
            "2xx": Number.POSITIVE_INFINITY,
            "3xx": 1.5,
            "4xx": Number.MAX_SAFE_INTEGER + 1,
            "5xx": 2
          },
          latencyMs: {
            count: -1,
            total: Number.POSITIVE_INFINITY,
            max: Number.NaN,
            byBucket: { le10: -1, le50: 1.5, le250: 2, le1000: Number.NaN, gt1000: 0 }
          }
        }
      },
      readJobQueueStatus: () => ({ pending: -3, active: Number.NaN }),
      readJobQueueMetrics: () => ({
        enqueued: -1,
        completed: Number.NaN,
        failed: 2,
        cancelled: 0,
        duplicateRejected: 0,
        durationMs: { count: 0, total: Number.POSITIVE_INFINITY, max: -1 }
      }),
      recoveryMetrics: emptyRecoveryMetrics(),
      state: createEmptyState()
    });

    expect(unsafe.requests).toEqual({
      total: 0,
      byStatusClass: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 2 },
      errors: { total: 2, client: 0, server: 2 },
      latencyMs: {
        count: 0,
        average: 0,
        max: 0,
        byBucket: { le10: 0, le50: 0, le250: 2, le1000: 0, gt1000: 0 }
      }
    });
    expect(unsafe.jobQueue).toEqual({ pending: 0, active: 0 });
    expect(unsafe.jobs.failed).toBe(2);
  });

  it("treats missing or unsafe schema versions as sanitized storage failures", () => {
    expect(
      buildObservabilityMetricsSnapshot({
        nowMs: Date.parse("2026-06-15T12:00:00.000Z"),
        requestMetrics: emptyRequestMetrics(),
        readJobQueueStatus: () => ({ pending: 0, active: 0 }),
        readJobQueueMetrics: emptyJobMetrics,
        recoveryMetrics: emptyRecoveryMetrics(),
        state: undefined
      }).storage
    ).toEqual({ ok: false, error: "Storage read failed" });

    const invalidSchema = {
      ...createEmptyState(),
      schemaVersion: Number.NaN
    } as ReturnType<typeof createEmptyState>;

    expect(
      buildObservabilityMetricsSnapshot({
        nowMs: Date.parse("2026-06-15T12:00:00.000Z"),
        requestMetrics: emptyRequestMetrics(),
        readJobQueueStatus: () => ({ pending: 0, active: 0 }),
        readJobQueueMetrics: emptyJobMetrics,
        recoveryMetrics: emptyRecoveryMetrics(),
        state: invalidSchema
      }).storage
    ).toEqual({ ok: false, error: "Storage read failed" });
  });

  it("clamps non-finite clocks so serverTime never becomes Invalid Date", () => {
    const snapshot = buildObservabilityMetricsSnapshot({
      nowMs: Number.NaN,
      requestMetrics: emptyRequestMetrics(Number.NaN),
      readJobQueueStatus: () => ({ pending: 0, active: 0 }),
      readJobQueueMetrics: emptyJobMetrics,
      recoveryMetrics: emptyRecoveryMetrics(),
      state: createEmptyState()
    });

    expect(snapshot.serverTime).toBe("1970-01-01T00:00:00.000Z");
    expect(snapshot.uptimeMs).toBe(0);
    expect(snapshot.serverTime).not.toContain("Invalid");
  });
});

describe("GET /observability/metrics", () => {
  it("requires a privileged observability role", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const publicResponse = await app.inject({ method: "GET", url: "/observability/metrics" });
    expect(publicResponse.statusCode).toBe(401);
    expect(publicResponse.json()).toEqual({ error: "Unauthorized" });

    for (const userId of ["learner-1", "reviewer-1", "elder-1"]) {
      const forbidden = await app.inject({
        method: "GET",
        url: "/observability/metrics",
        headers: authHeaders(userId)
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toEqual({ error: "Forbidden" });
    }

    for (const userId of ["programmer-1", "lead-1", "admin-1"]) {
      const allowed = await app.inject({
        method: "GET",
        url: "/observability/metrics",
        headers: authHeaders(userId)
      });
      expect(allowed.statusCode).toBe(200);
    }
  });

  it("returns a small safe shape without paths, private content, or answer keys", async () => {
    let currentTime = Date.parse("2026-06-15T12:00:00.000Z");
    const app = createServer({ initialState: buildTestWorkspaceState(), now: () => currentTime });

    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/languages" });
    currentTime += 2_500;

    const response = await app.inject({
      method: "GET",
      url: "/observability/metrics",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(
      ["jobQueue", "jobs", "recovery", "requests", "serverTime", "storage", "uptimeMs"].sort()
    );
    expect(body).toMatchObject({
      uptimeMs: 2_500,
      serverTime: "2026-06-15T12:00:02.500Z",
      requests: {
        total: expect.any(Number),
        byStatusClass: {
          "1xx": expect.any(Number),
          "2xx": expect.any(Number),
          "3xx": expect.any(Number),
          "4xx": expect.any(Number),
          "5xx": expect.any(Number)
        },
        errors: {
          total: expect.any(Number),
          client: expect.any(Number),
          server: expect.any(Number)
        },
        latencyMs: {
          count: expect.any(Number),
          average: expect.any(Number),
          max: expect.any(Number)
        }
      },
      jobQueue: {
        pending: 0,
        active: 0
      },
      storage: {
        ok: true,
        schemaVersion: 9
      }
    });
    expect(Object.keys(body.requests).sort()).toEqual(["byStatusClass", "errors", "latencyMs", "total"]);
    expect(Object.keys(body.requests.byStatusClass).sort()).toEqual(["1xx", "2xx", "3xx", "4xx", "5xx"]);
    expect(body.requests.total).toBeGreaterThanOrEqual(2);
    expect(body.requests.byStatusClass["2xx"]).toBeGreaterThanOrEqual(2);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("mira talo-na");
    expect(serialized).not.toContain("saku talo-ki");
    expect(serialized).not.toContain("expectedAnswers");
    expect(serialized).not.toContain("gradingExplanation");
    expect(serialized).not.toContain("adversarialAnswers");
    expect(serialized).not.toContain("learner-1");
    expect(serialized).not.toContain("C:/");
    expect(serialized).not.toContain("ASSINI_LLM_API_KEY");
    expect(serialized).not.toContain("sk-");
  });

  it("sanitizes storage failures while preserving privileged diagnostics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-metrics-"));
    const dbPath = join(dir, "local-db.json");
    await writeFile(dbPath, "{ not valid json with C:/secret/local-db.json }", "utf8");
    const app = createServer({ store: new JsonStore(dbPath), now: () => Date.parse("2026-06-15T12:00:00.000Z") });

    const response = await app.inject({
      method: "GET",
      url: "/observability/metrics",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().storage).toEqual({ ok: false, error: "Storage read failed" });
    expect(JSON.stringify(response.json())).not.toContain(dbPath);
    expect(JSON.stringify(response.json())).not.toContain("C:/secret/local-db.json");
    expect(JSON.stringify(response.json())).not.toContain("not valid json");
  });

  it("reports queue depth as counts only without job identifiers", async () => {
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      now: () => Date.parse("2026-06-15T12:00:00.000Z")
    });

    const response = await app.inject({
      method: "GET",
      url: "/observability/metrics",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().jobQueue).sort()).toEqual(["active", "pending"]);
    expect(typeof response.json().jobQueue.pending).toBe("number");
    expect(typeof response.json().jobQueue.active).toBe("number");
    expect(JSON.stringify(response.json().jobQueue)).not.toContain("source-");
  });

  it("buckets request latency at every documented boundary", async () => {
    let currentTime = 0;
    const durations = [10, 50, 250, 1_000, 1_001];
    let state = buildTestWorkspaceState();
    const store = {
      read: async () => {
        currentTime += durations.shift() ?? 0;
        return state;
      },
      update: async (updater: (current: AppState) => AppState) => {
        state = updater(state);
        return state;
      }
    } as unknown as JsonStore;
    const app = createServer({ store, now: () => currentTime });

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/observability/ai-sessions",
        headers: authHeaders("programmer-1")
      });
      expect(response.statusCode).toBe(200);
    }

    const snapshot = await app.inject({
      method: "GET",
      url: "/observability/metrics",
      headers: authHeaders("programmer-1")
    });

    expect(snapshot.json().requests.latencyMs).toEqual({
      count: 5,
      average: 462,
      max: 1_001,
      byBucket: { le10: 1, le50: 1, le250: 1, le1000: 1, gt1000: 1 }
    });
  });

  it("reports startup recovery failure without exposing the underlying store exception", async () => {
    const state = buildTestWorkspaceState();
    const store = {
      read: async () => state,
      update: async () => {
        throw new Error("Failed C:/private/workspace.json with sk-live-secret and source text");
      }
    } as unknown as JsonStore;
    const app = createServer({ store, now: () => Date.parse("2026-06-15T12:00:00.000Z") });

    const response = await app.inject({
      method: "GET",
      url: "/observability/metrics",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recovery.startup).toEqual({
      status: "failed",
      recovered: 0,
      completedAt: "2026-06-15T12:00:00.000Z"
    });
    const serialized = JSON.stringify(response.json());
    expect(serialized).not.toContain("C:/private");
    expect(serialized).not.toContain("sk-live-secret");
    expect(serialized).not.toContain("source text");
  });
});
