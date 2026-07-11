import { describe, expect, it } from "vitest";
import { CI_GREEN_AUDIT_ARGS, createCiGreenAuditSpec, runCiGreenSmoke } from "./ciGreenSmoke.mjs";

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
      stdout: { write() {} },
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
      stdout: { write() {} },
      stderr: { write() {} }
    });

    expect(result.exitCode).toBe(1);
  });

  it("reports spawnSync error objects without claiming a clean audit failure", () => {
    const stderr: string[] = [];
    const spawnError = Object.assign(new Error("spawn npm ENOENT"), { code: "ENOENT" });
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        return { status: null, error: spawnError };
      },
      stdout: { write() {} },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result).toEqual({
      exitCode: 1,
      command: "npm",
      args: ["audit", "--omit=dev", "--audit-level=moderate"],
      error: spawnError
    });
    expect(stderr.join("")).toContain("production dependency audit failed to start: spawn npm ENOENT");
  });

  it("reports thrown spawnSync failures without claiming a clean audit failure", () => {
    const stderr: string[] = [];
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        throw new Error("cmd.exe missing");
      },
      stdout: { write() {} },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.command).toBe("npm");
    expect(result.error).toBeInstanceOf(Error);
    expect(stderr.join("")).toContain("production dependency audit failed to start: cmd.exe missing");
  });

  it("reports signal terminations as failures", () => {
    const stderr: string[] = [];
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        return { status: null, signal: "SIGTERM" };
      },
      stdout: { write() {} },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result).toEqual({
      exitCode: 1,
      command: "npm",
      args: ["audit", "--omit=dev", "--audit-level=moderate"],
      signal: "SIGTERM"
    });
    expect(stderr.join("")).toContain("production dependency audit terminated by signal SIGTERM");
  });

  it("returns exit code 0 and writes a pass line when the production audit passes", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const result = runCiGreenSmoke({
      platform: "linux",
      env: {},
      spawnSyncFn() {
        return { status: 0 };
      },
      stdout: {
        write(message) {
          stdout.push(String(message));
        }
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
    expect(stdout.join("")).toContain("production dependency audit passed");
    expect(stderr).toEqual([]);
  });
});
