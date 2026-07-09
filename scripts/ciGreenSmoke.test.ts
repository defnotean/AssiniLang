import { describe, expect, it } from "vitest";
import {
  CI_GREEN_AUDIT_ARGS,
  createCiGreenAuditSpec,
  runCiGreenSmoke
} from "./ciGreenSmoke.mjs";

describe("ci:green smoke helper", () => {
  it("audits production dependencies only at the moderate level", () => {
    expect(CI_GREEN_AUDIT_ARGS).toEqual(["audit", "--omit=dev", "--audit-level=moderate"]);
  });

  it("builds a Windows-safe npm audit spawn spec", () => {
    const spec = createCiGreenAuditSpec({
      platform: "win32",
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" }
    });

    expect(spec).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd audit --omit=dev --audit-level=moderate"]
    });
  });

  it("uses plain npm on non-Windows platforms", () => {
    expect(createCiGreenAuditSpec({ platform: "linux", env: {} })).toEqual({
      command: "npm",
      args: ["audit", "--omit=dev", "--audit-level=moderate"]
    });
  });

  it("returns a non-zero exit code and writes a failure line when audit fails", () => {
    const stderr: string[] = [];
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        return { status: 1 };
      },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.command).toBe("npm");
    expect(result.args).toEqual(["audit", "--omit=dev", "--audit-level=moderate"]);
    expect(stderr.join("")).toContain("production dependency audit failed");
  });

  it("treats a missing spawn status as failure", () => {
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        return { status: null };
      },
      stderr: { write() {} }
    });

    expect(result.exitCode).toBe(1);
  });

  it("returns exit code 0 when the production audit passes", () => {
    const stderr: string[] = [];
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        return { status: 0 };
      },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result).toEqual({
      exitCode: 0,
      command: "npm",
      args: ["audit", "--omit=dev", "--audit-level=moderate"]
    });
    expect(stderr).toEqual([]);
  });
});
