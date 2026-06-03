import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { seedDbPath } from "./seed";

describe("synthetic language seed command", () => {
  it("writes to the repository data directory", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    expect(seedDbPath).toBe(resolve(repoRoot, "data", "local-db.json"));
  });
});
