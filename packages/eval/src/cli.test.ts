import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createBootstrapState, JsonStore } from "@assini/db";
import { describe, expect, it } from "vitest";
import { defaultEvalDbPath, resolveEvalDbPath, runEvaluationCli } from "./cli.js";

describe("evaluation CLI", () => {
  it("uses the default workspace database path", () => {
    expect(resolveEvalDbPath({})).toBe(defaultEvalDbPath);
  });

  it("honors ASSINI_DB_PATH for isolated verification runs", () => {
    const dbPath = join("tmp", "assini-verify", "local-db.json");

    expect(resolveEvalDbPath({ ASSINI_DB_PATH: ` ${dbPath} ` })).toBe(resolve(dbPath));
  });

  it("exits cleanly for an empty isolated workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-eval-cli-"));
    const dbPath = join(dir, "local-db.json");
    await new JsonStore(dbPath).write(createBootstrapState());
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runEvaluationCli({
      dbPath,
      env: {},
      stderr: (message) => stderr.push(String(message)),
      stdout: (message) => stdout.push(String(message))
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("No languages in the workspace yet");
    expect(stdout.join("\n")).toContain("System Eval");
  });

  it("fails when ASSINI_EVAL_REQUIRE_LANGUAGES is set and the workspace is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-eval-cli-require-"));
    const dbPath = join(dir, "local-db.json");
    await new JsonStore(dbPath).write(createBootstrapState());
    const stderr: string[] = [];

    const exitCode = await runEvaluationCli({
      dbPath,
      env: { ASSINI_EVAL_REQUIRE_LANGUAGES: "1" },
      stderr: (message) => stderr.push(String(message)),
      stdout: () => undefined
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("ASSINI_EVAL_REQUIRE_LANGUAGES");
  });
});
