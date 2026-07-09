import { describe, expect, it, vi } from "vitest";
import { createObsidianMcpSession } from "./obsidianMcpClient.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe("Obsidian MCP Streamable HTTP client", () => {
  it("uses SDK JSON-RPC for initialize, list, read, and session termination", async () => {
    const calls: Array<{
      method: string;
      url: string;
      redirect?: RequestRedirect;
      authorization: string | null;
      rpcMethod?: string;
      params?: Record<string, unknown>;
    }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string"
        ? JSON.parse(init.body) as JsonRpcRequest
        : undefined;
      calls.push({
        method,
        url: requestUrl(input),
        redirect: init?.redirect,
        authorization: headers.get("authorization"),
        ...(body ? { rpcMethod: body.method, params: body.params } : {})
      });

      if (method === "GET") return new Response(null, { status: 405 });
      if (method === "DELETE") return new Response(null, { status: 200 });
      if (!body) throw new Error("Expected a JSON-RPC body");

      if (body.method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { resources: {} },
            serverInfo: { name: "mock-obsidian", version: "1.2.3" }
          }
        }, {
          headers: { "mcp-session-id": "mock-session" }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "resources/list") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resources: [{
              uri: "obsidian://vault/Grammar.md",
              name: "Grammar",
              title: "Grammar notes",
              mimeType: "text/markdown",
              annotations: { lastModified: "2026-07-09T00:00:00.000Z" }
            }],
            nextCursor: "page-2"
          }
        });
      }
      if (body.method === "resources/read") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            contents: [{
              uri: "obsidian://vault/Grammar.md",
              mimeType: "text/markdown",
              text: "# Grammar\n\nA compact note."
            }]
          }
        });
      }
      throw new Error(`Unexpected method: ${body.method}`);
    };

    const session = await createObsidianMcpSession({
      endpointUrl: "http://127.0.0.1:27124/mcp",
      token: "sdk-secret-token",
      timeoutMs: 2_000
    }, {
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
      fetchFn
    });

    expect(session.serverName).toBe("mock-obsidian");
    expect(session.serverVersion).toBe("1.2.3");
    await expect(session.listResources("page-1")).resolves.toEqual({
      resources: [{
        uri: "obsidian://vault/Grammar.md",
        name: "Grammar",
        title: "Grammar notes",
        mimeType: "text/markdown",
        lastModified: "2026-07-09T00:00:00.000Z"
      }],
      nextCursor: "page-2"
    });
    await expect(session.readTextResource("obsidian://vault/Grammar.md")).resolves.toEqual({
      uri: "obsidian://vault/Grammar.md",
      text: "# Grammar\n\nA compact note.",
      mimeType: "text/markdown"
    });
    await session.close();

    expect(calls.map((call) => call.rpcMethod).filter(Boolean)).toEqual([
      "initialize",
      "notifications/initialized",
      "resources/list",
      "resources/read"
    ]);
    expect(calls.find((call) => call.rpcMethod === "resources/list")?.params).toEqual({ cursor: "page-1" });
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
    expect(calls.every((call) => call.url === "http://127.0.0.1:27124/mcp")).toBe(true);
    expect(calls.every((call) => call.redirect === "manual")).toBe(true);
    expect(calls.every((call) => call.authorization === "Bearer sdk-secret-token")).toBe(true);
  });

  it("blocks private endpoints before issuing a request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(createObsidianMcpSession({
      endpointUrl: "http://127.0.0.1:27124/mcp"
    }, { env: {}, fetchFn })).rejects.toThrow(/private or local network/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("forces manual redirects and keeps the token out of redirect errors", async () => {
    const token = "redirect-secret-token";
    const fetchFn = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.redirect).toBe("manual");
      return new Response(`Bearer ${token}`, {
        status: 307,
        headers: { location: "http://127.0.0.1/internal" }
      });
    });

    let message = "";
    try {
      await createObsidianMcpSession({
        endpointUrl: "http://127.0.0.1:27124/mcp",
        token
      }, {
        env: { ASSINI_ALLOW_PRIVATE_URLS: "1" },
        fetchFn
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/redirect was blocked/i);
    expect(message).not.toContain(token);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("redacts the configured token from endpoint validation errors", async () => {
    const token = "malformed-endpoint-secret";
    let message = "";
    try {
      await createObsidianMcpSession({
        endpointUrl: `http://[${token}`,
        token
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("[redacted-secret]");
    expect(message).not.toContain(token);
  });
});
