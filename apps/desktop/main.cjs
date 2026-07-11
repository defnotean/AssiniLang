const { randomUUID } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } = require("electron");
const {
  DESKTOP_IPC_ERRORS,
  desktopIpcFailure,
  desktopIpcFailureFromError,
  normalizeDesktopAction,
  normalizeDesktopPreferencesPatch,
  normalizeDiagnosticsReportText
} = require("./desktopIpc.cjs");
const { createSmokeEventLog, runDesktopSmoke, serializeError } = require("./desktopSmoke.cjs");
const { createDesktopOperations } = require("./desktopOperations.cjs");
const { createDesktopWindowState } = require("./desktopWindowState.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const apiModuleUrl = pathToFileURL(path.join(repoRoot, "apps", "api", "dist", "index.js")).href;
const DESKTOP_UI_ROUTE_PREFIX = "/desktop-ui";
const DESKTOP_UI_ROOT = path.resolve(repoRoot, "apps", "web", "dist");
const DESKTOP_UI_MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
});
const DESKTOP_UI_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});
const IS_SMOKE_MODE = process.env.ASSINI_DESKTOP_SMOKE === "1";
const DEFAULT_WINDOW_BOUNDS = { width: 1280, height: 860 };
const MIN_WINDOW_BOUNDS = { width: 1040, height: 720 };
const DEFAULT_DESKTOP_PREFERENCES = {
  hideToTray: false,
  launchAtLogin: false
};

let apiServer;
let mainWindow;
let desktopBridgeInfo;
let desktopRuntime;
let desktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES };
let isQuitting = false;
let shouldQuitForSingleInstance = false;
let tray = null;

app.setAppUserModelId("AssiniLang");
if (IS_SMOKE_MODE) {
  const smokeUserDataDir = path.join(tmpdir(), `assini-desktop-smoke-${process.pid}`);
  mkdirSync(smokeUserDataDir, { recursive: true });
  app.setPath("userData", smokeUserDataDir);
}
if (!IS_SMOKE_MODE) {
  const singleInstanceLock = app.requestSingleInstanceLock();
  if (!singleInstanceLock) {
    shouldQuitForSingleInstance = true;
    app.quit();
  } else {
    app.on("second-instance", () => {
      focusMainWindow();
    });
  }
}

function distUrl(relativePath) {
  return pathToFileURL(path.join(repoRoot, relativePath)).href;
}

function resolveExternalNavigationUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function focusMainWindow() {
  if (!mainWindow) return false;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  return true;
}

function desktopPreferencesPath() {
  return path.join(app.getPath("userData"), "desktop-preferences.json");
}

function sanitizeDesktopPreferences(value) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    hideToTray: candidate.hideToTray === true,
    launchAtLogin: candidate.launchAtLogin === true
  };
}

function readDesktopPreferences() {
  try {
    return sanitizeDesktopPreferences(JSON.parse(readFileSync(desktopPreferencesPath(), "utf8")));
  } catch {
    return { ...DEFAULT_DESKTOP_PREFERENCES };
  }
}

function writeDesktopPreferences(preferences) {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(desktopPreferencesPath(), JSON.stringify(sanitizeDesktopPreferences(preferences), null, 2));
}

function currentDesktopPreferences() {
  const launchAtLoginSettings = app.isPackaged ? app.getLoginItemSettings() : null;
  return {
    hideToTray: desktopPreferences.hideToTray,
    hideToTraySupported: !IS_SMOKE_MODE,
    launchAtLogin: launchAtLoginSettings?.openAtLogin ?? desktopPreferences.launchAtLogin,
    launchAtLoginSupported: app.isPackaged && !IS_SMOKE_MODE
  };
}

function syncLaunchAtLoginPreference() {
  if (!app.isPackaged || IS_SMOKE_MODE) return;
  app.setLoginItemSettings({
    openAtLogin: desktopPreferences.launchAtLogin,
    openAsHidden: false,
    path: process.execPath
  });
}

function desktopAppMetadata() {
  return {
    appFolder: path.dirname(process.execPath),
    appPath: process.execPath,
    appVersion: app.getVersion()
  };
}

