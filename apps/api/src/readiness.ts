import type { AppState } from "@assini/db";
import type { JobQueueStatus } from "./jobQueue.js";

type StorageReadinessCheck =
  | {
      ok: true;
      schemaVersion: AppState["schemaVersion"];
    }
  | {
      ok: false;
      error: "Storage read failed";
    };

type JobQueueReadinessCheck =
  | {
      ok: true;
      pending: number;
      active: number;
    }
  | {
      ok: false;
      error: "Job queue status unavailable";
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

function isSafeCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSafeSchemaVersion(value: unknown): value is AppState["schemaVersion"] {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function readJobQueueCheck(readJobQueueStatus: () => JobQueueStatus): JobQueueReadinessCheck {
  try {
    const status = readJobQueueStatus();
    if (!isSafeCount(status.pending) || !isSafeCount(status.active)) {
      return { ok: false, error: "Job queue status unavailable" };
    }

    return {
      ok: true,
      pending: status.pending,
      active: status.active
    };
  } catch {
    return { ok: false, error: "Job queue status unavailable" };
  }
}

function readStorageCheck(state: AppState): StorageReadinessCheck {
  if (!isSafeSchemaVersion(state.schemaVersion)) {
    return { ok: false, error: "Storage read failed" };
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
    const storage: StorageReadinessCheck = {
      ok: false,
      error: "Storage read failed"
    };
    return {
      ok: false,
      checks: {
        storage,
        jobQueue
      }
    };
  }
}
