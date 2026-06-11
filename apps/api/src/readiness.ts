import type { AppState } from "@assini/db";

export type ReadinessReport =
  | {
      ok: true;
      checks: {
        storage: {
          ok: true;
          schemaVersion: AppState["schemaVersion"];
        };
      };
    }
  | {
      ok: false;
      checks: {
        storage: {
          ok: false;
          error: "Storage read failed";
        };
      };
    };

export async function createReadinessReport(readState: () => Promise<AppState>): Promise<ReadinessReport> {
  try {
    const state = await readState();
    return {
      ok: true,
      checks: {
        storage: {
          ok: true,
          schemaVersion: state.schemaVersion
        }
      }
    };
  } catch {
    return {
      ok: false,
      checks: {
        storage: {
          ok: false,
          error: "Storage read failed"
        }
      }
    };
  }
}
