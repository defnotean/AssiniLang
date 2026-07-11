import { describe, expect, it } from "vitest";
import { createEmptyState } from "@assini/db";
import { createReadinessReport } from "./readiness.js";

describe("createReadinessReport", () => {
  it("reports storage ready when state can be read and validated", async () => {
    await expect(createReadinessReport(async () => createEmptyState())).resolves.toEqual({
      ok: true,
      checks: {
        storage: {
          ok: true,
          schemaVersion: 9
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
  });

  it("reports job queue counts without exposing queue identifiers", async () => {
    const report = await createReadinessReport(
      async () => createEmptyState(),
      () => ({ pending: 3, active: 2 })
    );

    expect(report).toEqual({
      ok: true,
      checks: {
        storage: {
          ok: true,
          schemaVersion: 9
        },
        jobQueue: {
          ok: true,
          pending: 3,
          active: 2
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
    expect(JSON.stringify(report)).not.toContain("source-");
  });

  it("reports a sanitized storage failure without leaking exception details", async () => {
    const report = await createReadinessReport(async () => {
      throw new Error("Failed to read C:/secret/local-db.json");
    });

    expect(report).toEqual({
      ok: false,
      checks: {
        storage: {
          ok: false,
          error: "Storage read failed"
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
    expect(JSON.stringify(report)).not.toContain("C:/secret/local-db.json");
  });

  it("reports sanitized job queue status failure without leaking exception details", async () => {
    const report = await createReadinessReport(
      async () => createEmptyState(),
      () => {
        throw new Error("Cannot inspect source-secret-123");
      }
    );

    expect(report).toEqual({
      ok: false,
      checks: {
        storage: {
          ok: true,
          schemaVersion: 9
        },
        jobQueue: {
          ok: false,
          error: "Job queue status unavailable"
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
    expect(JSON.stringify(report)).not.toContain("source-secret-123");
  });

  it("reports both checks failed when storage and job queue fail together", async () => {
    const report = await createReadinessReport(
      async () => {
        throw new Error("Failed to read C:/secret/local-db.json with sk-live-secret");
      },
      () => {
        throw new Error("Cannot inspect source-secret-123 at C:/secret/queue.json");
      }
    );

    expect(report).toEqual({
      ok: false,
      checks: {
        storage: {
          ok: false,
          error: "Storage read failed"
        },
        jobQueue: {
          ok: false,
          error: "Job queue status unavailable"
        },
        recovery: {
          ok: true,
          status: "succeeded",
          recovered: 0
        }
      }
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("C:/secret");
    expect(serialized).not.toContain("source-secret-123");
    expect(serialized).not.toContain("sk-live-secret");
  });

  it("treats non-finite, negative, or non-integer job-queue counts as unavailable", async () => {
    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => ({ pending: -1, active: 0 })
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });

    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => ({ pending: 0, active: Number.NaN })
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });

    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => ({
          pending: Number.POSITIVE_INFINITY,
          active: 1
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });

    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => ({
          pending: 1.5,
          active: 0
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });

    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => ({
          pending: Number.MAX_SAFE_INTEGER + 1,
          active: 0
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });
  });

  it("treats nullish or non-object job-queue status as unavailable", async () => {
    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => null as never
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });

    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => undefined as never
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });

    await expect(
      createReadinessReport(
        async () => createEmptyState(),
        () => "pending" as never
      )
    ).resolves.toMatchObject({
      ok: false,
      checks: {
        jobQueue: { ok: false, error: "Job queue status unavailable" }
      }
    });
  });

  it("treats unsafe schema versions as sanitized storage failures", async () => {
    for (const schemaVersion of [Number.NaN, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "8" as never]) {
      const invalidSchema = {
        ...createEmptyState(),
        schemaVersion
      } as ReturnType<typeof createEmptyState>;

      const report = await createReadinessReport(async () => invalidSchema);

      expect(report).toEqual({
        ok: false,
        checks: {
          storage: {
            ok: false,
            error: "Storage read failed"
          },
          jobQueue: {
            ok: true,
            pending: 0,
            active: 0
          },
          recovery: {
            ok: true,
            status: "succeeded",
            recovered: 0
          }
        }
      });
      expect(JSON.stringify(report)).not.toContain("NaN");
      expect(JSON.stringify(report)).not.toContain("Infinity");
    }
  });

  it("does not expose job identifiers when queue status is healthy", async () => {
    const report = await createReadinessReport(
      async () => createEmptyState(),
      () => ({ pending: 1, active: 1 })
    );

    expect(report.ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("source-secret");
    expect(Object.keys(report.checks.jobQueue).sort()).toEqual(["active", "ok", "pending"]);
  });

  it("fails readiness with fixed diagnostics while startup recovery is pending or failed", async () => {
    const pending = await createReadinessReport(
      async () => createEmptyState(),
      () => ({ pending: 0, active: 0 }),
      () => ({ status: "pending", recovered: 0 })
    );
    expect(pending).toMatchObject({
      ok: false,
      checks: {
        recovery: { ok: false, status: "pending", error: "Startup recovery pending" }
      }
    });

    const failed = await createReadinessReport(
      async () => createEmptyState(),
      () => ({ pending: 0, active: 0 }),
      () => {
        throw new Error("C:/private/workspace with sk-live-secret");
      }
    );
    expect(failed).toMatchObject({
      ok: false,
      checks: {
        recovery: { ok: false, status: "failed", error: "Startup recovery failed" }
      }
    });
    expect(JSON.stringify(failed)).not.toContain("C:/private");
    expect(JSON.stringify(failed)).not.toContain("sk-live-secret");
  });
});
