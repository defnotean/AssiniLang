import { describe, expect, it } from "vitest";
import { readRuntimeConfig } from "./runtimeConfig.js";

describe("readRuntimeConfig", () => {
  it("uses local-safe defaults", () => {
    expect(readRuntimeConfig({})).toEqual({
      host: "127.0.0.1",
      port: 4321,
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      bodyLimitBytes: 64 * 1024,
      logger: false
    });
  });

  it("parses deploy-time host, port, CORS, body limit, and logger overrides", () => {
    expect(readRuntimeConfig({
      HOST: "0.0.0.0",
      PORT: "8080",
      ASSINI_ALLOWED_ORIGINS: "https://app.example.test, https://admin.example.test ",
      ASSINI_BODY_LIMIT_BYTES: "131072",
      ASSINI_API_LOGGER: "true"
    })).toEqual({
      host: "0.0.0.0",
      port: 8080,
      allowedOrigins: ["https://app.example.test", "https://admin.example.test"],
      bodyLimitBytes: 131072,
      logger: true
    });
  });

  it("treats blank HOST and empty origin lists as defaults", () => {
    expect(readRuntimeConfig({
      HOST: "   ",
      ASSINI_ALLOWED_ORIGINS: " , , ",
      ASSINI_API_LOGGER: "yes"
    })).toMatchObject({
      host: "127.0.0.1",
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      logger: false
    });
  });

  it("enables the logger for 1 as well as true", () => {
    expect(readRuntimeConfig({ ASSINI_API_LOGGER: "1" }).logger).toBe(true);
  });

  it.each([
    ["PORT", "0"],
    ["PORT", "70000"],
    ["PORT", "not-a-port"],
    ["ASSINI_BODY_LIMIT_BYTES", "0"],
    ["ASSINI_BODY_LIMIT_BYTES", "not-a-size"],
    ["ASSINI_BODY_LIMIT_BYTES", String(25 * 1024 * 1024 + 1)]
  ])("rejects invalid numeric env %s=%s", (name, value) => {
    expect(() => readRuntimeConfig({ [name]: value })).toThrow(name);
  });

  it.each([
    "*",
    "null",
    "http://evil.example/path",
    "http://evil.example/",
    "ftp://evil.example",
    "not-a-url",
    "https://evil.example?x=1",
    "https://user:pass@evil.example"
  ])("rejects invalid CORS origin %s", (origin) => {
    expect(() => readRuntimeConfig({ ASSINI_ALLOWED_ORIGINS: origin })).toThrow("ASSINI_ALLOWED_ORIGINS");
  });

  it.each([
    "http://bad host",
    "http://127.0.0.1:4321",
    "0.0.0.0/24"
  ])("rejects invalid HOST %s", (host) => {
    expect(() => readRuntimeConfig({ HOST: host })).toThrow("HOST");
  });
});
