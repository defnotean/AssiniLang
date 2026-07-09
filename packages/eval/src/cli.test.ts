import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildTestWorkspaceState, createBootstrapState, JsonStore } from "@assini/db";
import { describe, expect, it } from "vitest";
import {
  defaultEvalDbPath,
  EMPTY_WORKSPACE_EVAL_GUIDANCE,
  EMPTY_WORKSPACE_EVAL_REQUIRE_LANGUAGES_GUIDANCE,
  NO_EVAL_RUNS_CLI_GUIDANCE,
  resolveEvalDbPath,
  runEvaluationCli
} from "./cli.js";

describe("evaluation CLI", () => {
  it("uses the default workspace database path", () => {
    expect(resolveEvalDbPath({})).toBe(defaultEvalDbPath);
  });

  it("honors ASSINI_DB_PATH for isolated verification runs", () => {
    const dbPath = join("tmp", "assini-verify", "local-db.json");

    expect(resolveEvalDbPath({ ASSINI_DB_PATH: ` ${dbPath} ` })).toBe(resolve(dbPath));
  });

  it("exits cleanly for an empty isolated workspace with System Eval next-step guidance", async () => {
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
    expect(stdout).toEqual([...EMPTY_WORKSPACE_EVAL_GUIDANCE]);
    expect(stdout.join("\n")).toContain("No languages in the workspace yet");
    expect(stdout.join("\n")).toContain("System Eval");
  });

  it.each(["1", "true", "TRUE", " True "])(
    "fails when ASSINI_EVAL_REQUIRE_LANGUAGES=%s and the workspace is empty",
    async (requireValue) => {
      const dir = await mkdtemp(join(tmpdir(), "assini-eval-cli-require-"));
      const dbPath = join(dir, "local-db.json");
      await new JsonStore(dbPath).write(createBootstrapState());
      const stderr: string[] = [];

      const exitCode = await runEvaluationCli({
        dbPath,
        env: { ASSINI_EVAL_REQUIRE_LANGUAGES: requireValue },
        stderr: (message) => stderr.push(String(message)),
        stdout: () => undefined
      });

      expect(exitCode).toBe(1);
      expect(stderr).toEqual([...EMPTY_WORKSPACE_EVAL_REQUIRE_LANGUAGES_GUIDANCE]);
      expect(stderr.join("\n")).toContain("ASSINI_EVAL_REQUIRE_LANGUAGES");
      expect(stderr.join("\n")).toContain("Seed a fixture language");
    }
  );

  it("treats blank ASSINI_DB_PATH as unset and keeps the default path", () => {
    expect(resolveEvalDbPath({ ASSINI_DB_PATH: "   " })).toBe(defaultEvalDbPath);
  });

  it("fails closed with no-run guidance when languages exist but evaluation produces no runs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-eval-cli-norun-"));
    const dbPath = join(dir, "local-db.json");
    const state = buildTestWorkspaceState();
    await new JsonStore(dbPath).write(state);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runEvaluationCli({
      dbPath,
      env: {},
      evaluate: () => [],
      stderr: (message) => stderr.push(String(message)),
      stdout: (message) => stdout.push(String(message))
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([...NO_EVAL_RUNS_CLI_GUIDANCE]);
    expect(stderr.join("\n")).toContain("No evaluation runs were produced");
    expect(stderr.join("\n")).toContain("System Eval");

    const persisted = await new JsonStore(dbPath).read();
    expect(persisted.evaluationRuns).toEqual(state.evaluationRuns);
  });

  it("records runs and exits 0 for a fixture workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-eval-cli-fixture-"));
    const dbPath = join(dir, "local-db.json");
    await new JsonStore(dbPath).write(buildTestWorkspaceState());
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
    expect(stdout.length).toBeGreaterThan(0);

    const persisted = await new JsonStore(dbPath).read();
    expect(persisted.evaluationRuns.length).toBeGreaterThan(0);
  });

  it("persists failing runs and prints Evaluation gate failed lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-eval-cli-gate-"));
    const dbPath = join(dir, "local-db.json");
    const state = buildTestWorkspaceState();
    await new JsonStore(dbPath).write(state);

    const failingRun = {
      id: "eval-testlang-cli-gate",
      languageId: "testlang",
      createdAt: new Date().toISOString(),
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "workspace-corpus-v1",
      scores: {
        noteCoverage: 1,
        noteAccuracy: 1,
        evidenceAccuracy: 1,
        segmentationAccuracy: 1,
        translationAccuracy: 0.5,
        exerciseGrading: 1,
        generationPolicy: 1
      },
      failures: [
        {
          category: "translationAccuracy",
          languageId: "testlang",
          itemId: "testlang-c001",
          message: "Translation mismatch for corpus passage testlang-c001."
        }
      ],
      summary: "Testlang: 92.9% average score across 7 categories."
    };

    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runEvaluationCli({
      dbPath,
      env: {},
      evaluate: () => [failingRun],
      stderr: (message) => stderr.push(String(message)),
      stdout: (message) => stdout.push(String(message))
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([failingRun.summary]);
    expect(stderr[0]).toBe("Evaluation gate failed:");
    expect(stderr.join("\n")).toContain("translationAccuracy");
    expect(stderr.some((line) => line.startsWith("- "))).toBe(true);

    const persisted = await new JsonStore(dbPath).read();
    expect(persisted.evaluationRuns.length).toBe(state.evaluationRuns.length + 1);
    expect(persisted.evaluationRuns.at(-1)?.id).toBe(failingRun.id);
    expect(persisted.evaluationRuns.at(-1)?.failures).toEqual(failingRun.failures);
  });
});