async function createTrayIcon() {
  try {
    const fileIcon = await app.getFileIcon(process.execPath, { size: "normal" });
    if (!fileIcon.isEmpty()) return fileIcon;
  } catch {
    // Fall back to a generated icon below.
  }

  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>",
    "<rect width='32' height='32' rx='6' fill='#111827'/>",
    "<path d='M16 4v24M4 16h24M8.5 8.5l15 15M23.5 8.5l-15 15' stroke='#f8fafc' stroke-width='2' stroke-linecap='round'/>",
    "<circle cx='16' cy='16' r='4' fill='#38bdf8'/>",
    "</svg>"
  ].join("");
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

async function ensureTray() {
  if (tray || IS_SMOKE_MODE) return;

  const icon = await createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("AssiniLang");
  tray.on("click", () => {
    focusMainWindow();
  });
  tray.on("double-click", () => {
    focusMainWindow();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open AssiniLang",
        click: () => {
          focusMainWindow();
        }
      },
      {
        label: "Open data folder",
        click: () => {
          void openDesktopPath("dataFolder").catch((error) => {
            dialog.showErrorBox("AssiniLang Desktop", error instanceof Error ? error.message : String(error));
          });
        }
      },
      {
        label: "Create data backup",
        click: () => {
          void createDataBackup()
            .then(() => {
              focusMainWindow();
            })
            .catch((error) => {
              dialog.showErrorBox("AssiniLang Desktop", error instanceof Error ? error.message : String(error));
            });
        }
      },
      { type: "separator" },
      {
        label: "Quit AssiniLang",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

async function applyDesktopPreferences() {
  syncLaunchAtLoginPreference();
  if (desktopPreferences.hideToTray) {
    await ensureTray();
  } else {
    destroyTray();
  }
}

function refreshDesktopBridgePreferences() {
  if (desktopBridgeInfo) {
    desktopBridgeInfo = {
      ...desktopBridgeInfo,
      desktopPreferences: currentDesktopPreferences()
    };
  }
}

async function updateDesktopPreferences(patch) {
  const normalized = normalizeDesktopPreferencesPatch(patch);
  if (!normalized.ok) {
    return {
      ...normalized,
      preferences: currentDesktopPreferences()
    };
  }

  const next = { ...desktopPreferences };
  if (typeof normalized.patch.hideToTray === "boolean") {
    next.hideToTray = normalized.patch.hideToTray;
  }
  if (typeof normalized.patch.launchAtLogin === "boolean") {
    if (!app.isPackaged || IS_SMOKE_MODE) {
      return {
        ...desktopIpcFailure(DESKTOP_IPC_ERRORS.LAUNCH_AT_LOGIN_PACKAGED_ONLY),
        preferences: currentDesktopPreferences()
      };
    }
    next.launchAtLogin = normalized.patch.launchAtLogin;
  }

  desktopPreferences = sanitizeDesktopPreferences(next);
  writeDesktopPreferences(desktopPreferences);
  await applyDesktopPreferences();
  refreshDesktopBridgePreferences();
  return {
    ok: true,
    message: "Desktop preference saved.",
    preferences: currentDesktopPreferences()
  };
}

const desktopOperations = createDesktopOperations({
  app,
  desktopAppMetadata,
  desktopIpcErrors: DESKTOP_IPC_ERRORS,
  desktopIpcFailure,
  getDesktopRuntime: () => desktopRuntime,
  getMainWindow: () => mainWindow,
  normalizeDiagnosticsReportText,
  shell,
  updateDesktopBridge: (patch) => {
    if (desktopBridgeInfo) desktopBridgeInfo = { ...desktopBridgeInfo, ...patch };
  }
});
const {
  createAppShortcuts,
  createDataBackup,
  createDesktopShortcut,
  createStartMenuShortcut,
  desktopBackupSummary,
  desktopShortcutSummary,
  openDesktopPath,
  openLatestBackupFolder,
  pruneOldDataBackups,
  refreshDesktopBridgeShortcutSummary,
  restoreLatestDataBackup,
  saveDesktopDiagnosticsReport
} = desktopOperations;
function registerDesktopActions() {
  ipcMain.on("assini:desktop-info", (event) => {
    event.returnValue = desktopBridgeInfo ?? {
      apiBaseUrl: process.env.ASSINI_DESKTOP_API_URL,
      authToken: process.env.ASSINI_DESKTOP_AUTH_TOKEN,
      backupSummary: undefined,
      backupsDir: process.env.ASSINI_DESKTOP_BACKUPS_DIR,
      ...desktopAppMetadata(),
      dataDir: process.env.ASSINI_DESKTOP_DATA_DIR,
      desktopPreferences: currentDesktopPreferences(),
      diagnosticsDir: process.env.ASSINI_DESKTOP_DIAGNOSTICS_DIR,
      isPackaged: process.env.ASSINI_DESKTOP_IS_PACKAGED === "1",
      prototypeAuth: true,
      shortcutSummary: undefined,
      settingsPath: process.env.ASSINI_DESKTOP_SETTINGS_PATH
    };
  });

  ipcMain.handle("assini:desktop-backup-summary", async () => {
    try {
      return {
        ok: true,
        backupSummary: desktopBackupSummary()
      };
    } catch (error) {
      return desktopIpcFailureFromError(error);
    }
  });

  ipcMain.handle("assini:desktop-shortcut-summary", async () => {
    try {
      return {
        ok: true,
        shortcutSummary: refreshDesktopBridgeShortcutSummary()
      };
    } catch (error) {
      return desktopIpcFailureFromError(error);
    }
  });

  ipcMain.handle("assini:desktop-diagnostics", async (_event, text) => {
    try {
      return await saveDesktopDiagnosticsReport(text);
    } catch (error) {
      return desktopIpcFailureFromError(error);
    }
  });

  ipcMain.handle("assini:desktop-action", async (_event, action) => {
    try {
      const normalized = normalizeDesktopAction(action);
      if (!normalized.ok) {
        return normalized;
      }

      switch (normalized.action) {
        case "openDataFolder":
          return await openDesktopPath("dataFolder");
        case "openAppFolder":
          return await openDesktopPath("appFolder");
        case "openSettingsFolder":
          return await openDesktopPath("settingsFolder");
        case "openBackupsFolder":
          return await openDesktopPath("backupsFolder");
        case "openDiagnosticsFolder":
          return await openDesktopPath("diagnosticsFolder");
        case "openLatestBackupFolder":
          return await openLatestBackupFolder();
        case "pruneOldDataBackups":
          return await pruneOldDataBackups();
        case "createDesktopShortcut":
          return await createDesktopShortcut();
        case "createStartMenuShortcut":
          return await createStartMenuShortcut();
        case "createAppShortcuts":
          return await createAppShortcuts();
        case "createDataBackup":
          return await createDataBackup();
        case "restoreLatestDataBackup":
          return await restoreLatestDataBackup();
        case "resetWindowLayout":
          return await resetWindowLayout();
        default:
          return desktopIpcFailure(DESKTOP_IPC_ERRORS.UNKNOWN_ACTION, {
            message: `Unknown desktop action: ${normalized.action}.`
          });
      }
    } catch (error) {
      return desktopIpcFailureFromError(error);
    }
  });

  ipcMain.handle("assini:desktop-preferences", async (_event, patch) => {
    try {
      return await updateDesktopPreferences(patch);
    } catch (error) {
      return {
        ...desktopIpcFailureFromError(error),
        preferences: currentDesktopPreferences()
      };
    }
  });
}

const { applyWindowState, readWindowState, resetWindowLayout, writeWindowState } = createDesktopWindowState({
  app,
  defaultWindowBounds: DEFAULT_WINDOW_BOUNDS,
  desktopIpcFailure,
  getMainWindow: () => mainWindow,
  minWindowBounds: MIN_WINDOW_BOUNDS,
  noWindowError: DESKTOP_IPC_ERRORS.NO_WINDOW,
  screen
});

function isStrictChildPath(parentPath, targetPath) {
  const relative = path.relative(parentPath, targetPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveDesktopUiAssetPath(requestPath, desktopUiRoot) {
  if (typeof requestPath !== "string" || !requestPath) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (
    !decodedPath ||
    decodedPath.startsWith("/") ||
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    decodedPath.includes("%")
  ) {
    return null;
  }

  const segments = decodedPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    return null;
  }

  const candidatePath = path.resolve(desktopUiRoot, ...segments);
  if (!isStrictChildPath(desktopUiRoot, candidatePath)) return null;

  try {
    const resolvedPath = realpathSync(candidatePath);
    if (!isStrictChildPath(desktopUiRoot, resolvedPath) || !statSync(resolvedPath).isFile()) return null;
    return resolvedPath;
  } catch {
    return null;
  }
}

function applyDesktopUiHeaders(reply) {
  for (const [name, value] of Object.entries(DESKTOP_UI_HEADERS)) {
    reply.header(name, value);
  }
}

function registerDesktopUiRoute(server) {
  let desktopUiRoot;
  try {
    desktopUiRoot = realpathSync(DESKTOP_UI_ROOT);
  } catch {
    throw new Error("The web app is not built yet. Run `npm.cmd run build` before launching AssiniLang Desktop.");
  }
  const indexPath = resolveDesktopUiAssetPath("index.html", desktopUiRoot);
  if (!indexPath) {
    throw new Error("The web app is not built yet. Run `npm.cmd run build` before launching AssiniLang Desktop.");
  }

  server.get(`${DESKTOP_UI_ROUTE_PREFIX}/*`, async (request, reply) => {
    applyDesktopUiHeaders(reply);
    const requestPath = request.params && typeof request.params === "object" ? request.params["*"] : undefined;
    const assetPath = resolveDesktopUiAssetPath(requestPath, desktopUiRoot);
    const contentType = assetPath ? DESKTOP_UI_MIME_TYPES[path.extname(assetPath).toLowerCase()] : undefined;
    if (!assetPath || !contentType) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
    }

    return reply.type(contentType).send(readFileSync(assetPath));
  });
}

async function startApiServer() {
  const [
    { JsonStore },
    { createServer },
    { bootstrapRuntimeEnvironment },
    { applyLoopbackPrivateUrlDefault },
    { resolveRuntimeDataDir, resolveRuntimeDbPath }
  ] = await Promise.all([
    import("@assini/db"),
    import(distUrl(path.join("apps", "api", "dist", "server.js"))),
    import(distUrl(path.join("apps", "api", "dist", "runtimeEnvLoader.js"))),
    import(distUrl(path.join("apps", "api", "dist", "runtimeConfig.js"))),
    import(distUrl(path.join("apps", "api", "dist", "runtimePath.js")))
  ]);

  const userDataDir = app.getPath("userData");
  const desktopDataDir = path.join(userDataDir, "data");
  const desktopDbPath = path.join(desktopDataDir, "local-db.json");
  const desktopSettingsPath = path.join(userDataDir, ".env");
  mkdirSync(desktopDataDir, { recursive: true });
  process.env.ASSINI_DB_PATH = process.env.ASSINI_DB_PATH || desktopDbPath;

  const authToken = randomUUID();
  const settingsPath = bootstrapRuntimeEnvironment({
    moduleUrl: apiModuleUrl,
    cwd: userDataDir,
    settingsPath: desktopSettingsPath
  });
  applyLoopbackPrivateUrlDefault(process.env, "127.0.0.1");
  desktopRuntime = {
    backupsDir: path.join(userDataDir, "backups"),
    dataDir: resolveRuntimeDataDir({ moduleUrl: apiModuleUrl }),
    dbPath: resolveRuntimeDbPath({ moduleUrl: apiModuleUrl }),
    diagnosticsDir: path.join(userDataDir, "diagnostics"),
    settingsPath,
    userDataDir
  };
  const server = createServer({
    store: new JsonStore(desktopRuntime.dbPath),
    dataDir: desktopRuntime.dataDir,
    settingsPath,
    authToken,
    enablePrototypeAuth: true,
    allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    logger: false
  });

  registerDesktopUiRoute(server);
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  if (!address || typeof address === "string") {
    await server.close();
    throw new Error("Desktop API server did not expose a local TCP address.");
  }

  return {
    authToken,
    baseUrl: `http://127.0.0.1:${address.port}`,
    server
  };
}

async function createMainWindow(api) {
  const indexPath = path.join(repoRoot, "apps", "web", "dist", "index.html");
  if (!existsSync(indexPath)) {
    throw new Error("The web app is not built yet. Run `npm.cmd run build` before launching AssiniLang Desktop.");
  }

  process.env.ASSINI_DESKTOP_API_URL = api.baseUrl;
  process.env.ASSINI_DESKTOP_AUTH_TOKEN = api.authToken;
  process.env.ASSINI_DESKTOP_BACKUPS_DIR = desktopRuntime?.backupsDir ?? "";
  process.env.ASSINI_DESKTOP_APP_FOLDER = desktopAppMetadata().appFolder;
  process.env.ASSINI_DESKTOP_APP_PATH = desktopAppMetadata().appPath;
  process.env.ASSINI_DESKTOP_APP_VERSION = desktopAppMetadata().appVersion;
  process.env.ASSINI_DESKTOP_DATA_DIR = desktopRuntime?.dataDir ?? "";
  process.env.ASSINI_DESKTOP_DIAGNOSTICS_DIR = desktopRuntime?.diagnosticsDir ?? "";
  process.env.ASSINI_DESKTOP_IS_PACKAGED = app.isPackaged ? "1" : "";
  process.env.ASSINI_DESKTOP_SETTINGS_PATH = desktopRuntime?.settingsPath ?? "";
  desktopBridgeInfo = {
    apiBaseUrl: api.baseUrl,
    authToken: api.authToken,
    backupSummary: desktopBackupSummary(),
    backupsDir: desktopRuntime?.backupsDir ?? "",
    ...desktopAppMetadata(),
    dataDir: desktopRuntime?.dataDir ?? "",
    desktopPreferences: currentDesktopPreferences(),
    diagnosticsDir: desktopRuntime?.diagnosticsDir ?? "",
    isPackaged: app.isPackaged,
    prototypeAuth: true,
    shortcutSummary: desktopShortcutSummary(),
    settingsPath: desktopRuntime?.settingsPath ?? ""
  };
  const savedWindowState = readWindowState();

  mainWindow = new BrowserWindow({
    height: savedWindowState.height,
    minHeight: MIN_WINDOW_BOUNDS.height,
    minWidth: MIN_WINDOW_BOUNDS.width,
    width: savedWindowState.width,
    ...(savedWindowState.x != null && savedWindowState.y != null
      ? { x: savedWindowState.x, y: savedWindowState.y }
      : {}),
    show: false,
    title: "AssiniLang",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  applyWindowState(mainWindow, savedWindowState);
  mainWindow.on("close", (event) => {
    writeWindowState(mainWindow);
    if (desktopPreferences.hideToTray && !isQuitting && !IS_SMOKE_MODE) {
      event.preventDefault();
      mainWindow.hide();
      void ensureTray();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  const smokeEventLog = IS_SMOKE_MODE ? createSmokeEventLog(mainWindow.webContents) : null;
  if (IS_SMOKE_MODE) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        await runDesktopSmoke(api, smokeEventLog, {
          app,
          desktopRuntime,
          desktopUiRoutePrefix: DESKTOP_UI_ROUTE_PREFIX,
          mainWindow,
          minWindowBounds: MIN_WINDOW_BOUNDS
        });
        app.exit(0);
      } catch (error) {
        console.error(error);
        const reportPath = process.env.ASSINI_DESKTOP_SMOKE_REPORT;
        if (reportPath) {
          mkdirSync(path.dirname(reportPath), { recursive: true });
          writeFileSync(
            reportPath,
            JSON.stringify(
              {
                ok: false,
                apiBaseUrl: api.baseUrl,
                backupsDir: desktopRuntime?.backupsDir,
                dataDir: desktopRuntime?.dataDir,
                error: serializeError(error),
                isPackaged: app.isPackaged,
                rendererEvents: smokeEventLog?.events ?? [],
                settingsPath: desktopRuntime?.settingsPath,
                userDataDir: desktopRuntime?.userDataDir
              },
              null,
              2
            )
          );
        }
        app.exit(1);
      }
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = resolveExternalNavigationUrl(url);
    if (externalUrl) {
      void shell.openExternal(externalUrl);
    }
    return { action: "deny" };
  });

  await mainWindow.loadURL(`${api.baseUrl}${DESKTOP_UI_ROUTE_PREFIX}/index.html`);
}

async function boot() {
  try {
    desktopPreferences = readDesktopPreferences();
    await applyDesktopPreferences();
    apiServer = await startApiServer();
    await createMainWindow(apiServer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("AssiniLang Desktop failed to start", message);
    app.quit();
  }
}

if (!shouldQuitForSingleInstance) {
  registerDesktopActions();

  app.whenReady().then(boot);

  app.on("activate", () => {
    if (focusMainWindow()) {
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0 && apiServer) {
      void createMainWindow(apiServer);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !desktopPreferences.hideToTray) {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("will-quit", () => {
    if (apiServer?.server) {
      void apiServer.server.close();
    }
    destroyTray();
  });
}
