import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchObsidianMcpResources,
  fetchObsidianMcpSettings,
  importObsidianMcpResources,
  updateObsidianMcpSettings
} from "./mcpApi";
import { resetPrototypeSessionCache } from "../lib/apiClient";

function okJson(value: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => value
  };
}

describe("Obsidian MCP API client", () => {
  afterEach(() => {
    resetPrototypeSessionCache();
    vi.unstubAllGlobals();
  });

  it("loads settings through a programmer prototype session", async () => {
    const settings = { endpointUrl: "", tokenConfigured: false, timeoutMs: 15_000 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ userId: "programmer-1" }))
      .mockResolvedValueOnce(okJson(settings));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchObsidianMcpSettings()).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/integrations/obsidian-mcp/settings", {
      credentials: "include",
      headers: {}
    });
  });

  it("sends MCP token changes only in the settings mutation body", async () => {
    const saved = {
      endpointUrl: "http://127.0.0.1:3001/mcp",
      tokenConfigured: true,
      timeoutMs: 20_000
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ userId: "programmer-1" }))
      .mockResolvedValueOnce(okJson(saved));
    vi.stubGlobal("fetch", fetchMock);

    await updateObsidianMcpSettings({
      endpointUrl: saved.endpointUrl,
      token: "write-only-secret",
      timeoutMs: saved.timeoutMs
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/integrations/obsidian-mcp/settings", {
      method: "PUT",
      body: JSON.stringify({
        endpointUrl: saved.endpointUrl,
        token: "write-only-secret",
        timeoutMs: saved.timeoutMs
      }),
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
  });

  it("uses reviewer authorization for resource browsing and selected imports", async () => {
    const resources = {
      resources: [{ uri: "obsidian://vault/note.md", name: "note.md" }]
    };
    const imported = {
      imported: [],
      skipped: [],
      summary: { requested: 1, imported: 1, skipped: 0 }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ userId: "reviewer-1" }))
      .mockResolvedValueOnce(okJson(resources))
      .mockResolvedValueOnce(okJson(imported));
    vi.stubGlobal("fetch", fetchMock);

    await fetchObsidianMcpResources();
    await importObsidianMcpResources("lang/one", { uris: ["obsidian://vault/note.md"] });

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/integrations/obsidian-mcp/resources", {
      cache: "no-store",
      credentials: "include",
      headers: {}
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/languages/lang%2Fone/sources/obsidian-mcp", {
      method: "POST",
      body: JSON.stringify({ uris: ["obsidian://vault/note.md"] }),
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
  });
});
