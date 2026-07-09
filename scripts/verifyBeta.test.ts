import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createVerifyBetaStep,
  modelVerifyRequested,
  resolveModelNameForVerify,
  runVerifyBeta
} from "./verifyBeta.mjs";

function exitOnNextTick(code: number | null, signal: NodeJS.Signals | null = null) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit("exit", code, signal));
  return child;
}

describe("verify:beta launcher", () => {
  it("does not request model verification by default", () => {
    expect(modelVerifyRequested({})).toBe(false);
    expect(modelVerifyRequested({ ASSINI_VERIFY_MODEL: "Irene" })).toBe(false);
  });

  it("requests model verification when ASSINI_VERIFY_MODEL=1", () => {
    expect(modelVerifyRequested({ ASSINI_VERIFY_MODEL: "1" })).toBe(true);
    expect(modelVerifyRequested({ ASSINI_VERIFY_MODEL: " true " })).toBe(true);
  });

  it("resolves the model name when ASSINI_VERIFY_MODEL is used as the opt-in gate", () => {
    expect(resolveModelNameForVerify({ ASSINI_VERIFY_MODEL: "1" })).toBe("Irene");
    expect(
      resolveModelNameForVerify({
        ASSINI_VERIFY_MODEL: "1",
        ASSINI_VERIFY_MODEL_NAME: "llama3.1"
      })
    ).toBe("llama3.1");
    expect(resolveModelNameForVerify({ ASSINI_VERIFY_MODEL: "Mistral" })).toBe("Mistral");
  });

  it("skips model:verify and exits cleanly when the opt-in gate is unset", async () => {
    const stdout: string[] = [];
    const result = await runVerifyBeta({
      env: {},
      stdout: { write(message) { stdout.push(String(message)); } },
      stderr: { write() {} }
    });

    expect(result).toEqual({ exitCode: 0, skipped: true });
    expect(stdout.join("")).toContain("skipping model:verify");
    expect(stdout.join("")).toContain("ASSINI_VERIFY_MODEL=1");
  });

  it("builds a Windows-safe model:verify step when the opt-in gate is set", () => {
    const step = createVerifyBetaStep({
      platform: "win32",
      env: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        ASSINI_VERIFY_MODEL: "1",
        ASSINI_VERIFY_MODEL_NAME: "llama3.1"
      }
    });

    expect(step).toEqual({
      name: "model:verify",
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd run model:verify"],
      options: {
        stdio: "inherit",
        windowsHide: true,
        env: expect.objectContaining({
          ASSINI_VERIFY_MODEL: "llama3.1"
        })
      }
    });
  });

  it("runs model:verify when ASSINI_VERIFY_MODEL=1", async () => {
    const calls: string[] = [];
    const stdout: string[] = [];
    const result = await runVerifyBeta({
      env: { ASSINI_VERIFY_MODEL: "1", ASSINI_VERIFY_MODEL_NAME: "llama3.1" },
      platform: "linux",
      spawnFn(command, args) {
        calls.push(`${command} ${args.join(" ")}`);
        return exitOnNextTick(0);
      },
      stdout: {
        write(message) {
          stdout.push(String(message));
        }
      },
      stderr: { write() {} }
    });

    expect(calls).toEqual(["npm run model:verify"]);
    expect(result).toEqual({ exitCode: 0, skipped: false, model: "llama3.1" });
    expect(stdout.join("")).toContain("preferred model: llama3.1");
    expect(stdout.join("")).toContain("model:verify passed");
  });

  it("propagates a non-zero model:verify exit code", async () => {
    const stderr: string[] = [];
    const result = await runVerifyBeta({
      env: { ASSINI_VERIFY_MODEL: "1" },
      platform: "linux",
      spawnFn() {
        return exitOnNextTick(2);
      },
      stdout: { write() {} },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result).toEqual({ exitCode: 2, skipped: false, failedStep: "model:verify" });
    expect(stderr.join("")).toContain("model:verify failed with exit code 2");
  });

  it("reports signal terminations without claiming a clean skip", async () => {
    const stderr: string[] = [];
    const result = await runVerifyBeta({
      env: { ASSINI_VERIFY_MODEL: "1" },
      platform: "linux",
      spawnFn() {
        return exitOnNextTick(null, "SIGTERM");
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
      skipped: false,
      failedStep: "model:verify",
      signal: "SIGTERM"
    });
    expect(stderr.join("")).toContain("model:verify terminated by signal SIGTERM");
  });

  it("reports spawn startup failures without claiming a clean skip", async () => {
    const stderr: string[] = [];
    const result = await runVerifyBeta({
      env: { ASSINI_VERIFY_MODEL: "true" },
      platform: "linux",
      spawnFn() {
        throw new Error("npm missing");
      },
      stdout: { write() {} },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.skipped).toBe(false);
    expect(result.failedStep).toBe("model:verify");
    expect(result.error).toBeInstanceOf(Error);
    expect(stderr.join("")).toContain("model:verify failed to start: npm missing");
  });

  it("reports async child error events without claiming a clean skip", async () => {
    const stderr: string[] = [];
    const result = await runVerifyBeta({
      env: { ASSINI_VERIFY_MODEL: "1" },
      platform: "linux",
      spawnFn() {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("error", new Error("spawn npm ENOENT")));
        return child;
      },
      stdout: { write() {} },
      stderr: {
        write(message) {
          stderr.push(String(message));
        }
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.skipped).toBe(false);
    expect(result.failedStep).toBe("model:verify");
    expect(result.error).toBeInstanceOf(Error);
    expect(stderr.join("")).toContain("model:verify failed to start: spawn npm ENOENT");
  });

  it("does not build a model:verify step when the opt-in gate is unset", () => {
    expect(createVerifyBetaStep({ platform: "linux", env: {} })).toBeNull();
  });
});
