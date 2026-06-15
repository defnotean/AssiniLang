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
          schemaVersion: 8
        },
        jobQueue: {
          ok: true,
          pending: 0,
          active: 0
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
          schemaVersion: 8
        },
        jobQueue: {
          ok: true,
          pending: 3,
          active: 2
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
          schemaVersion: 8
        },
        jobQueue: {
          ok: false,
          error: "Job queue status unavailable"
        }
      }
    });
    expect(JSON.stringify(report)).not.toContain("source-secret-123");
  });
});
