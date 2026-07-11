import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { redactErrorSecrets } from "./secretRedaction.js";

type Env = Record<string, string | undefined>;
type LookupAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<LookupAddress>;

export const DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_OUTBOUND_HTTP_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const NON_PUBLIC_IPV4_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  NON_PUBLIC_IPV4_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
const NON_PUBLIC_IPV6_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8]
] as const) {
  NON_PUBLIC_IPV6_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

export type UrlSafetyOptions = {
  env?: Env;
  lookupFn?: LookupFn;
};

export type OutboundHttpOptions = UrlSafetyOptions & {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  operation?: string;
  secrets?: Array<string | undefined>;
  responseSizeErrorMessage?: string;
};

export type ResolvedOutboundHttpUrl = {
  url: URL;
  /** Pins the approved DNS result into the network connection. */
  lookup?: LookupFunction;
};

export function privateUrlsAllowed(env: Env): boolean {
  const value = env.ASSINI_ALLOW_PRIVATE_URLS?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIpv4(address: string): boolean {
  return isIP(address) === 4 && NON_PUBLIC_IPV4_ADDRESSES.check(address, "ipv4");
}

function isPrivateIpv6(address: string): boolean {
  const normalized =
    address
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .split("%")[0] ?? "";
  return isIP(normalized) === 6 && NON_PUBLIC_IPV6_ADDRESSES.check(normalized, "ipv6");
}

function isPrivateAddress(address: string): boolean {
  return isIpv4Literal(address) ? isPrivateIpv4(address) : isPrivateIpv6(address);
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (isIpv4Literal(host)) return isPrivateIpv4(host);
  if (host.includes(":") || host.startsWith("[")) return isPrivateIpv6(host);
  return false;
}

function privateUrlBlockedMessage(hostname: string): string {
  return `URL points at a private or local network (${hostname}) and was blocked. Only public URLs can be fetched; enable Allow private URLs in Settings or set ASSINI_ALLOW_PRIVATE_URLS=1 in a trusted local setup.`;
}

function assertHttpProtocol(parsed: URL): void {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URLs must use http or https.");
  }
}

function assertHostnameAllowed(parsed: URL, env: Env): void {
  if (privateUrlsAllowed(env)) return;

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(privateUrlBlockedMessage(parsed.hostname));
  }
}

function createPinnedLookup(resolved: LookupAddress): LookupFunction {
  const family = resolved.family === 6 ? 6 : 4;
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: resolved.address, family }]);
      return;
    }
    callback(null, resolved.address, family);
  };
}

function assertNoUrlCredentials(parsed: URL): void {
  if (parsed.username || parsed.password) {
    throw new Error("Outbound endpoint URLs must not include credentials.");
  }
}

async function resolveAllowedAddress(
  hostname: string,
  env: Env,
  lookupFn: LookupFn
): Promise<LookupAddress | undefined> {
  if (privateUrlsAllowed(env)) return undefined;

  const isIpLiteral = isIpv4Literal(hostname) || hostname.includes(":") || hostname.startsWith("[");
  if (isIpLiteral) return undefined;

  let resolved: LookupAddress;
  try {
    resolved = await lookupFn(hostname);
  } catch {
    throw new Error(
      `URL hostname ${hostname} could not be resolved and was blocked. Only resolvable public URLs can be fetched; enable Allow private URLs in Settings or set ASSINI_ALLOW_PRIVATE_URLS=1 in a trusted local setup.`
    );
  }

  if (isIP(resolved.address) === 0 || (resolved.family !== 4 && resolved.family !== 6)) {
    throw new Error(`URL hostname ${hostname} returned an invalid DNS address and was blocked.`);
  }

  if (isPrivateAddress(resolved.address)) {
    throw new Error(
      `URL hostname ${hostname} resolves to a private or local network address and was blocked. Only public URLs can be fetched; enable Allow private URLs in Settings or set ASSINI_ALLOW_PRIVATE_URLS=1 in a trusted local setup.`
    );
  }
  return resolved;
}

/**
 * Resolves and validates an outbound http(s) URL. For hostnames, the returned
 * lookup callback pins the validated DNS result so a later connection cannot
 * re-resolve the name to a private address.
 */
