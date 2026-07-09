import { describe, expect, it } from "vitest";
import { relativeAge } from "./format";

describe("relativeAge", () => {
  const now = Date.parse("2026-06-10T12:00:00.000Z");

  it("returns justNow for timestamps under one minute old", () => {
    expect(relativeAge("2026-06-10T11:59:30.000Z", now)).toEqual({ kind: "justNow" });
  });

  it("returns minutes for timestamps under one hour old", () => {
    expect(relativeAge("2026-06-10T11:42:00.000Z", now)).toEqual({ kind: "minutes", count: 18 });
  });

  it("returns hours for timestamps under one day old", () => {
    expect(relativeAge("2026-06-10T06:00:00.000Z", now)).toEqual({ kind: "hours", count: 6 });
  });

  it("returns days for older timestamps", () => {
    expect(relativeAge("2026-06-08T12:00:00.000Z", now)).toEqual({ kind: "days", count: 2 });
  });
});
