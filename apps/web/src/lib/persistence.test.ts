import { describe, expect, it } from "vitest";
import { getInitialView, getStoredLanguageId, persistWorkspaceSelection } from "./persistence";

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    dump: () => Object.fromEntries(store)
  };
}

describe("workspace persistence", () => {
  it("defaults to the start view when nothing is stored", () => {
    expect(getInitialView(makeStorage())).toBe("profile");
    expect(getInitialView(undefined)).toBe("profile");
  });

  it("restores a stored top-level view and maps old detailed views into the four-tab shell", () => {
    expect(getInitialView(makeStorage({ "workspace.view": "learner" }))).toBe("learner");
    expect(getInitialView(makeStorage({ "workspace.view": "governance" }))).toBe("model");
    expect(getInitialView(makeStorage({ "workspace.view": "review" }))).toBe("ingest");
    expect(getInitialView(makeStorage({ "workspace.view": "not-a-view" }))).toBe("profile");
  });

  it("ignores storage failures when reading the view", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      }
    };
    expect(getInitialView(storage)).toBe("profile");
  });

  it("returns null for missing or blank stored language ids", () => {
    expect(getStoredLanguageId(makeStorage())).toBeNull();
    expect(getStoredLanguageId(makeStorage({ "workspace.languageId": "  " }))).toBeNull();
    expect(getStoredLanguageId(makeStorage({ "workspace.languageId": "lang-1" }))).toBe("lang-1");
    expect(getStoredLanguageId(undefined)).toBeNull();
  });

  it("persists the view and language id, clearing the id when deselected", () => {
    const storage = makeStorage();
    persistWorkspaceSelection("review", "lang-9", storage);
    expect(storage.dump()).toEqual({ "workspace.view": "review", "workspace.languageId": "lang-9" });

    persistWorkspaceSelection("corpus", null, storage);
    expect(storage.dump()).toEqual({ "workspace.view": "corpus", "workspace.languageId": "" });
  });

  it("ignores storage failures when persisting", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      }
    };
    expect(() => persistWorkspaceSelection("corpus", "lang-1", storage)).not.toThrow();
  });
});
