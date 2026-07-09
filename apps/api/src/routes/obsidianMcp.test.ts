import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type SourceAsset } from "@assini/db";
import {
  ObsidianMcpResourceReadError,
  type ObsidianMcpSession,
  type ObsidianMcpSessionFactory
} from "../obsidianMcpClient.js";
import { createServer } from "../server.js";

const MCP_ENV_KEYS = [
  "ASSINI_OBSIDIAN_MCP_ENDPOINT_URL",
  "ASSINI_OBSIDIAN_MCP_TOKEN",
  "ASSINI_OBSIDIAN_MCP_TIMEOUT_MS",
  "ASSINI_ALLOW_PRIVATE_URLS"
] as const;
const ORIGINAL_ENV = Object.fromEntries(MCP_ENV_KEYS.map((key) => [key, process.env[key]]));
const ROUTE_TOKEN = "route-secret-token";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function restoreEnv(): void {
  for (const key of MCP_ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function basicSession(overrides: Partial<ObsidianMcpSession> = {}): ObsidianMcpSession {
  return {
    serverName: "Obsidian MCP",
    serverVersion: "1.0.0",
    async listResources() {
      return { resources: [] };
    },
    async readTextResource(uri) {
      return { uri, text: "A note.", mimeType: "text/markdown" };
    },
    async close() {},
    ...overrides
  };
}

describe.sequential("Obsidian MCP routes", () => {
  const apps: Array<ReturnType<typeof createServer>> = [];

  function makeServer(sessionFactory: ObsidianMcpSessionFactory, options: {
    initialState?: ReturnType<typeof buildTestWorkspaceState>;
    settingsPath?: string;
    rateLimit?: { max: number; windowMs: number } | false;
  } = {}) {
    const app = createServer({
      initialState: options.initialState ?? buildTestWorkspaceState(),
      obsidianMcpSessionFactory: sessionFactory,
      ...(options.settingsPath ? { settingsPath: options.settingsPath } : {}),
      ...(options.rateLimit !== undefined ? { rateLimit: options.rateLimit } : {})
    });
    apps.push(app);
    return app;
  }

  beforeEach(() => {
    process.env.ASSINI_OBSIDIAN_MCP_ENDPOINT_URL = "http://127.0.0.1:27124/mcp";
    process.env.ASSINI_OBSIDIAN_MCP_TOKEN = ROUTE_TOKEN;
    process.env.ASSINI_OBSIDIAN_MCP_TIMEOUT_MS = "9000";
    process.env.ASSINI_ALLOW_PRIVATE_URLS = "1";
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    restoreEnv();
  });

  it("enforces settings authorization and write-only validation", async () => {
    const factory = vi.fn<ObsidianMcpSessionFactory>(async () => basicSession());
    const app = makeServer(factory);

    const unauthorized = await app.inject({
      method: "GET",
      url: "/integrations/obsidian-mcp/settings"
    });
    expect(unauthorized.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: "GET",
      url: "/integrations/obsidian-mcp/settings",
      headers: authHeaders("reviewer-1")
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/integrations/obsidian-mcp/settings",
      headers: authHeaders("programmer-1")
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({
      endpointUrl: "http://127.0.0.1:27124/mcp",
      tokenConfigured: true,
      timeoutMs: 9000
    });
    expect(allowed.body).not.toContain(ROUTE_TOKEN);

    const invalid = await app.inject({
      method: "PUT",
      url: "/integrations/obsidian-mcp/settings",
      headers: authHeaders("lead-1"),
      payload: { token: "replacement-secret", clearToken: true }
    });
    expect(invalid.statusCode).toBe(400);

    const importForbidden = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-mcp`,
      headers: authHeaders("programmer-1"),
      payload: { uris: ["obsidian://vault/one.md"] }
    });
    expect(importForbidden.statusCode).toBe(403);
    expect(factory).not.toHaveBeenCalled();
  });

  it("persists endpoint, timeout, and token without coupling them to model profiles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-mcp-route-"));
    const settingsPath = join(dir, ".env");
    await writeFile(settingsPath, "ASSINI_LLM_MODEL_PROFILES=keep-existing-profile-data\n", "utf8");
    const app = makeServer(async () => basicSession(), { settingsPath });

    const response = await app.inject({
      method: "PUT",
      url: "/integrations/obsidian-mcp/settings",
      headers: authHeaders("admin-1"),
      payload: {
        endpointUrl: "http://127.0.0.1:3000/mcp",
        token: "new-write-only-token",
        timeoutMs: 31_000
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      endpointUrl: "http://127.0.0.1:3000/mcp",
      tokenConfigured: true,
      timeoutMs: 31_000
    });
    expect(response.body).not.toContain("new-write-only-token");
    const persisted = await readFile(settingsPath, "utf8");
    expect(persisted).toContain("ASSINI_OBSIDIAN_MCP_TOKEN=new-write-only-token");
    expect(persisted).toContain("ASSINI_LLM_MODEL_PROFILES=keep-existing-profile-data");
  });

  it("lists paginated resources for every allowed role and always closes the session", async () => {
    const cursors: Array<string | undefined> = [];
    let closeCount = 0;
    const factory = vi.fn<ObsidianMcpSessionFactory>(async (config) => {
      expect(config).toEqual({
        endpointUrl: "http://127.0.0.1:27124/mcp",
        token: ROUTE_TOKEN,
        timeoutMs: 9000
      });
      return basicSession({
        serverName: `Obsidian ${ROUTE_TOKEN}`,
        async listResources(cursor) {
          cursors.push(cursor);
          return {
            resources: [{
              uri: "obsidian://vault/Grammar.md",
              name: "Grammar",
              description: `private ${ROUTE_TOKEN}`,
              mimeType: "text/markdown"
            }],
            nextCursor: "page-2"
          };
        },
        async close() {
          closeCount += 1;
        }
      });
    });
    const app = makeServer(factory);

    for (const userId of ["reviewer-1", "lead-1", "admin-1", "programmer-1"]) {
      const response = await app.inject({
        method: "GET",
        url: "/integrations/obsidian-mcp/resources?cursor=page-1",
        headers: authHeaders(userId)
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(ROUTE_TOKEN);
      expect(response.json()).toMatchObject({
        resources: [{ uri: "obsidian://vault/Grammar.md", name: "Grammar" }],
        nextCursor: "page-2"
      });
    }
    expect(cursors).toEqual(["page-1", "page-1", "page-1", "page-1"]);
    expect(closeCount).toBe(4);

    const invalidCursor = await app.inject({
      method: "GET",
      url: "/integrations/obsidian-mcp/resources?cursor=",
      headers: authHeaders("reviewer-1")
    });
    expect(invalidCursor.statusCode).toBe(400);

    const forbidden = await app.inject({
      method: "GET",
      url: "/integrations/obsidian-mcp/resources",
      headers: authHeaders("learner-1")
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("reports connection success and redacts failure details while closing sessions", async () => {
    let successClosed = false;
    const successApp = makeServer(async () => basicSession({
      async listResources() {
        return {
          resources: [{ uri: "obsidian://vault/one", name: "One" }]
        };
      },
      async close() {
        successClosed = true;
      }
    }));
    const success = await successApp.inject({
      method: "POST",
      url: "/integrations/obsidian-mcp/test",
      headers: authHeaders("programmer-1")
    });
    expect(success.statusCode).toBe(200);
    expect(success.json()).toMatchObject({
      configured: true,
      connected: true,
      serverName: "Obsidian MCP",
      resourceCount: 1
    });
    expect(successClosed).toBe(true);

    let failureClosed = false;
    const failureApp = makeServer(async () => basicSession({
      async listResources() {
        throw new Error(`Authentication failed for ${ROUTE_TOKEN}`);
      },
      async close() {
        failureClosed = true;
      }
    }));
    const failure = await failureApp.inject({
      method: "POST",
      url: "/integrations/obsidian-mcp/test",
      headers: authHeaders("lead-1")
    });
    expect(failure.statusCode).toBe(200);
    expect(failure.json()).toMatchObject({ configured: true, connected: false });
    expect(failure.body).not.toContain(ROUTE_TOKEN);
    expect(failure.json().detail).toContain("[redacted-secret]");
    expect(failureClosed).toBe(true);
  });

  it("imports only unique text resources and writes a credential-free audit event", async () => {
    const existingUri = "obsidian://vault/existing.md";
    const goodUri = "obsidian://vault/Grammar.md";
    const oversizedUri = "obsidian://vault/oversized.md";
    const nonTextUri = "obsidian://vault/image.png";
    const emptyUri = "obsidian://vault/empty.md";
    const blobOnlyUri = "obsidian://vault/blob.bin";
    const secretContentUri = "obsidian://vault/secret-content.md";
    const credentialUri = `obsidian://vault/${ROUTE_TOKEN}.md`;
    const initialState = buildTestWorkspaceState();
    const existing: SourceAsset = {
      id: "source-existing-mcp",
      languageId: TEST_LANGUAGE_ID,
      kind: "text",
      title: "Existing",
      url: existingUri,
      rawText: "Already imported.",
      status: "pending",
      createdBy: "reviewer-1",
      createdAt: "2026-07-09T00:00:00.000Z"
    };
    initialState.sourceAssets.push(existing);
    const reads: string[] = [];
    let closeCount = 0;
    const app = makeServer(async () => basicSession({
      async readTextResource(uri) {
        reads.push(uri);
        if (uri === goodUri) return { uri, text: "  # Grammar\n\nText note.  ", mimeType: "text/markdown" };
        if (uri === oversizedUri) return { uri, text: "x".repeat(1_000_001), mimeType: "text/plain" };
        if (uri === nonTextUri) return { uri, text: "not really text", mimeType: "image/png" };
        if (uri === emptyUri) return { uri, text: "   ", mimeType: "text/plain" };
        if (uri === secretContentUri) return { uri, text: `Leaked ${ROUTE_TOKEN}`, mimeType: "text/plain" };
        throw new ObsidianMcpResourceReadError(
          "non_text",
          "MCP resource did not contain a supported text representation."
        );
      },
      async close() {
        closeCount += 1;
      }
    }), { initialState });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-mcp`,
      headers: authHeaders("reviewer-1"),
      payload: {
        uris: [
          existingUri,
          goodUri,
          oversizedUri,
          nonTextUri,
          emptyUri,
          blobOnlyUri,
          secretContentUri,
          credentialUri
        ]
      }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().summary).toEqual({ requested: 8, imported: 1, skipped: 7 });
    expect(response.json().imported[0]).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      kind: "text",
      title: "Grammar.md",
      url: goodUri,
      rawText: "# Grammar\n\nText note.",
      status: "pending",
      createdBy: "reviewer-1"
    });
    expect(response.body).not.toContain(ROUTE_TOKEN);
    expect(reads).toEqual([goodUri, oversizedUri, nonTextUri, emptyUri, blobOnlyUri, secretContentUri]);
    expect(closeCount).toBe(1);

    const sources = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/sources`,
      headers: authHeaders("reviewer-1")
    });
    const matching = sources.json().filter((source: SourceAsset) => source.url === goodUri);
    expect(matching).toHaveLength(1);
    expect(sources.body).not.toContain(ROUTE_TOKEN);

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("programmer-1")
    });
    const event = audit.json().find((item: { action: string }) => (
      item.action === "source_asset.obsidian_mcp_imported"
    ));
    expect(event).toMatchObject({
      actorId: "reviewer-1",
      entityType: "source_asset",
      metadata: { integration: "obsidian_mcp", requested: 8, imported: 1, skipped: 7 }
    });
    expect(JSON.stringify(event)).not.toContain(ROUTE_TOKEN);
    expect(JSON.stringify(event)).not.toContain(goodUri);

    const duplicate = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-mcp`,
      headers: authHeaders("lead-1"),
      payload: { uris: [goodUri] }
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().summary).toEqual({ requested: 1, imported: 0, skipped: 1 });
    expect(reads.filter((uri) => uri === goodUri)).toHaveLength(1);
    expect(closeCount).toBe(2);
  });

  it("rate-limits every MCP mutation endpoint", async () => {
    const factory = vi.fn<ObsidianMcpSessionFactory>(async () => basicSession());
    const dir = await mkdtemp(join(tmpdir(), "assini-mcp-route-"));
    const app = makeServer(factory, {
      settingsPath: join(dir, ".env"),
      rateLimit: { max: 0, windowMs: 60_000 }
    });

    const requests = [
      app.inject({
        method: "PUT",
        url: "/integrations/obsidian-mcp/settings",
        headers: authHeaders("programmer-1"),
        payload: { timeoutMs: 1000 }
      }),
      app.inject({
        method: "POST",
        url: "/integrations/obsidian-mcp/test",
        headers: authHeaders("lead-1")
      }),
      app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-mcp`,
        headers: authHeaders("reviewer-1"),
        payload: { uris: ["obsidian://vault/one.md"] }
      })
    ];
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode)).toEqual([429, 429, 429]);
    expect(factory).not.toHaveBeenCalled();
  });
});