export async function resolveOutboundHttpUrl(
  url: string,
  options: UrlSafetyOptions = {}
): Promise<ResolvedOutboundHttpUrl> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL is not valid: ${redactErrorSecrets(url)}`);
  }

  assertHttpProtocol(parsed);
  assertNoUrlCredentials(parsed);
  const env = options.env ?? process.env;
  assertHostnameAllowed(parsed, env);
  const resolved = await resolveAllowedAddress(
    parsed.hostname,
    env,
    options.lookupFn ?? ((hostname: string) => dnsLookup(hostname))
  );
  return {
    url: parsed,
    lookup: resolved ? createPinnedLookup(resolved) : undefined
  };
}

function inputUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function sanitizeOutboundError(error: unknown, secrets: Array<string | undefined>): Error {
  let message = error instanceof Error && error.message.trim() ? error.message : String(error);
  message = redactErrorSecrets(message);
  for (const secret of secrets) {
    const value = secret?.trim();
    if (value) message = message.split(value).join("[redacted-secret]");
  }
  return new Error(message, error instanceof Error ? { cause: error } : undefined);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}

/**
 * The single production boundary for server-side HTTP egress. It validates and
 * pins DNS before connecting, blocks redirects so credentials cannot cross an
 * origin boundary, enforces a whole-response byte cap and deadline, and
 * redacts configured secrets from transport errors.
 */
export async function fetchOutboundHttp(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  options: OutboundHttpOptions = {}
): Promise<Response> {
  const env = options.env ?? process.env;
  const operation = options.operation?.trim() || "Outbound HTTP request";
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_OUTBOUND_HTTP_TIMEOUT_MS);
  const maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_OUTBOUND_HTTP_MAX_RESPONSE_BYTES);
  const target = await resolveOutboundHttpUrl(inputUrl(input), {
    env,
    lookupFn: options.lookupFn
  });
  const dispatcher = target.lookup ? new Agent({ connect: { lookup: target.lookup } }) : undefined;
  const timeoutController = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutController.signal]) : timeoutController.signal;
  let cleanedUp = false;
  let timedOut = false;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeout);
    if (dispatcher) void dispatcher.destroy();
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
    rejectDeadline(new Error(`${operation} timed out after ${timeoutMs}ms.`));
    cleanup();
  }, timeoutMs);

  try {
    const requestInit = {
      ...init,
      redirect: "manual",
      signal,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit;
    const response = await Promise.race([(options.fetchFn ?? globalThis.fetch)(input, requestInit), deadline]);

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      cleanup();
      throw new Error(`${operation} redirect was blocked (${response.status}).`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxResponseBytes) {
      await response.body?.cancel().catch(() => undefined);
      cleanup();
      throw new Error(
        options.responseSizeErrorMessage ?? `${operation} response exceeded the ${maxResponseBytes}-byte limit.`
      );
    }

    if (!response.body) {
      cleanup();
      return response;
    }

    const reader = response.body.getReader();
    let receivedBytes = 0;
    const boundedBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            cleanup();
            controller.close();
            return;
          }
          receivedBytes += result.value.byteLength;
          if (receivedBytes > maxResponseBytes) {
            timeoutController.abort();
            await reader.cancel().catch(() => undefined);
            cleanup();
            controller.error(
              new Error(
                options.responseSizeErrorMessage ?? `${operation} response exceeded the ${maxResponseBytes}-byte limit.`
              )
            );
            return;
          }
          controller.enqueue(result.value);
        } catch (error) {
          cleanup();
          controller.error(
            timedOut
              ? new Error(`${operation} timed out after ${timeoutMs}ms.`)
              : sanitizeOutboundError(error, options.secrets ?? [])
          );
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
        cleanup();
      }
    });
    return new Response(boundedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    cleanup();
    if (timedOut || (error instanceof Error && error.name === "AbortError" && timeoutController.signal.aborted)) {
      throw new Error(`${operation} timed out after ${timeoutMs}ms.`, { cause: error });
    }
    throw sanitizeOutboundError(error, options.secrets ?? []);
  }
}

export function createOutboundHttpFetch(options: OutboundHttpOptions): typeof fetch {
  return (input, init) => fetchOutboundHttp(input, init, options);
}

/**
 * Validates an outbound http(s) URL against the SSRF guard used for ingestion
 * and model discovery. Returns the parsed URL when allowed.
 */
export async function assertOutboundHttpUrlAllowed(url: string, options: UrlSafetyOptions = {}): Promise<URL> {
  return (await resolveOutboundHttpUrl(url, options)).url;
}
