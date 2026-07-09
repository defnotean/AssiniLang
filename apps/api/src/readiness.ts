import type { AppState } from "@assini/db";
import type { JobQueueStatus } from "./jobQueue.js";

const STORAGE_READ_FAILED = "Storage read failed" as const;
const JOB_QUEUE_UNAVAILABLE = "Job queue status unavailable" as const;

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

export type ReadinessReport =
  | {
      ok: true;
      checks: {
        storage: Extract<StorageReadinessCheck, { ok: true }>;
        jobQueue: Extract<JobQueueReadinessCheck, { ok: true }>;
      };
    }
  | {
      ok: false;
      checks: {
        storage: StorageReadinessCheck;
        jobQueue: JobQueueReadinessCheck;
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
    if (
      status == null
      || typeof status !== "object"
      || !isSafeCount(status.pending)
      || !isSafeCount(status.active)
    ) {
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

export async function createReadinessReport(
  readState: () => Promise<AppState>,
  readJobQueueStatus: () => JobQueueStatus = () => ({ pending: 0, active: 0 })
): Promise<ReadinessReport> {
  const jobQueue = readJobQueueCheck(readJobQueueStatus);

  try {
    const storage = readStorageCheck(await readState());
    if (!storage.ok || !jobQueue.ok) {
      return {
        ok: false,
        checks: {
          storage,
          jobQueue
        }
      };
    }

    return {
      ok: true,
      checks: {
        storage,
        jobQueue
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
        jobQueue
      }
    };
  }
}
