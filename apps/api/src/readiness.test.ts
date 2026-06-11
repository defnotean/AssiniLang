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
        }
      }
    });
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
        }
      }
    });
    expect(JSON.stringify(report)).not.toContain("C:/secret/local-db.json");
  });
});
