import type { AppState } from "@assini/db";
import type { JobQueueMetrics, JobQueueStatus } from "./jobQueue.js";
import type { RecoveryMetrics, RequestLatencyBucket, RequestMetrics, RequestStatusClass } from "./routes/context.js";

const STORAGE_READ_FAILED = "Storage read failed" as const;
const STATUS_CLASSES = ["1xx", "2xx", "3xx", "4xx", "5xx"] as const satisfies readonly RequestStatusClass[];
const LATENCY_BUCKETS = [
  "le10",
  "le50",
  "le250",
  "le1000",
  "gt1000"
] as const satisfies readonly RequestLatencyBucket[];

export type ObservabilityMetricsSnapshot = {
  uptimeMs: number;
  serverTime: string;
  requests: {
    total: number;
    byStatusClass: Record<RequestStatusClass, number>;
    errors: {
      total: number;
      client: number;
      server: number;
    };
    latencyMs: {
      count: number;
      average: number;
      max: number;
      byBucket: Record<RequestLatencyBucket, number>;
    };
  };
  jobQueue: {
    pending: number;
    active: number;
  };
  jobs: JobQueueMetrics & {
    durationMs: JobQueueMetrics["durationMs"] & { average: number };
  };
  recovery: {
    startup: {
      status: RecoveryMetrics["startup"]["status"];
      recovered: number;
      completedAt?: string;
    };
    staleSweep: {
      status: RecoveryMetrics["staleSweep"]["status"];
      runs: number;
      failures: number;
      totalRecovered: number;
      lastRunAt?: string;
      lastSuccessAt?: string;
    };
  };
  storage:
    | {
        ok: true;
        schemaVersion: AppState["schemaVersion"];
      }
    | {
        ok: false;
        error: typeof STORAGE_READ_FAILED;
      };
};

function isSafeCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSafeSchemaVersion(value: unknown): value is AppState["schemaVersion"] {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function safeServerTime(ms: number): string {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function safeOptionalTime(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  const value = safeServerTime(ms);
  return value === new Date(0).toISOString() && ms !== 0 ? undefined : value;
}

function safeRequestCounts(requestMetrics: RequestMetrics): ObservabilityMetricsSnapshot["requests"] {
  const byStatusClass = Object.fromEntries(
    STATUS_CLASSES.map((statusClass) => {
      const value = requestMetrics.requests.byStatusClass[statusClass];
      return [statusClass, isSafeCount(value) ? value : 0];
    })
  ) as Record<RequestStatusClass, number>;

  const latency = requestMetrics.requests.latencyMs;
  const count = isSafeCount(latency.count) ? latency.count : 0;
  const total = isSafeCount(latency.total) ? latency.total : 0;
  const max = isSafeCount(latency.max) ? latency.max : 0;
  const byBucket = Object.fromEntries(
    LATENCY_BUCKETS.map((bucket) => [bucket, isSafeCount(latency.byBucket[bucket]) ? latency.byBucket[bucket] : 0])
  ) as Record<RequestLatencyBucket, number>;
  const client = byStatusClass["4xx"];
  const server = byStatusClass["5xx"];

  return {
    total: isSafeCount(requestMetrics.requests.total) ? requestMetrics.requests.total : 0,
    byStatusClass,
    errors: {
      total: Math.min(Number.MAX_SAFE_INTEGER, client + server),
      client,
      server
    },
    latencyMs: {
      count,
      average: count > 0 ? Math.floor(total / count) : 0,
      max,
      byBucket
    }
  };
}

function safeJobQueueCounts(readJobQueueStatus: () => JobQueueStatus): ObservabilityMetricsSnapshot["jobQueue"] {
  try {
    const status = readJobQueueStatus();
    if (!isSafeCount(status.pending) || !isSafeCount(status.active)) {
      return { pending: 0, active: 0 };
    }
    return { pending: status.pending, active: status.active };
  } catch {
    // Never surface queue ids, paths, or provider errors from this privileged snapshot.
    return { pending: 0, active: 0 };
  }
}

function safeStorageStatus(state: AppState | undefined): ObservabilityMetricsSnapshot["storage"] {
  if (!state || !isSafeSchemaVersion(state.schemaVersion)) {
    return { ok: false, error: STORAGE_READ_FAILED };
  }

  return {
    ok: true,
    schemaVersion: state.schemaVersion
  };
}

function safeJobMetrics(metrics: JobQueueMetrics): ObservabilityMetricsSnapshot["jobs"] {
  const durationCount = isSafeCount(metrics.durationMs.count) ? metrics.durationMs.count : 0;
  const durationTotal = isSafeCount(metrics.durationMs.total) ? metrics.durationMs.total : 0;
  return {
    enqueued: isSafeCount(metrics.enqueued) ? metrics.enqueued : 0,
    completed: isSafeCount(metrics.completed) ? metrics.completed : 0,
    failed: isSafeCount(metrics.failed) ? metrics.failed : 0,
    cancelled: isSafeCount(metrics.cancelled) ? metrics.cancelled : 0,
    duplicateRejected: isSafeCount(metrics.duplicateRejected) ? metrics.duplicateRejected : 0,
    durationMs: {
      count: durationCount,
      total: durationTotal,
      average: durationCount > 0 ? Math.floor(durationTotal / durationCount) : 0,
      max: isSafeCount(metrics.durationMs.max) ? metrics.durationMs.max : 0
    }
  };
}

function readSafeJobMetrics(readMetrics: () => JobQueueMetrics): ObservabilityMetricsSnapshot["jobs"] {
  try {
    const metrics = readMetrics();
    if (!metrics || typeof metrics !== "object" || !metrics.durationMs) {
      throw new Error("invalid job metrics");
    }
    return safeJobMetrics(metrics);
  } catch {
    return safeJobMetrics({
      enqueued: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      duplicateRejected: 0,
      durationMs: { count: 0, total: 0, max: 0 }
    });
  }
}

function safeRecoveryMetrics(metrics: RecoveryMetrics): ObservabilityMetricsSnapshot["recovery"] {
  const startupCompletedAt = safeOptionalTime(metrics.startup.completedAtMs);
  const lastRunAt = safeOptionalTime(metrics.staleSweep.lastRunAtMs);
  const lastSuccessAt = safeOptionalTime(metrics.staleSweep.lastSuccessAtMs);
  return {
    startup: {
      status: ["pending", "succeeded", "failed"].includes(metrics.startup.status) ? metrics.startup.status : "failed",
      recovered: isSafeCount(metrics.startup.recovered) ? metrics.startup.recovered : 0,
      ...(startupCompletedAt === undefined ? {} : { completedAt: startupCompletedAt })
    },
    staleSweep: {
      status: ["idle", "running", "failed"].includes(metrics.staleSweep.status) ? metrics.staleSweep.status : "failed",
      runs: isSafeCount(metrics.staleSweep.runs) ? metrics.staleSweep.runs : 0,
      failures: isSafeCount(metrics.staleSweep.failures) ? metrics.staleSweep.failures : 0,
      totalRecovered: isSafeCount(metrics.staleSweep.totalRecovered) ? metrics.staleSweep.totalRecovered : 0,
      ...(lastRunAt === undefined ? {} : { lastRunAt }),
      ...(lastSuccessAt === undefined ? {} : { lastSuccessAt })
    }
  };
}

/**
 * Builds the privileged `/observability/metrics` payload. Counts and timestamps are
 * clamped to safe values; storage/queue failures collapse to fixed sanitized shapes
 * so local paths, job ids, and exception text never leave the process.
 */
export function buildObservabilityMetricsSnapshot(input: {
  nowMs: number;
  requestMetrics: RequestMetrics;
  readJobQueueStatus: () => JobQueueStatus;
  readJobQueueMetrics: () => JobQueueMetrics;
  recoveryMetrics: RecoveryMetrics;
  state: AppState | undefined;
}): ObservabilityMetricsSnapshot {
  const startedAtMs = isSafeCount(input.requestMetrics.startedAtMs) ? input.requestMetrics.startedAtMs : 0;
  const snapshotTime = Number.isFinite(input.nowMs) ? input.nowMs : startedAtMs;

  return {
    uptimeMs: Math.max(0, Math.trunc(snapshotTime - startedAtMs) || 0),
    serverTime: safeServerTime(snapshotTime),
    requests: safeRequestCounts(input.requestMetrics),
    jobQueue: safeJobQueueCounts(input.readJobQueueStatus),
    jobs: readSafeJobMetrics(input.readJobQueueMetrics),
    recovery: safeRecoveryMetrics(input.recoveryMetrics),
    storage: safeStorageStatus(input.state)
  };
}
