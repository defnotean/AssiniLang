import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "./store.js";
import { defaultSeedDbPath, resolveSeedDbPath, runSeedCli } from "./seedCli.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("seed CLI database path", () => {
  it("uses the default workspace database path", () => {
    expect(resolveSeedDbPath({})).toBe(defaultSeedDbPath);
  });

  it("honors ASSINI_DB_PATH for isolated verification runs", () => {
    const dbPath = join("tmp", "assini-verify", "local-db.json");

    expect(resolveSeedDbPath({ ASSINI_DB_PATH: ` ${dbPath} ` })).toBe(resolve(dbPath));
  });
});

describe("seed CLI fixture mode", () => {
  it("writes an empty bootstrap workspace by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-seed-empty-"));
    dirs.push(dir);
    const dbPath = join(dir, "local-db.json");
    const stdout: string[] = [];

    await runSeedCli({
      dbPath,
      env: {},
      stdout: (message) => stdout.push(String(message))
    });

    const state = await new JsonStore(dbPath).read();
    expect(state.languages).toEqual([]);
    expect(state.users.length).toBeGreaterThan(0);
    expect(stdout.join("\n")).toContain("Initialized empty workspace");
  });

  it("writes the Testlang fixture when ASSINI_SEED_FIXTURE is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-seed-fixture-"));
    dirs.push(dir);
    const dbPath = join(dir, "local-db.json");
    const stdout: string[] = [];

    await runSeedCli({
      dbPath,
      env: { ASSINI_SEED_FIXTURE: "1" },
      stdout: (message) => stdout.push(String(message))
    });

    const state = await new JsonStore(dbPath).read();
    expect(state.languages.some((language) => language.id === "testlang")).toBe(true);
    expect(state.notes.length).toBeGreaterThan(0);
    expect(stdout.join("\n")).toContain("Initialized fixture workspace");
  });
});
