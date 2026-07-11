export type LocalActor = "learner" | "elder" | "programmer" | "reviewer";

export type DesktopPreferences = {
  hideToTray: boolean;
  hideToTraySupported?: boolean;
  launchAtLogin: boolean;
  launchAtLoginSupported?: boolean;
};

export type DesktopBackupSummary = {
  backupsDir?: string;
  count: number;
  latestCreatedAt?: string;
  latestName?: string;
  latestPath?: string;
};

export type DesktopShortcutSummary = {
  desktopExists: boolean;
  desktopPath?: string;
  startMenuExists: boolean;
  startMenuPath?: string;
};

type DesktopActionBridgeResult = Promise<{
  ok: boolean;
  code?: string;
  i18nKey?: string;
  message?: string;
  backupSummary?: DesktopBackupSummary;
  diagnosticsDir?: string;
  diagnosticsPath?: string;
  shortcutSummary?: DesktopShortcutSummary;
}>;

type AssiniDesktopBridge = {
  apiBaseUrl: string;
  appFolder?: string;
  appPath?: string;
  appVersion?: string;
  authToken: string;
  backupSummary?: DesktopBackupSummary;
  backupsDir?: string;
  createAppShortcuts?: () => DesktopActionBridgeResult;
  createDataBackup?: () => DesktopActionBridgeResult;
  createDesktopShortcut?: () => DesktopActionBridgeResult;
  createStartMenuShortcut?: () => DesktopActionBridgeResult;
  dataDir?: string;
  diagnosticsDir?: string;
  desktopPreferences?: DesktopPreferences;
  isPackaged?: boolean;
  openBackupsFolder?: () => DesktopActionBridgeResult;
  openAppFolder?: () => DesktopActionBridgeResult;
  openDataFolder?: () => DesktopActionBridgeResult;
  openDiagnosticsFolder?: () => DesktopActionBridgeResult;
  openLatestBackupFolder?: () => DesktopActionBridgeResult;
  openSettingsFolder?: () => DesktopActionBridgeResult;
  pruneOldDataBackups?: () => DesktopActionBridgeResult;
  prototypeAuth: true;
  refreshBackupSummary?: () => DesktopActionBridgeResult;
  refreshShortcutSummary?: () => DesktopActionBridgeResult;
  restoreLatestDataBackup?: () => DesktopActionBridgeResult;
  resetWindowLayout?: () => DesktopActionBridgeResult;
  saveDiagnosticsReport?: (text: string) => DesktopActionBridgeResult;
  setDesktopPreferences?: (patch: Partial<Pick<DesktopPreferences, "hideToTray" | "launchAtLogin">>) => Promise<{
    ok: boolean;
    code?: string;
    i18nKey?: string;
    message?: string;
    preferences?: DesktopPreferences;
  }>;
  shortcutSummary?: DesktopShortcutSummary;
  settingsPath?: string;
};

declare global {
  interface Window {
    assiniDesktop?: AssiniDesktopBridge;
  }
}

type ErrorDetails = {
  detail?: string;
  requestId?: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
};

let actorFetchQueue: Promise<void> = Promise.resolve();
/** Last actor that successfully opened a browser prototype session in this tab. */
let cachedPrototypeActor: LocalActor | undefined;
/**
 * Bumped on sign-out and 401 so an in-flight POST cannot revive the reuse cache
 * after the cookie was cleared.
 */
let prototypeSessionGeneration = 0;

/** Test helper: clears the in-memory prototype-session reuse cache. */
export function resetPrototypeSessionCache(): void {
  cachedPrototypeActor = undefined;
  prototypeSessionGeneration += 1;
}

function invalidatePrototypeSessionCache(): void {
  cachedPrototypeActor = undefined;
  prototypeSessionGeneration += 1;
}

async function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = actorFetchQueue.then(operation, operation);
  actorFetchQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly requestId?: string;
  readonly i18nKey?: string;
  readonly i18nParams?: Record<string, string | number>;

  constructor(
    message: string,
    options: {
      status?: number;
      requestId?: string;
      i18nKey?: string;
      i18nParams?: Record<string, string | number>;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.requestId = options.requestId;
    this.i18nKey = options.i18nKey;
    this.i18nParams = options.i18nParams;
  }
}

function jsonHeaders(json = false): HeadersInit {
  return json ? { "Content-Type": "application/json" } : {};
}

function prototypeAuthUnavailable(): Error {
  return new Error("Prototype session auth is available only in the local Vite dev server or AssiniLang Desktop.");
}

function desktopBridge(): AssiniDesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.assiniDesktop;
}

