import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonStore, createEmptyState } from "./store.js";
import { buildTestWorkspaceState } from "./testing.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "assini-store-snapshot-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const backends = [
  { label: "json", file: "db.json" },
  { label: "sqlite", file: "db.sqlite" }
] as const;

describe.each(backends)("JsonStore snapshot cache ($label)", ({ file }) => {
  it("returns equal state across repeated reads of an unchanged database", async () => {
    const store = new JsonStore(join(dir, file));
    await store.write(buildTestWorkspaceState());

    const first = await store.read();
    const second = await store.read();
    expect(second).toEqual(first);
  });

  it("does not let callers mutate the cached state of later reads", async () => {
    const store = new JsonStore(join(dir, file));
    await store.write(buildTestWorkspaceState());

    const first = await store.read();
    const originalName = first.users[0]!.name;
    first.users[0]!.name = "Mutated In Place";
    first.languages.push({
      id: "lang-mutated",
      name: "Mutated",
      description: "Should never appear",
      orthography: "latin",
      typology: "unknown",
      status: "draft"
    });

    const second = await store.read();
    expect(second.users[0]!.name).toBe(originalName);
    expect(second.languages.some((language) => language.id === "lang-mutated")).toBe(false);
  });

  it("picks up writes made through a different store instance on the same file", async () => {
    const path = join(dir, file);
    const writer = new JsonStore(path);
    const reader = new JsonStore(path);

    await writer.write(buildTestWorkspaceState());
    const before = await reader.read();
    expect(before.notes.length).toBeGreaterThan(0);

    const emptied = { ...createEmptyState(), users: before.users };
    await writer.write(emptied);

    const after = await reader.read();
    expect(after.notes).toEqual([]);
    expect(after.languages).toEqual([]);
  });
});
