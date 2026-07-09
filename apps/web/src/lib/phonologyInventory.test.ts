import { describe, expect, it } from "vitest";
import {
  buildPhonologyPatch,
  draftFromLanguage,
  hasDeclaredInventory,
  inventoriesEqual,
  normalizeInventorySymbol,
  validateInventorySymbol
} from "./phonologyInventory";

describe("phonologyInventory helpers", () => {
  it("trims symbols and rejects blank, whitespace, and duplicate entries", () => {
    expect(normalizeInventorySymbol("  t  ")).toBe("t");
    expect(validateInventorySymbol("   ", [])).toEqual({ ok: false, reason: "blank" });
    expect(validateInventorySymbol("t h", [])).toEqual({ ok: false, reason: "whitespace" });
    expect(validateInventorySymbol("t", ["t"])).toEqual({ ok: false, reason: "duplicate" });
    expect(validateInventorySymbol("  th  ", ["t"])).toEqual({ ok: true, symbol: "th" });
  });

  it("builds drafts from language phonology and detects empty inventories", () => {
    expect(draftFromLanguage({ phonology: undefined })).toEqual({ consonants: [], vowels: [] });
    expect(draftFromLanguage({
      phonology: {
        consonants: ["m"],
        vowels: ["a"],
        notes: ["keep"]
      }
    })).toEqual({ consonants: ["m"], vowels: ["a"] });
    expect(hasDeclaredInventory({ consonants: [], vowels: [] })).toBe(false);
    expect(hasDeclaredInventory({ consonants: ["m"], vowels: [] })).toBe(true);
  });

  it("compares drafts and preserves non-inventory phonology fields on save payloads", () => {
    const left = { consonants: ["m"], vowels: ["a"] };
    const right = { consonants: ["m"], vowels: ["a"] };
    expect(inventoriesEqual(left, right)).toBe(true);
    expect(inventoriesEqual(left, { consonants: ["m"], vowels: ["i"] })).toBe(false);

    expect(buildPhonologyPatch({
      phonology: {
        consonants: ["k"],
        vowels: ["a"],
        syllableTemplate: "CV",
        stress: "word-initial",
        notes: ["No clusters."]
      }
    }, { consonants: ["m", "n"], vowels: ["a", "i"] })).toEqual({
      consonants: ["m", "n"],
      vowels: ["a", "i"],
      syllableTemplate: "CV",
      stress: "word-initial",
      notes: ["No clusters."]
    });

    expect(buildPhonologyPatch({ phonology: undefined }, { consonants: ["p"], vowels: [] })).toEqual({
      consonants: ["p"],
      vowels: [],
      notes: []
    });
  });
});
