type Job = {
  id: string;
  fn: () => Promise<void>;
};

export type JobQueueStatus = {
  pending: number;
  active: number;
};

export class JobQueue {
  private queue: Job[] = [];
  private activeJobs = new Set<string>();

  constructor(private readonly concurrency: number = 2, private readonly logger?: any) {}

  add(id: string, fn: () => Promise<void>): void {
    if (this.queue.some((j) => j.id === id) || this.activeJobs.has(id)) {
      this.logger?.warn?.({ id }, "Job is already queued or active");
      return;
    }
    this.queue.push({ id, fn });
    this.logger?.info?.({ id, queueLength: this.queue.length }, "Job added to queue");
    this.next();
  }

  private next(): void {
    if (this.activeJobs.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift()!;
    this.activeJobs.add(job.id);
    this.logger?.info?.({ id: job.id, activeCount: this.activeJobs.size }, "Starting queued job");

    void (async () => {
      try {
        await job.fn();
        this.logger?.info?.({ id: job.id }, "Job completed successfully");
      } catch (error) {
        this.logger?.error?.({ err: error, id: job.id }, "Error running queued job");
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
      this.logger?.warn?.({ id }, "Cannot cancel active job");
      return false;
    }
    const index = this.queue.findIndex((j) => j.id === id);
    if (index === -1) {
      return false;
    }
    this.queue.splice(index, 1);
    this.logger?.info?.({ id, queueLength: this.queue.length }, "Pending job cancelled");
    return true;
  }

  getStatus(): JobQueueStatus {
    return {
      pending: this.queue.length,
      active: this.activeJobs.size
    };
  }

  getPendingAndActiveIds(): { pending: string[]; active: string[] } {
    return {
      pending: this.queue.map((j) => j.id),
      active: Array.from(this.activeJobs)
    };
  }
}
