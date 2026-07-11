import { describe, expect, it } from "vitest";
import {
  obsidianMcpImportPayloadSchema,
  obsidianMcpResourceListQuerySchema,
  obsidianMcpSettingsPatchSchema
} from "./mcpContract.js";

describe("Obsidian MCP API contract", () => {
  it("keeps token updates write-only and unambiguous", () => {
    expect(obsidianMcpSettingsPatchSchema.parse({ token: "  secret-token  " })).toEqual({
      token: "secret-token"
    });
    expect(obsidianMcpSettingsPatchSchema.safeParse({ token: "secret", clearToken: true }).success).toBe(false);
    expect(obsidianMcpSettingsPatchSchema.safeParse({ token: "" }).success).toBe(false);
    expect(obsidianMcpSettingsPatchSchema.safeParse({ timeoutMs: 120_001 }).success).toBe(false);
  });

  it("deduplicates trimmed resource URIs and caps the request at 50 entries", () => {
    expect(
      obsidianMcpImportPayloadSchema.parse({
        uris: [" obsidian://vault/one.md ", "obsidian://vault/one.md", "obsidian://vault/two.md"]
      })
    ).toEqual({
      uris: ["obsidian://vault/one.md", "obsidian://vault/two.md"]
    });
    expect(
      obsidianMcpImportPayloadSchema.safeParse({
        uris: Array.from({ length: 51 }, (_, index) => `obsidian://vault/${index}.md`)
      }).success
    ).toBe(false);
  });

  it("validates the optional pagination cursor", () => {
    expect(obsidianMcpResourceListQuerySchema.parse({ cursor: " next-page " })).toEqual({
      cursor: "next-page"
    });
    expect(obsidianMcpResourceListQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
    expect(obsidianMcpResourceListQuerySchema.safeParse({ cursor: ["one", "two"] }).success).toBe(false);
  });
});
