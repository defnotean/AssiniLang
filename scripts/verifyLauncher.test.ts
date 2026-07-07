import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createVerificationSteps, runVerificationSteps } from "./verifyLauncher.mjs";

function exitOnNextTick(code: number) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit("exit", code, null));
  return child;
}

describe("repository verification launcher", () => {
  it("builds a Windows-safe full-stack verification plan in dependency order", () => {
    const steps = createVerificationSteps({ platform: "win32", env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" } });

    expect(steps.map((step) => step.name)).toEqual(["test", "check", "seed", "eval", "build"]);
    expect(steps.map((step) => step.args)).toEqual([
      ["/d", "/s", "/c", "npm.cmd run test"],
      ["/d", "/s", "/c", "npm.cmd run check"],
      ["/d", "/s", "/c", "npm.cmd run seed"],
      ["/d", "/s", "/c", "npm.cmd run eval"],
      ["/d", "/s", "/c", "npm.cmd run build"]
    ]);
    expect(steps.every((step) => step.command === "C:\\Windows\\System32\\cmd.exe")).toBe(true);
    expect(steps.every((step) => step.options.stdio === "inherit")).toBe(true);
    expect(steps.every((step) => step.options.windowsHide === true)).toBe(true);
    expect(steps.find((step) => step.name === "seed")?.options.env?.ASSINI_DB_PATH).toMatch(/local-db\.json$/);
    expect(steps.find((step) => step.name === "eval")?.options.env?.ASSINI_DB_PATH)
      .toBe(steps.find((step) => step.name === "seed")?.options.env?.ASSINI_DB_PATH);
  });

  it("uses plain npm on non-Windows platforms", () => {
    const steps = createVerificationSteps({ platform: "linux", env: {} });

    expect(steps.map((step) => ({ command: step.command, args: step.args }))).toEqual([
      { command: "npm", args: ["run", "test"] },
      { command: "npm", args: ["run", "check"] },
      { command: "npm", args: ["run", "seed"] },
      { command: "npm", args: ["run", "eval"] },
      { command: "npm", args: ["run", "build"] }
    ]);
    expect(steps.every((step) => step.options.windowsHide === false)).toBe(true);
  });

  it("runs verification steps sequentially and stops on the first failure", async () => {
    const calls: string[] = [];
    const result = await runVerificationSteps({
      steps: [
        { name: "test", command: "npm", args: ["run", "test"], options: { stdio: "inherit", windowsHide: false } },
        { name: "check", command: "npm", args: ["run", "check"], options: { stdio: "inherit", windowsHide: false } },
        { name: "build", command: "npm", args: ["run", "build"], options: { stdio: "inherit", windowsHide: false } }
      ],
      spawnFn(command, args) {
        calls.push(`${command} ${args.join(" ")}`);
        return exitOnNextTick(calls.length === 2 ? 1 : 0);
      },
      stdout: { write() {} },
      stderr: { write() {} }
    });

    expect(calls).toEqual(["npm run test", "npm run check"]);
    expect(result).toEqual({ exitCode: 1, failedStep: "check" });
  });
});
