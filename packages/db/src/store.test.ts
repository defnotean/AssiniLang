import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      expect(raw.schemaVersion).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates legacy v1 state without note answer keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const legacyState = createEmptyState();
      legacyState.notes.push({
        id: "legacy-note",
        languageId: "legacy-language",
        topic: "legacy/topic",
        explanation: "Legacy answer key text.",
        examples: [],
        evidencePassageIds: ["legacy-corpus"],
        evidenceCount: 1,
        confidence: "medium",
        status: "draft",
        reviewer: {
          lastReviewedBy: null,
          lastReviewedAt: null,
          comments: []
        },
        dialectScope: "synthetic legacy",
        editHistory: []
      });

      const { noteAnswerKeys: _removed, ...legacyWithoutAnswerKeys } = legacyState;
      await writeFile(dbPath, `${JSON.stringify({ ...legacyWithoutAnswerKeys, schemaVersion: 1 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(2);
      expect(loaded.notes).toHaveLength(1);
      expect(loaded.noteAnswerKeys).toHaveLength(1);
      expect(loaded.noteAnswerKeys[0]).toMatchObject({
        id: "legacy-note",
        topic: "legacy/topic",
        explanation: "Legacy answer key text.",
        status: "approved"
      });
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
