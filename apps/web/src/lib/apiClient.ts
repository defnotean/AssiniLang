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
};

let actorFetchQueue: Promise<void> = Promise.resolve();

export class ApiError extends Error {
  readonly status?: number;
  readonly requestId?: string;

  constructor(message: string, options: { status?: number; requestId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.requestId = options.requestId;
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

  return new ApiError(message, {
    status: response.status || undefined,
    requestId
  });
}

export async function assertOk(response: Response, fallback: string): Promise<void> {
  if (!response.ok) {
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

async function openPrototypeSession(actor: LocalActor): Promise<void> {
  if (desktopBridge()?.prototypeAuth) {
    prototypeActorId(actor);
    return;
  }

  if (!import.meta.env.DEV) {
    throw prototypeAuthUnavailable();
  }

  const response = await fetch("/api/auth/prototype-session", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders(true),
    body: JSON.stringify({ userId: prototypeActorId(actor) })
  });

  await assertOk(response, `Prototype session failed for ${actor}`);
}

/** Logs out of the local prototype session: clears the server record and expires the HttpOnly cookie. */
export async function closePrototypeSession(): Promise<void> {
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
}

export async function actorRequest(actor: LocalActor, json = false): Promise<RequestInit> {
  const desktopHeaders = desktopActorHeaders(actor, json);
  if (desktopHeaders) {
    return { headers: desktopHeaders };
  }

  await openPrototypeSession(actor);
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

  const operation = actorFetchQueue.then(async () => {
    await openPrototypeSession(actor);
    return fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...jsonHeaders(json),
        ...((init.headers ?? {}) as Record<string, string>)
      }
    });
  });
  actorFetchQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

export async function getJson<T>(path: string, actor?: LocalActor, init?: RequestInit): Promise<T> {
  const response = await (actor
    ? fetchAsActor(actor, `/api${path}`, init)
    : fetch(`/api${path}`, init));

  await assertOk(response, `Request failed: ${path}`);

  return response.json() as Promise<T>;
}

export async function actorJsonRequest<T>(
  actor: LocalActor,
  input: RequestInfo | URL,
  init: Omit<RequestInit, "credentials" | "headers">,
  fallback: string
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    ...(await actorRequest(actor, true))
  });

  await assertOk(response, fallback);

  return response.json() as Promise<T>;
}
