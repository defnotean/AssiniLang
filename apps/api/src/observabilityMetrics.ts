import type { AppState } from "@assini/db";
import type { JobQueueStatus } from "./jobQueue.js";
import type { RequestMetrics, RequestStatusClass } from "./routes/context.js";

const STORAGE_READ_FAILED = "Storage read failed" as const;
const STATUS_CLASSES = ["1xx", "2xx", "3xx", "4xx", "5xx"] as const satisfies readonly RequestStatusClass[];

export type ObservabilityMetricsSnapshot = {
  uptimeMs: number;
  serverTime: string;
  requests: {
    total: number;
    byStatusClass: Record<RequestStatusClass, number>;
  };
  jobQueue: {
    pending: number;
    active: number;
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

function safeRequestCounts(requestMetrics: RequestMetrics): ObservabilityMetricsSnapshot["requests"] {
  const byStatusClass = Object.fromEntries(
    STATUS_CLASSES.map((statusClass) => {
      const value = requestMetrics.requests.byStatusClass[statusClass];
      return [statusClass, isSafeCount(value) ? value : 0];
    })
  ) as Record<RequestStatusClass, number>;

  return {
    total: isSafeCount(requestMetrics.requests.total) ? requestMetrics.requests.total : 0,
    byStatusClass
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

/**
 * Builds the privileged `/observability/metrics` payload. Counts and timestamps are
 * clamped to safe values; storage/queue failures collapse to fixed sanitized shapes
 * so local paths, job ids, and exception text never leave the process.
 */
export function buildObservabilityMetricsSnapshot(input: {
  nowMs: number;
  requestMetrics: RequestMetrics;
  readJobQueueStatus: () => JobQueueStatus;
  state: AppState | undefined;
}): ObservabilityMetricsSnapshot {
  const startedAtMs = isSafeCount(input.requestMetrics.startedAtMs)
    ? input.requestMetrics.startedAtMs
    : 0;
  const snapshotTime = Number.isFinite(input.nowMs) ? input.nowMs : startedAtMs;

  return {
    uptimeMs: Math.max(0, Math.trunc(snapshotTime - startedAtMs) || 0),
    serverTime: safeServerTime(snapshotTime),
    requests: safeRequestCounts(input.requestMetrics),
    jobQueue: safeJobQueueCounts(input.readJobQueueStatus),
    storage: safeStorageStatus(input.state)
  };
}
