import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSeedDbPath, resolveSeedDbPath } from "./seedCli.js";

describe("seed CLI database path", () => {
  it("uses the default workspace database path", () => {
    expect(resolveSeedDbPath({})).toBe(defaultSeedDbPath);
  });

  it("honors ASSINI_DB_PATH for isolated verification runs", () => {
    const dbPath = join("tmp", "assini-verify", "local-db.json");

    expect(resolveSeedDbPath({ ASSINI_DB_PATH: ` ${dbPath} ` })).toBe(resolve(dbPath));
  });
});
