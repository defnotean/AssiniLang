import { lookup as dnsLookup } from "node:dns/promises";

type Env = Record<string, string | undefined>;
type LookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

export type UrlSafetyOptions = {
  env?: Env;
  lookupFn?: LookupFn;
};

export function privateUrlsAllowed(env: Env): boolean {
  const value = env.ASSINI_ALLOW_PRIVATE_URLS?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = [octets[0] ?? -1, octets[1] ?? -1];
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

function isPrivateIpv6(address: string): boolean {
  const normalized = (address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0] ?? "");
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (/^f[cd]/.test(normalized)) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return false;
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
  return `URL points at a private or local network (${hostname}) and was blocked. Only public URLs can be fetched; set ASSINI_ALLOW_PRIVATE_URLS=1 to allow private URLs in a trusted local setup.`;
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

async function assertResolvedAddressAllowed(hostname: string, env: Env, lookupFn: LookupFn): Promise<void> {
  if (privateUrlsAllowed(env)) return;

  const isIpLiteral = isIpv4Literal(hostname) || hostname.includes(":") || hostname.startsWith("[");
  if (isIpLiteral) return;

  let resolvedAddress: string;
  try {
    resolvedAddress = (await lookupFn(hostname)).address;
  } catch {
    throw new Error(
      `URL hostname ${hostname} could not be resolved and was blocked. Only resolvable public URLs can be fetched; set ASSINI_ALLOW_PRIVATE_URLS=1 to allow private URLs in a trusted local setup.`
    );
  }

  if (isPrivateAddress(resolvedAddress)) {
    throw new Error(
      `URL hostname ${hostname} resolves to a private or local network address and was blocked. Only public URLs can be fetched; set ASSINI_ALLOW_PRIVATE_URLS=1 to allow private URLs in a trusted local setup.`
    );
  }
}

/**
 * Validates an outbound http(s) URL against the SSRF guard used for ingestion
 * and model discovery. Returns the parsed URL when allowed.
 */
export async function assertOutboundHttpUrlAllowed(
  url: string,
  options: UrlSafetyOptions = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL is not valid: ${url}`);
  }

  assertHttpProtocol(parsed);
  const env = options.env ?? process.env;
  assertHostnameAllowed(parsed, env);
  await assertResolvedAddressAllowed(
    parsed.hostname,
    env,
    options.lookupFn ?? ((hostname: string) => dnsLookup(hostname))
  );
  return parsed;
}
