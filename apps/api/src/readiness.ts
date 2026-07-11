import type { AppState } from "@assini/db";
import type { JobQueueStatus } from "./jobQueue.js";
import type { RecoveryMetrics } from "./routes/context.js";

const STORAGE_READ_FAILED = "Storage read failed" as const;
const JOB_QUEUE_UNAVAILABLE = "Job queue status unavailable" as const;
const STARTUP_RECOVERY_PENDING = "Startup recovery pending" as const;
const STARTUP_RECOVERY_FAILED = "Startup recovery failed" as const;

type StorageReadinessCheck =
  | {
      ok: true;
      schemaVersion: AppState["schemaVersion"];
    }
  | {
      ok: false;
      error: typeof STORAGE_READ_FAILED;
    };

type JobQueueReadinessCheck =
  | {
      ok: true;
      pending: number;
      active: number;
    }
  | {
      ok: false;
      error: typeof JOB_QUEUE_UNAVAILABLE;
    };

type RecoveryReadinessCheck =
  | {
      ok: true;
      status: "succeeded";
      recovered: number;
    }
  | {
      ok: false;
      status: "pending" | "failed";
      error: typeof STARTUP_RECOVERY_PENDING | typeof STARTUP_RECOVERY_FAILED;
    };

export type ReadinessReport =
  | {
      ok: true;
      checks: {
        storage: Extract<StorageReadinessCheck, { ok: true }>;
        jobQueue: Extract<JobQueueReadinessCheck, { ok: true }>;
        recovery: Extract<RecoveryReadinessCheck, { ok: true }>;
      };
    }
  | {
      ok: false;
      checks: {
        storage: StorageReadinessCheck;
        jobQueue: JobQueueReadinessCheck;
        recovery: RecoveryReadinessCheck;
      };
    };

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafeSchemaVersion(value: unknown): value is AppState["schemaVersion"] {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function readJobQueueCheck(readJobQueueStatus: () => JobQueueStatus): JobQueueReadinessCheck {
  try {
    const status = readJobQueueStatus();
    if (status == null || typeof status !== "object" || !isSafeCount(status.pending) || !isSafeCount(status.active)) {
      return { ok: false, error: JOB_QUEUE_UNAVAILABLE };
    }

    return {
      ok: true,
      pending: status.pending,
      active: status.active
    };
  } catch {
    return { ok: false, error: JOB_QUEUE_UNAVAILABLE };
  }
}

function readStorageCheck(state: AppState): StorageReadinessCheck {
  if (!state || !isSafeSchemaVersion(state.schemaVersion)) {
    return { ok: false, error: STORAGE_READ_FAILED };
  }

  return {
    ok: true,
    schemaVersion: state.schemaVersion
  };
}

function readRecoveryCheck(readRecoveryStatus: () => RecoveryMetrics["startup"]): RecoveryReadinessCheck {
  try {
    const status = readRecoveryStatus();
    if (status?.status === "succeeded" && isSafeCount(status.recovered)) {
      return { ok: true, status: "succeeded", recovered: status.recovered };
    }
    if (status?.status === "pending") {
      return { ok: false, status: "pending", error: STARTUP_RECOVERY_PENDING };
    }
    return { ok: false, status: "failed", error: STARTUP_RECOVERY_FAILED };
  } catch {
    return { ok: false, status: "failed", error: STARTUP_RECOVERY_FAILED };
  }
}

export async function createReadinessReport(
  readState: () => Promise<AppState>,
  readJobQueueStatus: () => JobQueueStatus = () => ({ pending: 0, active: 0 }),
  readRecoveryStatus: () => RecoveryMetrics["startup"] = () => ({ status: "succeeded", recovered: 0 })
): Promise<ReadinessReport> {
  const jobQueue = readJobQueueCheck(readJobQueueStatus);
  const recovery = readRecoveryCheck(readRecoveryStatus);

  try {
    const storage = readStorageCheck(await readState());
    if (!storage.ok || !jobQueue.ok || !recovery.ok) {
      return {
        ok: false,
        checks: {
          storage,
          jobQueue,
          recovery
        }
      };
    }

    return {
      ok: true,
      checks: {
        storage,
        jobQueue,
        recovery
      }
    };
  } catch {
    return {
      ok: false,
      checks: {
        storage: {
          ok: false,
          error: STORAGE_READ_FAILED
        },
        jobQueue,
        recovery
      }
    };
  }
}
