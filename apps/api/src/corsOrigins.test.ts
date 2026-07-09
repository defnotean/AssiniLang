import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  assertCorsAllowedOrigin,
  isCorsOriginAllowed,
  readAllowedOrigins,
  resolveAllowedOrigins
} from "./corsOrigins.js";

describe("corsOrigins", () => {
  it("defaults blank env lists to local Vite origins", () => {
    expect(readAllowedOrigins(undefined)).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(readAllowedOrigins("")).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(readAllowedOrigins(" , , ")).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
  });

  it("parses and trims a comma-separated allow-list", () => {
    expect(readAllowedOrigins("https://app.example.test, https://admin.example.test ")).toEqual([
      "https://app.example.test",
      "https://admin.example.test"
    ]);
  });

  it.each([
    "*",
    "null",
    "NULL",
    "http://evil.example/path",
    "http://evil.example/",
    "ftp://evil.example",
    "not-a-url",
    "https://evil.example?x=1",
    "https://user:pass@evil.example"
  ])("rejects invalid allow-list entry %s", (origin) => {
    expect(() => assertCorsAllowedOrigin(origin)).toThrow(/ASSINI_ALLOWED_ORIGINS|allowedOrigins/);
    expect(() => readAllowedOrigins(origin)).toThrow("ASSINI_ALLOWED_ORIGINS");
  });

  it("rejects empty programmatic allow-lists and validates entries", () => {
    expect(resolveAllowedOrigins(undefined)).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
    expect(() => resolveAllowedOrigins([])).toThrow("allowedOrigins must include at least one origin");
    expect(() => resolveAllowedOrigins(["*"])).toThrow(/wildcard|null/);
    expect(resolveAllowedOrigins(["https://app.example.test"])).toEqual(["https://app.example.test"]);
  });

  it("allows missing Origin and exact allow-list matches only", () => {
    const allowed = ["http://localhost:5173"];
    expect(isCorsOriginAllowed(undefined, allowed)).toBe(true);
    expect(isCorsOriginAllowed("http://localhost:5173", allowed)).toBe(true);
    expect(isCorsOriginAllowed("https://evil.example", allowed)).toBe(false);
    expect(isCorsOriginAllowed("null", allowed)).toBe(false);
    expect(isCorsOriginAllowed("*", allowed)).toBe(false);
    // Even a poisoned allow-list must not reflect wildcard/null.
    expect(isCorsOriginAllowed("*", ["*"])).toBe(false);
    expect(isCorsOriginAllowed("null", ["null"])).toBe(false);
  });
});
