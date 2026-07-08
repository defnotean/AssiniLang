import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSeedDbPath } from "./seedCli.js";
import { resolveBackupDbPath } from "./backupCli.js";

describe("backup CLI database path", () => {
  it("defaults to the same workspace path as seed", () => {
    expect(resolveBackupDbPath({})).toBe(defaultSeedDbPath);
  });

  it("honors ASSINI_DB_PATH including SQLite destinations", () => {
    const jsonPath = join("tmp", "assini-verify", "local-db.json");
    const sqlitePath = join("tmp", "assini-verify", "local-db.sqlite");

    expect(resolveBackupDbPath({ ASSINI_DB_PATH: ` ${jsonPath} ` })).toBe(resolve(jsonPath));
    expect(resolveBackupDbPath({ ASSINI_DB_PATH: ` ${sqlitePath} ` })).toBe(resolve(sqlitePath));
  });
});
