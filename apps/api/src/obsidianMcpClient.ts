import { Buffer } from "node:buffer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ObsidianMcpResource } from "@assini/api-contract";
import { assertOutboundHttpUrlAllowed } from "./urlSafety.js";

export const DEFAULT_OBSIDIAN_MCP_TIMEOUT_MS = 15_000;
export const MAX_OBSIDIAN_MCP_RESOURCE_BYTES = 1_000_000;

type Env = Record<string, string | undefined>;

export type ObsidianMcpConnectionConfig = {
  endpointUrl: string;
  token?: string;
  timeoutMs?: number;
};

export type ObsidianMcpTextResource = {
  uri: string;
  text: string;
  mimeType?: string;
};

export type ObsidianMcpResourceReadFailure = "empty" | "non_text" | "too_large";

export class ObsidianMcpResourceReadError extends Error {
  constructor(
    readonly reason: ObsidianMcpResourceReadFailure,
    message: string
  ) {
    super(message);
    this.name = "ObsidianMcpResourceReadError";
  }
}

export interface ObsidianMcpSession {
  serverName?: string;
  serverVersion?: string;
  listResources(cursor?: string): Promise<{ resources: ObsidianMcpResource[]; nextCursor?: string }>;
  readTextResource(uri: string): Promise<ObsidianMcpTextResource>;
  close(): Promise<void>;
}

export type ObsidianMcpSessionFactory = (
  config: ObsidianMcpConnectionConfig
) => Promise<ObsidianMcpSession>;

type CreateObsidianMcpSessionOptions = {
  env?: Env;
  fetchFn?: typeof fetch;
};

function inputUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function guardedFetch(
  fetchFn: typeof fetch,
  env: Env
): typeof fetch {
  return async (input, init) => {
    const url = inputUrl(input);
    await assertOutboundHttpUrlAllowed(url, { env });
    const response = await fetchFn(input, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`MCP endpoint redirect was blocked (${response.status}).`);
    }
    return response;
  };
}

export function redactObsidianMcpSecret(message: string, token?: string): string {
  const configuredToken = token?.trim();
  if (!configuredToken) return message;
  return message.split(configuredToken).join("[redacted-secret]");
}

function sanitizedMcpError(error: unknown, token?: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactObsidianMcpSecret(message, token));
}

export function isObsidianMcpTextMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return true;
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return normalized.startsWith("text/")
    || normalized === "application/json"
    || normalized.endsWith("+json")
    || normalized === "application/xml"
    || normalized.endsWith("+xml")
    || normalized === "application/yaml"
    || normalized === "application/x-yaml"
    || normalized === "application/toml";
}

function normalizeResource(resource: {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: { lastModified?: string };
}): ObsidianMcpResource {
  return {
    uri: resource.uri,
    name: resource.name,
    ...(resource.title ? { title: resource.title } : {}),
    ...(resource.description ? { description: resource.description } : {}),
    ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
    ...(resource.annotations?.lastModified ? { lastModified: resource.annotations.lastModified } : {})
  };
}

export async function createObsidianMcpSession(
  config: ObsidianMcpConnectionConfig,
  options: CreateObsidianMcpSessionOptions = {}
): Promise<ObsidianMcpSession> {
  const env = options.env ?? process.env;
  const endpointUrl = config.endpointUrl.trim();
  const token = config.token?.trim();
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = await assertOutboundHttpUrlAllowed(endpointUrl, { env });
    if (parsedEndpoint.username || parsedEndpoint.password) {
      throw new Error("MCP endpoint URL must not include credentials.");
    }
  } catch (error) {
    throw sanitizedMcpError(error, token);
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_OBSIDIAN_MCP_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new Error("MCP timeout must be an integer between 1 and 120000 milliseconds.");
  }
  const requestInit: RequestInit = token
    ? { headers: { Authorization: `Bearer ${token}` } }
    : {};
  const transport = new StreamableHTTPClientTransport(parsedEndpoint, {
    requestInit,
    fetch: guardedFetch(options.fetchFn ?? globalThis.fetch, env)
  });
  const client = new Client({ name: "assini-lang", version: "0.3.0" });

  try {
    await client.connect(transport, { timeout: timeoutMs, maxTotalTimeout: timeoutMs });
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw sanitizedMcpError(error, token);
  }

  const server = client.getServerVersion();
  return {
    serverName: server?.name,
    serverVersion: server?.version,
    async listResources(cursor) {
      try {
        const result = await client.listResources(
          cursor ? { cursor } : undefined,
          { timeout: timeoutMs, maxTotalTimeout: timeoutMs }
        );
        return {
          resources: result.resources.map(normalizeResource),
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {})
        };
      } catch (error) {
        throw sanitizedMcpError(error, token);
      }
    },
    async readTextResource(uri) {
      try {
        const result = await client.readResource(
          { uri },
          { timeout: timeoutMs, maxTotalTimeout: timeoutMs }
        );
        const textContents = result.contents.filter(
          (content): content is Extract<typeof content, { text: string }> => "text" in content
        );
        if (textContents.length === 0) {
          throw new ObsidianMcpResourceReadError(
            "non_text",
            "MCP resource did not contain a supported text representation."
          );
        }
        const supportedContents = textContents.filter((content) => isObsidianMcpTextMimeType(content.mimeType));
        if (supportedContents.length === 0) {
          throw new ObsidianMcpResourceReadError(
            "non_text",
            "MCP resource did not contain a supported text representation."
          );
        }
        const text = supportedContents
          .map((content) => content.text.trim())
          .filter(Boolean)
          .join("\n\n");
        if (!text) {
          throw new ObsidianMcpResourceReadError("empty", "MCP resource had no importable text.");
        }
        if (Buffer.byteLength(text, "utf8") > MAX_OBSIDIAN_MCP_RESOURCE_BYTES) {
          throw new ObsidianMcpResourceReadError(
            "too_large",
            "MCP resource is larger than the 1 MB import limit."
          );
        }
        const mimeType = supportedContents.find((content) => content.mimeType)?.mimeType;
        return {
          uri,
          text,
          ...(mimeType ? { mimeType } : {})
        };
      } catch (error) {
        if (error instanceof ObsidianMcpResourceReadError) throw error;
        throw sanitizedMcpError(error, token);
      }
    },
    async close() {
      let terminationError: unknown;
      try {
        await transport.terminateSession();
      } catch (error) {
        terminationError = error;
      } finally {
        await client.close();
      }
      if (terminationError) throw sanitizedMcpError(terminationError, token);
    }
  };
}
