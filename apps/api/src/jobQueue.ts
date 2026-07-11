type Job = {
  id: string;
  fn: () => Promise<void>;
};

export type JobQueueMetrics = {
  enqueued: number;
  completed: number;
  failed: number;
  cancelled: number;
  duplicateRejected: number;
  durationMs: {
    count: number;
    total: number;
    max: number;
  };
};

export type JobQueueLogFields = {
  event:
    | "job.duplicate_rejected"
    | "job.enqueued"
    | "job.started"
    | "job.completed"
    | "job.failed"
    | "job.cancel_rejected"
    | "job.cancelled";
  pending: number;
  active: number;
  durationMs?: number;
};

export type JobQueueLogger = {
  info?: (fields: JobQueueLogFields, message: string) => void;
  warn?: (fields: JobQueueLogFields, message: string) => void;
  error?: (fields: JobQueueLogFields, message: string) => void;
};

export type JobQueueStatus = {
  pending: number;
  active: number;
};

export class JobQueue {
  private queue: Job[] = [];
  private activeJobs = new Set<string>();
  private metrics: JobQueueMetrics = {
    enqueued: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    duplicateRejected: 0,
    durationMs: { count: 0, total: 0, max: 0 }
  };

  constructor(
    private readonly concurrency: number = 2,
    private readonly logger?: JobQueueLogger,
    private readonly now: () => number = Date.now
  ) {}

  private logFields(event: JobQueueLogFields["event"], durationMs?: number): JobQueueLogFields {
    return {
      event,
      pending: this.queue.length,
      active: this.activeJobs.size,
      ...(durationMs === undefined ? {} : { durationMs })
    };
  }

  private elapsedMs(startedAtMs: number): number {
    const endedAtMs = this.now();
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return 0;
    const elapsed = Math.max(0, Math.trunc(endedAtMs - startedAtMs));
    return Number.isSafeInteger(elapsed) ? elapsed : 0;
  }

  private recordDuration(durationMs: number): void {
    this.metrics.durationMs.count += 1;
    this.metrics.durationMs.total = Math.min(Number.MAX_SAFE_INTEGER, this.metrics.durationMs.total + durationMs);
    this.metrics.durationMs.max = Math.max(this.metrics.durationMs.max, durationMs);
  }

  add(id: string, fn: () => Promise<void>): void {
    if (this.queue.some((j) => j.id === id) || this.activeJobs.has(id)) {
      this.metrics.duplicateRejected += 1;
      this.logger?.warn?.(this.logFields("job.duplicate_rejected"), "Job is already queued or active");
      return;
    }
    this.queue.push({ id, fn });
    this.metrics.enqueued += 1;
    this.logger?.info?.(this.logFields("job.enqueued"), "Job added to queue");
    this.next();
  }

  private next(): void {
    if (this.activeJobs.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift()!;
    this.activeJobs.add(job.id);
    const startedAtMs = this.now();
    this.logger?.info?.(this.logFields("job.started"), "Starting queued job");

    void (async () => {
      try {
        await job.fn();
        const durationMs = this.elapsedMs(startedAtMs);
        this.metrics.completed += 1;
        this.recordDuration(durationMs);
        this.logger?.info?.(this.logFields("job.completed", durationMs), "Job completed successfully");
      } catch {
        const durationMs = this.elapsedMs(startedAtMs);
        this.metrics.failed += 1;
        this.recordDuration(durationMs);
        // Never hand the thrown error or caller-controlled id to the logger. Provider
        // errors can contain source text, local paths, endpoint credentials, or tokens.
        this.logger?.error?.(this.logFields("job.failed", durationMs), "Error running queued job");
      } finally {
        this.activeJobs.delete(job.id);
        this.next();
      }
    })();
  }

  isQueuedOrActive(id: string): boolean {
    return this.activeJobs.has(id) || this.queue.some((j) => j.id === id);
  }

  isActive(id: string): boolean {
    return this.activeJobs.has(id);
  }

  isPending(id: string): boolean {
    return this.queue.some((j) => j.id === id);
  }

  /**
   * Removes a pending job before it starts. Returns true when removed.
   * Active jobs cannot be cancelled; returns false if the id is active or absent.
   */
  cancel(id: string): boolean {
    if (this.activeJobs.has(id)) {
      this.logger?.warn?.(this.logFields("job.cancel_rejected"), "Cannot cancel active job");
      return false;
    }
    const index = this.queue.findIndex((j) => j.id === id);
    if (index === -1) {
      return false;
    }
    this.queue.splice(index, 1);
    this.metrics.cancelled += 1;
    this.logger?.info?.(this.logFields("job.cancelled"), "Pending job cancelled");
    return true;
  }

  getStatus(): JobQueueStatus {
    return {
      pending: this.queue.length,
      active: this.activeJobs.size
    };
  }

  /** Aggregate-only diagnostics. No caller-controlled job ids or error text. */
  getMetrics(): JobQueueMetrics {
    return {
      ...this.metrics,
      durationMs: { ...this.metrics.durationMs }
    };
  }

  getPendingAndActiveIds(): { pending: string[]; active: string[] } {
    return {
      pending: this.queue.map((j) => j.id),
      active: Array.from(this.activeJobs)
    };
  }
}