const desktopApiPathPattern = /^\/api(?:[/?#]|$)/;

function desktopApiBaseUrl(): string | undefined {
  const candidate = desktopBridge()?.apiBaseUrl;
  if (typeof candidate !== "string" || candidate.length === 0) return undefined;

  try {
    const url = new URL(candidate);
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
    if (
      url.protocol !== "http:" ||
      !isLoopback ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function resolveDesktopApiInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string" || !desktopApiPathPattern.test(input)) return input;

  const baseUrl = desktopApiBaseUrl();
  if (!baseUrl) return input;

  const apiPath = input.slice("/api".length);
  return `${baseUrl}${apiPath || "/"}`;
}

function installDesktopApiFetch(): void {
  if (typeof window === "undefined" || !desktopApiBaseUrl() || typeof window.fetch !== "function") return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => nativeFetch(resolveDesktopApiInput(input), init);
}

installDesktopApiFetch();

function desktopActorHeaders(actor: LocalActor, json = false): HeadersInit | undefined {
  const bridge = desktopBridge();
  if (!bridge?.prototypeAuth || !bridge.authToken) return undefined;
  return {
    ...jsonHeaders(json),
    "x-assini-user-id": prototypeActorId(actor),
    "x-assini-dev-token": bridge.authToken
  };
}

function canUsePrototypeAuth(): boolean {
  return import.meta.env.DEV || Boolean(desktopBridge()?.prototypeAuth && desktopBridge()?.authToken);
}

function requestIdFromValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requestIdFromHeaders(response: Response): string | undefined {
  try {
    return requestIdFromValue(response.headers?.get("x-request-id") ?? response.headers?.get("X-Request-Id"));
  } catch {
    return undefined;
  }
}

function retryAfterSecondsFromHeaders(response: Response): number | undefined {
  try {
    const raw = response.headers?.get("Retry-After") ?? response.headers?.get("retry-after");
    if (!raw) return undefined;
    const seconds = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  } catch {
    return undefined;
  }
}

function errorDetailsFromBody(body: unknown): ErrorDetails {
  if (typeof body === "string" && body.trim().length > 0) return { detail: body.trim() };
  if (!body || typeof body !== "object") return {};

  const record = body as Record<string, unknown>;
  const details: ErrorDetails = {
    requestId: requestIdFromValue(record.requestId)
  };

  for (const key of ["error", "message", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      details.detail = value.trim();
      break;
    }
  }

  if (typeof record.i18nKey === "string" && record.i18nKey.trim().length > 0) {
    details.i18nKey = record.i18nKey.trim();
  }

  if (record.i18nParams && typeof record.i18nParams === "object") {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(record.i18nParams as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") {
        params[key] = value;
      }
    }
    if (Object.keys(params).length > 0) {
      details.i18nParams = params;
    }
  }

  return details;
}

async function readErrorDetails(response: Response): Promise<ErrorDetails> {
  try {
    return errorDetailsFromBody(await response.json());
  } catch {
    try {
      return errorDetailsFromBody(await response.text());
    } catch {
      return {};
    }
  }
}

async function errorFromResponse(response: Response, fallback: string): Promise<Error> {
  const status = response.status ? ` (${response.status})` : "";
  const details = await readErrorDetails(response);
  const requestId = requestIdFromHeaders(response) ?? details.requestId;
  const requestIdSuffix = requestId ? ` (request id: ${requestId})` : "";
  const retryAfterSeconds = response.status === 429 ? retryAfterSecondsFromHeaders(response) : undefined;
  const retryAfterSuffix = retryAfterSeconds
    ? ` Retry after ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`
    : "";
  const message = details.detail
    ? `${fallback}${status}: ${details.detail}${requestIdSuffix}${retryAfterSuffix}`
    : `${fallback}${status}${requestIdSuffix}${retryAfterSuffix}`;

  let i18nKey = details.i18nKey;
  let i18nParams = details.i18nParams ? { ...details.i18nParams } : undefined;

  // Synthesize operator-facing keys when older proxies omit them, and prefer
  // Retry-After for rate-limit seconds when the body did not include i18nParams.
  if (response.status === 429) {
    i18nKey ??= "app.rateLimitExceeded";
    const bodySeconds = i18nParams?.seconds;
    const parsedBodySeconds =
      typeof bodySeconds === "number"
        ? bodySeconds
        : typeof bodySeconds === "string"
          ? Number.parseInt(bodySeconds, 10)
          : undefined;
    const seconds =
      parsedBodySeconds !== undefined && Number.isFinite(parsedBodySeconds) && parsedBodySeconds > 0
        ? parsedBodySeconds
        : retryAfterSeconds;
    if (seconds !== undefined) {
      i18nParams = { ...(i18nParams ?? {}), seconds };
    }
  } else if (response.status === 413) {
    i18nKey ??= "errors.payloadTooLarge";
  }

  return new ApiError(message, {
    status: response.status || undefined,
    requestId,
    i18nKey,
    i18nParams
  });
}

export async function assertOk(response: Response, fallback: string): Promise<void> {
  if (!response.ok) {
    // Stale/unknown/expired cookie → server 401 + Max-Age=0; drop local reuse so
    // the next actor call POSTs a fresh prototype session instead of assuming the cookie is live.
    if (response.status === 401) {
      invalidatePrototypeSessionCache();
    }
    throw await errorFromResponse(response, fallback);
  }
}

function prototypeActorId(actor: LocalActor): string {
  if (!canUsePrototypeAuth()) {
    throw prototypeAuthUnavailable();
  }

  switch (actor) {
    case "learner":
      return "learner-1";
    case "elder":
      return "elder-1";
    case "programmer":
      return "programmer-1";
    case "reviewer":
      return "reviewer-1";
  }
}

async function postPrototypeSession(actor: LocalActor): Promise<void> {
  const response = await fetch("/api/auth/prototype-session", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders(true),
    body: JSON.stringify({ userId: prototypeActorId(actor) })
  });

  await assertOk(response, `Prototype session failed for ${actor}`);
}

/**
 * Opens a prototype session only when the actor changed, after sign-out, or after a 401.
 * Serialized with actorRequest/fetchAsActor/closePrototypeSession so concurrent calls
 * cannot race two POSTs or revive the cache after sign-out.
 */
async function ensurePrototypeSession(actor: LocalActor): Promise<void> {
  if (desktopBridge()?.prototypeAuth) {
    prototypeActorId(actor);
    return;
  }

  if (!import.meta.env.DEV) {
    throw prototypeAuthUnavailable();
  }

  if (cachedPrototypeActor === actor) {
    return;
  }

  const generationAtStart = prototypeSessionGeneration;
  await postPrototypeSession(actor);
  // Sign-out or 401 while POST was in flight must not mark the cleared cookie as reusable.
  if (generationAtStart !== prototypeSessionGeneration) {
    return;
  }
  cachedPrototypeActor = actor;
}

/**
 * Ensure + credentialed fetch, with one reopen/retry when the cookie is stale (401).
 * Caller must already be inside runSerialized (or be the sole queue owner).
 */
async function credentialedActorFetch(
  actor: LocalActor,
  input: RequestInfo | URL,
  init: RequestInit,
  json: boolean
): Promise<Response> {
  await ensurePrototypeSession(actor);
  const headers = {
    ...jsonHeaders(json),
    ...((init.headers ?? {}) as Record<string, string>)
  };
  const requestInit: RequestInit = {
    ...init,
    credentials: "include",
    headers
  };

  let response = await fetch(input, requestInit);
  if (response.status === 401) {
    invalidatePrototypeSessionCache();
    await ensurePrototypeSession(actor);
    response = await fetch(input, requestInit);
  }
  return response;
}

/** Logs out of the local prototype session: clears the server record and expires the HttpOnly cookie. */
export async function closePrototypeSession(): Promise<void> {
  return runSerialized(async () => {
    invalidatePrototypeSessionCache();

    if (desktopBridge()?.prototypeAuth) {
      return;
    }

    if (!import.meta.env.DEV) {
      throw prototypeAuthUnavailable();
    }

    const response = await fetch("/api/auth/prototype-session", {
      method: "DELETE",
      credentials: "include"
    });

    await assertOk(response, "Prototype sign-out failed");
  });
}

export async function actorRequest(actor: LocalActor, json = false): Promise<RequestInit> {
  const desktopHeaders = desktopActorHeaders(actor, json);
  if (desktopHeaders) {
    return { headers: desktopHeaders };
  }

  await runSerialized(() => ensurePrototypeSession(actor));
  return {
    credentials: "include",
    headers: jsonHeaders(json)
  };
}

export async function fetchAsActor(
  actor: LocalActor,
  input: RequestInfo | URL,
  init: RequestInit = {},
  json = false
): Promise<Response> {
  const desktopHeaders = desktopActorHeaders(actor, json);
  if (desktopHeaders) {
    return fetch(input, {
      ...init,
      headers: {
        ...desktopHeaders,
        ...((init.headers ?? {}) as Record<string, string>)
      }
    });
  }

  return runSerialized(() => credentialedActorFetch(actor, input, init, json));
}

export async function getJson<T>(path: string, actor?: LocalActor, init?: RequestInit): Promise<T> {
  const response = await (actor ? fetchAsActor(actor, `/api${path}`, init) : fetch(`/api${path}`, init));

  await assertOk(response, `Request failed: ${path}`);

  return response.json() as Promise<T>;
}

export async function actorJsonRequest<T>(
  actor: LocalActor,
  input: RequestInfo | URL,
  init: Omit<RequestInit, "credentials" | "headers">,
  fallback: string
): Promise<T> {
  const desktopHeaders = desktopActorHeaders(actor, true);
  if (desktopHeaders) {
    const response = await fetch(input, {
      ...init,
      headers: desktopHeaders
    });
    await assertOk(response, fallback);
    return response.json() as Promise<T>;
  }

  const response = await runSerialized(() => credentialedActorFetch(actor, input, init, true));
  await assertOk(response, fallback);
  return response.json() as Promise<T>;
}
