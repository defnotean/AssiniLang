import { describe, expect, it } from "vitest";
import { parseStringArray } from "./parseArrays.js";

describe("parseStringArray", () => {
  it("treats omitted arrays as empty arrays", () => {
    expect(parseStringArray(undefined)).toEqual([]);
  });

  it("trims string items", () => {
    expect(parseStringArray([" noun ", "verb"])).toEqual(["noun", "verb"]);
  });

  it("rejects non-arrays and empty items", () => {
    expect(parseStringArray("noun")).toBeUndefined();
    expect(parseStringArray(["noun", " "])).toBeUndefined();
    expect(parseStringArray(["noun", 3])).toBeUndefined();
  });
});
