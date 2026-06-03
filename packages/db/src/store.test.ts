import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore } from "./store";

describe("JsonStore", () => {
  it("writes and reads a seeded state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages.push({
        id: "test-lang",
        name: "Test Lang",
        typology: "isolating",
        description: "Synthetic test language.",
        orthography: "Latin test alphabet",
        status: "synthetic",
        fixtureSource: "unit-test"
      });

      await store.write(state);
      const loaded = await store.read();
      const raw = JSON.parse(await readFile(dbPath, "utf8"));

      expect(loaded.languages[0]?.id).toBe("test-lang");
      expect(raw.schemaVersion).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not write a db file when updating a missing note", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);

      await expect(store.updateNote("missing-note", { status: "approved" })).rejects.toThrow(
        "Note not found: missing-note"
      );
      await expect(readFile(dbPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
