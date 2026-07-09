const { randomUUID } = require("node:crypto");
const { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } = require("electron");

const repoRoot = path.resolve(__dirname, "..", "..");
const apiModuleUrl = pathToFileURL(path.join(repoRoot, "apps", "api", "dist", "index.js")).href;
const IS_SMOKE_MODE = process.env.ASSINI_DESKTOP_SMOKE === "1";
const DEFAULT_WINDOW_BOUNDS = { width: 1280, height: 860 };
const MIN_WINDOW_BOUNDS = { width: 1040, height: 720 };
const SHORTCUT_NAME = "AssiniLang.lnk";
const SMOKE_MIN_NON_WHITE_RATIO = 0.01;
const SMOKE_SAMPLE_LIMIT = 200_000;
const BACKUP_RETENTION_COUNT = 5;
const DIAGNOSTICS_REPORT_MAX_CHARS = 200_000;
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

function focusMainWindow() {
  if (!mainWindow) return false;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  return true;
}

function actionResult(message) {
  return { ok: true, message };
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
  tray.setContextMenu(Menu.buildFromTemplate([
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
  ]));
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
  const next = { ...desktopPreferences };
  if (typeof patch?.hideToTray === "boolean") {
    next.hideToTray = patch.hideToTray;
  }
  if (typeof patch?.launchAtLogin === "boolean") {
    if (!app.isPackaged || IS_SMOKE_MODE) {
      return {
        ok: false,
        message: "Launch at sign-in is available in the packaged desktop app.",
        preferences: currentDesktopPreferences()
      };
    }
    next.launchAtLogin = patch.launchAtLogin;
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

function backupRootPath() {
  if (!desktopRuntime) {
    throw new Error("Desktop runtime paths are not ready yet.");
  }
  return desktopRuntime.backupsDir;
}

function diagnosticsRootPath() {
  if (!desktopRuntime) {
    throw new Error("Desktop runtime paths are not ready yet.");
  }
  return desktopRuntime.diagnosticsDir;
}

async function openDesktopPath(target) {
  if (target === "appFolder") {
    const folder = desktopAppMetadata().appFolder;
    const error = await shell.openPath(folder);
    if (error) {
      throw new Error(error);
    }
    return actionResult("Opened app folder.");
  }

  if (!desktopRuntime) {
    throw new Error("Desktop runtime paths are not ready yet.");
  }

  const folder = target === "settingsFolder"
    ? desktopRuntime.userDataDir
    : target === "backupsFolder"
      ? backupRootPath()
      : target === "diagnosticsFolder"
        ? diagnosticsRootPath()
        : desktopRuntime.dataDir;
  mkdirSync(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) {
    throw new Error(error);
  }

  if (target === "settingsFolder") return actionResult("Opened settings folder.");
  if (target === "backupsFolder") return actionResult("Opened backups folder.");
  if (target === "diagnosticsFolder") return actionResult("Opened diagnostics folder.");
  return actionResult("Opened data folder.");
}

async function saveDesktopDiagnosticsReport(text) {
  const diagnosticsDir = diagnosticsRootPath();
  mkdirSync(diagnosticsDir, { recursive: true });
  const reportText = typeof text === "string" && text.trim().length > 0
    ? text.slice(0, DIAGNOSTICS_REPORT_MAX_CHARS)
    : `AssiniLang Desktop diagnostics\nGenerated: ${new Date().toISOString()}\n`;
  const reportPath = path.join(diagnosticsDir, `diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  writeFileSync(reportPath, reportText, "utf8");
  return {
    ...actionResult(`Saved diagnostics report at ${reportPath}`),
    diagnosticsDir,
    diagnosticsPath: reportPath
  };
}

async function openLatestBackupFolder() {
  const latest = restorableBackups()[0];
  if (!latest) {
    return {
      ok: false,
      message: "No desktop data backup is available yet.",
      backupSummary: desktopBackupSummary()
    };
  }

  const error = await shell.openPath(latest.path);
  if (error) {
    throw new Error(error);
  }

  return {
    ...actionResult(`Opened latest backup ${latest.name}.`),
    backupSummary: desktopBackupSummary()
  };
}

function shortcutOptions() {
  return {
    target: process.execPath,
    cwd: path.dirname(process.execPath),
    description: "Open AssiniLang Desktop",
    icon: process.execPath,
    iconIndex: 0
  };
}

function createWindowsShortcut(shortcutPath) {
  mkdirSync(path.dirname(shortcutPath), { recursive: true });
  const created = shell.writeShortcutLink(shortcutPath, "create", shortcutOptions());
  if (!created) {
    throw new Error("Windows did not create the shortcut.");
  }
  return shortcutPath;
}

function startMenuProgramsPath() {
  if (!process.env.APPDATA) {
    throw new Error("APPDATA is not available for Start Menu shortcut creation.");
  }
  return path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
}

function desktopShortcutPath() {
  return path.join(app.getPath("desktop"), SHORTCUT_NAME);
}

function startMenuShortcutPath() {
  return path.join(startMenuProgramsPath(), SHORTCUT_NAME);
}

function desktopShortcutSummary() {
  const desktopPath = desktopShortcutPath();
  let startMenuPath;
  try {
    startMenuPath = startMenuShortcutPath();
  } catch {
    startMenuPath = undefined;
  }

  return {
    desktopExists: existsSync(desktopPath),
    desktopPath,
    startMenuExists: typeof startMenuPath === "string" && existsSync(startMenuPath),
    startMenuPath
  };
}

function refreshDesktopBridgeShortcutSummary() {
  const shortcutSummary = desktopShortcutSummary();
  if (desktopBridgeInfo) {
    desktopBridgeInfo = {
      ...desktopBridgeInfo,
      shortcutSummary
    };
  }
  return shortcutSummary;
}

async function createDesktopShortcut() {
  if (!app.isPackaged) {
    return { ok: false, message: "Desktop shortcut creation is available in the packaged app." };
  }

  const shortcutPath = createWindowsShortcut(desktopShortcutPath());

  return {
    ...actionResult(`Created ${shortcutPath}`),
    shortcutSummary: refreshDesktopBridgeShortcutSummary()
  };
}

async function createStartMenuShortcut() {
  if (!app.isPackaged) {
    return { ok: false, message: "Start Menu shortcut creation is available in the packaged app." };
  }

  const shortcutPath = createWindowsShortcut(startMenuShortcutPath());

  return {
    ...actionResult(`Created ${shortcutPath}`),
    shortcutSummary: refreshDesktopBridgeShortcutSummary()
  };
}

async function createAppShortcuts() {
  if (!app.isPackaged) {
    return { ok: false, message: "Shortcut setup is available in the packaged app." };
  }

  const desktopPath = createWindowsShortcut(desktopShortcutPath());
  const startMenuPath = createWindowsShortcut(startMenuShortcutPath());

  return {
    ...actionResult(`Created app shortcuts: ${desktopPath}; ${startMenuPath}`),
    shortcutSummary: refreshDesktopBridgeShortcutSummary()
  };
}

function assertChildPathInside(parentPath, targetPath, label) {
  const parent = path.resolve(parentPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} is outside the expected desktop data folder.`);
  }
  return target;
}

function desktopBackupName(prefix = "backup") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

async function createDataBackup(options = {}) {
  if (!desktopRuntime) {
    throw new Error("Desktop runtime paths are not ready yet.");
  }

  // Validate the live workspace before copying (parity with CLI db:backup).
  try {
    const { assertDesktopLiveDbReadable } = require("./backupRestore.cjs");
    const { JsonStore } = await import("@assini/db");
    await assertDesktopLiveDbReadable(desktopRuntime.dbPath, {
      readWorkspace: async (dbPath) => {
        await new JsonStore(dbPath).read();
      }
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      backupSummary: desktopBackupSummary()
    };
  }

  const backupPath = path.join(backupRootPath(), desktopBackupName(options.prefix));
  mkdirSync(backupPath, { recursive: true });

  if (existsSync(desktopRuntime.dataDir)) {
    cpSync(desktopRuntime.dataDir, path.join(backupPath, "data"), {
      recursive: true,
      force: true,
      errorOnExist: false
    });
  }
  if (desktopRuntime.settingsPath && existsSync(desktopRuntime.settingsPath)) {
    cpSync(desktopRuntime.settingsPath, path.join(backupPath, ".env"), {
      force: true,
      errorOnExist: false
    });
  }

  writeFileSync(path.join(backupPath, "backup-manifest.json"), JSON.stringify({
    createdAt: new Date().toISOString(),
    dataDir: desktopRuntime.dataDir,
    dbPath: desktopRuntime.dbPath,
    settingsPath: desktopRuntime.settingsPath
  }, null, 2));

  return {
    ...actionResult(`Created backup at ${backupPath}`),
    backupSummary: desktopBackupSummary()
  };
}

function restorableBackups() {
  const backupRoot = backupRootPath();
  mkdirSync(backupRoot, { recursive: true });
  const resolvedBackupRoot = path.resolve(backupRoot);

  return readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-"))
    .map((entry) => {
      const backupPath = assertChildPathInside(resolvedBackupRoot, path.join(backupRoot, entry.name), "Backup folder");
      let manifest = {};
      try {
        manifest = JSON.parse(readFileSync(path.join(backupPath, "backup-manifest.json"), "utf8"));
      } catch {
        manifest = {};
      }
      return {
        createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : undefined,
        name: entry.name,
        path: backupPath,
        stat: statSync(backupPath)
      };
    })
    .filter((entry) => existsSync(path.join(entry.path, "backup-manifest.json")) && existsSync(path.join(entry.path, "data")))
    .sort((left, right) => (
      right.stat.mtimeMs - left.stat.mtimeMs || right.name.localeCompare(left.name)
    ));
}

function desktopBackupSummary() {
  const backups = restorableBackups();
  const latest = backups[0];
  return {
    backupsDir: backupRootPath(),
    count: backups.length,
    latestCreatedAt: latest?.createdAt,
    latestName: latest?.name,
    latestPath: latest?.path
  };
}

async function pruneOldDataBackups() {
  const backups = restorableBackups().filter((entry) => !entry.name.startsWith("safety-before-restore-"));
  const prunable = backups.slice(BACKUP_RETENTION_COUNT);
  if (prunable.length === 0) {
    return {
      ok: true,
      message: `No old backups to prune. Keeping the newest ${BACKUP_RETENTION_COUNT}.`,
      backupSummary: desktopBackupSummary()
    };
  }

  const backupRoot = path.resolve(backupRootPath());
  for (const backup of prunable) {
    const backupPath = assertChildPathInside(backupRoot, backup.path, "Backup folder");
    rmSync(backupPath, { recursive: true, force: true });
  }

  return {
    ok: true,
    message: `Pruned ${prunable.length} old backup${prunable.length === 1 ? "" : "s"}.`,
    backupSummary: desktopBackupSummary()
  };
}

async function restoreLatestDataBackup() {
  if (!desktopRuntime) {
    throw new Error("Desktop runtime paths are not ready yet.");
  }

  const latest = restorableBackups()[0];
  if (!latest) {
    return {
      ok: false,
      message: "No desktop data backup is available to restore.",
      backupSummary: desktopBackupSummary()
    };
  }

  const userDataDir = path.resolve(desktopRuntime.userDataDir);
  const targetDataDir = assertChildPathInside(userDataDir, desktopRuntime.dataDir, "Desktop data folder");
  const targetSettingsPath = desktopRuntime.settingsPath
    ? assertChildPathInside(userDataDir, desktopRuntime.settingsPath, "Desktop settings file")
    : null;
  const sourceDataDir = assertChildPathInside(latest.path, path.join(latest.path, "data"), "Backup data folder");
  const sourceSettingsPath = assertChildPathInside(latest.path, path.join(latest.path, ".env"), "Backup settings file");

  // Validate the backup database before touching live data (matches CLI restoreFrom).
  try {
    const { assertDesktopBackupReadable } = require("./backupRestore.cjs");
    const { JsonStore } = await import("@assini/db");
    await assertDesktopBackupReadable(latest.path, {
      readWorkspace: async (dbPath) => {
        await new JsonStore(dbPath).read();
      }
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      backupSummary: desktopBackupSummary()
    };
  }

  await createDataBackup({ prefix: "safety-before-restore" });
  rmSync(targetDataDir, { recursive: true, force: true });
  cpSync(sourceDataDir, targetDataDir, {
    recursive: true,
    force: true,
    errorOnExist: false
  });
  if (targetSettingsPath && existsSync(sourceSettingsPath)) {
    cpSync(sourceSettingsPath, targetSettingsPath, {
      force: true,
      errorOnExist: false
    });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
    }, 1200);
  }

  return {
    ...actionResult(`Restored latest backup ${latest.name}. Reloading workspace...`),
    backupSummary: desktopBackupSummary()
  };
}

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
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("assini:desktop-shortcut-summary", async () => {
    try {
      return {
        ok: true,
        shortcutSummary: refreshDesktopBridgeShortcutSummary()
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("assini:desktop-diagnostics", async (_event, text) => {
    try {
      return await saveDesktopDiagnosticsReport(text);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("assini:desktop-action", async (_event, action) => {
    try {
      switch (action) {
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
          return { ok: false, message: "Unknown desktop action." };
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("assini:desktop-preferences", async (_event, patch) => {
    try {
      return await updateDesktopPreferences(patch);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        preferences: currentDesktopPreferences()
      };
    }
  });
}

function windowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readWindowState() {
  const fallback = { ...DEFAULT_WINDOW_BOUNDS, maximized: false };
  try {
    const parsed = JSON.parse(readFileSync(windowStatePath(), "utf8"));
    const width = Math.max(MIN_WINDOW_BOUNDS.width, Number.parseInt(parsed.width, 10));
    const height = Math.max(MIN_WINDOW_BOUNDS.height, Number.parseInt(parsed.height, 10));
    const bounds = {
      width: Number.isFinite(width) ? width : fallback.width,
      height: Number.isFinite(height) ? height : fallback.height,
      maximized: parsed.maximized === true
    };
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      bounds.x = parsed.x;
      bounds.y = parsed.y;
    }
    return ensureVisibleWindowBounds(bounds);
  } catch {
    return fallback;
  }
}

function ensureVisibleWindowBounds(bounds) {
  if (bounds.x == null || bounds.y == null) return bounds;
  const windowArea = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(MIN_WINDOW_BOUNDS.width, bounds.width),
    height: Math.max(MIN_WINDOW_BOUNDS.height, bounds.height)
  };
  const intersectsDisplay = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return windowArea.x < area.x + area.width
      && windowArea.x + windowArea.width > area.x
      && windowArea.y < area.y + area.height
      && windowArea.y + windowArea.height > area.y;
  });
  if (intersectsDisplay) return bounds;

  return {
    width: bounds.width,
    height: bounds.height,
    maximized: bounds.maximized
  };
}

function writeWindowState(window) {
  try {
    if (!window || window.isDestroyed()) return;
    const maximized = window.isMaximized();
    const normalBounds = typeof window.getNormalBounds === "function"
      ? window.getNormalBounds()
      : window.getBounds();
    const bounds = maximized ? normalBounds : window.getBounds();
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(windowStatePath(), JSON.stringify({
      height: bounds.height,
      maximized,
      width: bounds.width,
      x: bounds.x,
      y: bounds.y
    }, null, 2));
  } catch {
    // Window-state persistence is a convenience; never block shutdown on it.
  }
}

function applyWindowState(window, state) {
  if (state.maximized) {
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.maximize();
      }
    });
  }
}

async function resetWindowLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, message: "No desktop window is open." };
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.setSize(DEFAULT_WINDOW_BOUNDS.width, DEFAULT_WINDOW_BOUNDS.height);
  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();
  writeWindowState(mainWindow);

  return actionResult("Reset window layout.");
}

async function startApiServer() {
  const [
    { JsonStore },
    { createServer },
    { bootstrapRuntimeEnvironment },
    { resolveRuntimeDataDir, resolveRuntimeDbPath }
  ] = await Promise.all([
    import("@assini/db"),
    import(distUrl(path.join("apps", "api", "dist", "server.js"))),
    import(distUrl(path.join("apps", "api", "dist", "runtimeEnvLoader.js"))),
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
    allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173", "file://", "null"],
    logger: false
  });

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

function serializeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return { message: String(error) };
}

function createSmokeEventLog(webContents) {
  const events = [];
  const fatal = [];
  const add = (kind, payload) => {
    events.push({
      kind,
      ...payload
    });
    if (events.length > 50) {
      events.shift();
    }
  };

  webContents.on("console-message", (_event, level, message, line, sourceId) => {
    add("console", { level, line, message, sourceId });
  });
  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    const event = { errorCode, errorDescription, isMainFrame, validatedURL };
    add("did-fail-load", event);
    if (isMainFrame) {
      fatal.push(event);
    }
  });
  webContents.on("render-process-gone", (_event, details) => {
    const event = { details };
    add("render-process-gone", event);
    fatal.push(event);
  });
  webContents.on("unresponsive", () => {
    const event = { message: "Renderer became unresponsive." };
    add("unresponsive", event);
    fatal.push(event);
  });

  return { events, fatal };
}

function desktopSmokeScript() {
  return `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
      const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const textOf = (element) => normalize(element?.textContent ?? "");
      const selectors = {
        main: "main#main-content",
        appShell: ".app-shell"
      };
      const report = {
        createdLanguage: false,
        layoutFit: {},
        screens: {},
        controls: {},
        textSamples: [],
        tourShown: false,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };

      async function waitFor(label, predicate, timeoutMs = 20000) {
        const started = Date.now();
        let lastError = "";
        while (Date.now() - started < timeoutMs) {
          try {
            const value = predicate();
            if (value) return value;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
          await sleep(100);
        }
        throw new Error("Timed out waiting for " + label + (lastError ? ": " + lastError : ""));
      }

      function requireElement(selector, label, root = document) {
        const element = root.querySelector(selector);
        if (!element || !isVisible(element)) {
          throw new Error("Missing visible " + label + " (" + selector + ")");
        }
        return element;
      }

      function findButton(label, root = document) {
        const buttons = Array.from(root.querySelectorAll("button")).filter(isVisible);
        return buttons.find((button) => textOf(button) === label)
          ?? buttons.find((button) => textOf(button).includes(label))
          ?? null;
      }

      function clickButton(label, root = document) {
        const button = findButton(label, root);
        if (!button) {
          const seen = Array.from(root.querySelectorAll("button")).filter(isVisible).map(textOf).slice(0, 30).join(", ");
          throw new Error("Missing button " + label + ". Visible buttons: " + seen);
        }
        button.click();
        return button;
      }

      function sectionButton(label) {
        const nav = requireElement(".section-nav", "section navigation");
        const buttons = Array.from(nav.querySelectorAll("button")).filter(isVisible);
        const button = buttons.find((candidate) => textOf(candidate).includes(label));
        if (!button) {
          throw new Error("Missing section button " + label + ". Visible section buttons: " + buttons.map(textOf).join(", "));
        }
        return button;
      }

      function controlByLabel(label) {
        const labels = Array.from(document.querySelectorAll("label")).filter(isVisible);
        const labelElement = labels.find((candidate) => normalize(candidate.textContent) === label)
          ?? labels.find((candidate) => normalize(candidate.textContent).includes(label));
        if (!labelElement) {
          throw new Error("Missing label " + label + ". Visible labels: " + labels.map(textOf).slice(0, 40).join(", "));
        }
        if (labelElement.htmlFor) {
          const control = document.getElementById(labelElement.htmlFor);
          if (control) return control;
        }
        const nested = labelElement.querySelector("input, select, textarea");
        if (nested) return nested;
        throw new Error("Missing control for label " + label);
      }

      function setControlValue(label, value) {
        const control = controlByLabel(label);
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value");
        if (descriptor?.set) {
          descriptor.set.call(control, value);
        } else {
          control.value = value;
        }
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
        return control;
      }

      function requireText(label) {
        const text = document.body.innerText ?? "";
        if (!text.includes(label)) {
          throw new Error("Missing text " + label);
        }
        return true;
      }

      function requireRegion(label) {
        return requireElement("[aria-label=\\"" + label.replace(/"/g, "\\\\\\"") + "\\"]", "region " + label);
      }

      function controlMetrics(label) {
        try {
          const control = controlByLabel(label);
          const rect = control.getBoundingClientRect();
          return {
            height: Math.round(rect.height),
            label,
            tag: control.tagName.toLowerCase(),
            width: Math.round(rect.width)
          };
        } catch {
          return null;
        }
      }

      function gridColumnCount(selector) {
        const element = document.querySelector(selector);
        if (!element || !isVisible(element)) return 0;
        const columns = window.getComputedStyle(element).gridTemplateColumns;
        return columns.split(" ").filter(Boolean).length;
      }

      function visibleTextOverflow(selector) {
        return Array.from(document.querySelectorAll(selector))
          .filter(isVisible)
          .map((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: textOf(element).slice(0, 80)
          }))
          .filter((entry) => entry.scrollWidth - entry.clientWidth > 2)
          .slice(0, 10);
      }

      function desktopActionGroupMetrics() {
        return Array.from(document.querySelectorAll("[data-desktop-action-group]"))
          .filter(isVisible)
          .map((group) => {
            const rect = group.getBoundingClientRect();
            const buttons = Array.from(group.querySelectorAll("button"))
              .filter(isVisible)
              .map((button) => ({
                height: Math.round(button.getBoundingClientRect().height),
                label: textOf(button),
                width: Math.round(button.getBoundingClientRect().width),
                clientHeight: button.clientHeight,
                scrollHeight: button.scrollHeight,
                clientWidth: button.clientWidth,
                scrollWidth: button.scrollWidth
              }));
            return {
              buttonCount: buttons.length,
              clippedButtons: buttons
                .filter((button) => (
                  button.scrollWidth - button.clientWidth > 2
                  || button.scrollHeight - button.clientHeight > 2
                ))
                .map(({ clientHeight, clientWidth, label, scrollHeight, scrollWidth }) => ({
                  clientHeight,
                  clientWidth,
                  label,
                  scrollHeight,
                  scrollWidth
                })),
              group: group.getAttribute("data-desktop-action-group"),
              width: Math.round(rect.width)
            };
          });
      }

      function measureLayoutFit(screen) {
        const root = document.documentElement;
        const pageOverflowX = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0) - root.clientWidth;
        const controls = [
          "Interface language",
          "Discovered models",
          "Base URL",
          "Model",
          "Timeout",
          "Max tokens",
          "Save settings"
        ].map(controlMetrics).filter(Boolean);
        const fit = {
          controls,
          modelGridColumns: gridColumnCount(".model-grid"),
          noteTopicOverflow: visibleTextOverflow(".note-topic strong"),
          pageOverflowX,
          screen,
          sidebarBrandOverflow: visibleTextOverflow(".brand-copy strong, .brand-copy span"),
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };

        if (pageOverflowX > 1) {
          throw new Error(screen + " has horizontal overflow of " + pageOverflowX + "px.");
        }
        if (fit.sidebarBrandOverflow.length > 0) {
          throw new Error(screen + " sidebar brand text is clipped: " + JSON.stringify(fit.sidebarBrandOverflow));
        }
        if (fit.noteTopicOverflow.length > 0) {
          throw new Error(screen + " note topic text is clipped: " + JSON.stringify(fit.noteTopicOverflow));
        }
        if (screen === "Settings") {
          fit.desktopActionGroups = desktopActionGroupMetrics();
          const minimums = {
            "Interface language": 80,
            "Discovered models": 320,
            "Base URL": 240,
            "Model": 240,
            "Timeout": 120,
            "Max tokens": 120
          };
          const narrow = controls.filter((control) => minimums[control.label] && control.width < minimums[control.label]);
          if (narrow.length > 0) {
            throw new Error("Settings controls are too narrow: " + JSON.stringify(narrow));
          }
          if (fit.modelGridColumns > 1 && window.innerWidth <= 1040) {
            throw new Error("Settings model grid did not collapse at the minimum desktop width.");
          }
          if (fit.desktopActionGroups.length !== 5) {
            throw new Error("Settings desktop action groups did not render: " + JSON.stringify(fit.desktopActionGroups));
          }
          const clippedActionGroups = fit.desktopActionGroups.filter((group) => group.clippedButtons.length > 0);
          if (clippedActionGroups.length > 0) {
            throw new Error("Settings desktop action buttons are clipped: " + JSON.stringify(clippedActionGroups));
          }
        }

        return fit;
      }

      async function navigate(label, heading, expected) {
        sectionButton(label).click();
        await waitFor(label + " heading", () => Array.from(document.querySelectorAll("h1")).some((item) => textOf(item) === heading));
        for (const item of expected) {
          if (item.kind === "region") {
            await waitFor(item.label, () => requireRegion(item.label));
          } else if (item.kind === "button") {
            await waitFor("button " + item.label, () => findButton(item.label));
          } else if (item.kind === "label") {
            await waitFor("label " + item.label, () => controlByLabel(item.label));
          } else if (item.kind === "text") {
            await waitFor("text " + item.label, () => requireText(item.label));
          } else if (item.kind === "selector") {
            await waitFor("selector " + item.label, () => requireElement(item.selector, item.label));
          }
        }
        report.screens[label.toLowerCase()] = {
          heading,
          textLength: (document.body.innerText ?? "").length,
          buttons: Array.from(document.querySelectorAll("button")).filter(isVisible).map(textOf).slice(0, 20)
        };
        report.layoutFit[label.toLowerCase()] = measureLayoutFit(label);
      }

      await waitFor("rendered app shell", () => {
        if (document.querySelector(".full-page-status[role='alert']")) {
          throw new Error(document.body.innerText);
        }
        return document.querySelector(selectors.appShell) && document.querySelector(selectors.main);
      });
      await waitFor("desktop bridge", () => window.assiniDesktop?.apiBaseUrl && window.assiniDesktop?.authToken);

      const tourDialog = document.querySelector("[aria-label='Guided tour']");
      if (tourDialog) {
        report.tourShown = true;
        clickButton("Skip tour", tourDialog);
        await waitFor("tour dismissed", () => !document.querySelector("[aria-label='Guided tour']"));
      }

      if (!document.querySelector(".section-nav")) {
        clickButton("New language");
        await waitFor("create language form", () => document.querySelector("form[aria-label='Create language']"));
        setControlValue("Language name", "Bisaya Smoke");
        setControlValue("Description", "Temporary Bisaya workspace for desktop smoke verification.");
        setControlValue("Orthography", "Latin");
        setControlValue("Typology", "agglutinative");
        clickButton("Create language", document.querySelector("form[aria-label='Create language']"));
        await waitFor("created language workspace", () => document.body.innerText.includes("Bisaya Smoke / Start") && document.querySelector(".section-nav"));
        report.createdLanguage = true;
      }

      await navigate("Start", "Start", [
        { kind: "region", label: "Language overview" },
        { kind: "region", label: "Saved examples" },
        { kind: "text", label: "Read and search what you have" },
        { kind: "region", label: "Corpus passages" }
      ]);

      await navigate("Build", "Build", [
        { kind: "region", label: "Add material" },
        { kind: "region", label: "Registered sources" },
        { kind: "region", label: "Extraction draft queue" },
        { kind: "region", label: "Review queue" },
        { kind: "region", label: "Suggest a fix" }
      ]);

      await navigate("Practice", "Practice", [
        { kind: "region", label: "Practice exercises" },
        { kind: "region", label: "Practice next" },
        { kind: "region", label: "Exercise selector" },
        { kind: "region", label: "Exercise authoring" },
        { kind: "region", label: "Ask the model" },
        { kind: "button", label: "Start conversation" }
      ]);

      await navigate("Settings", "Settings", [
        { kind: "button", label: "Run System Eval" },
        { kind: "region", label: "Model connection" },
        { kind: "region", label: "LLM provider readiness" },
        { kind: "region", label: "Runtime model settings" },
        { kind: "region", label: "Desktop app tools" },
        { kind: "selector", label: "desktop app version", selector: "[data-desktop-info='version']" },
        { kind: "selector", label: "desktop app folder", selector: "[data-desktop-path='app']" },
        { kind: "selector", label: "desktop backups path", selector: "[data-desktop-path='backups']" },
        { kind: "selector", label: "desktop diagnostics path", selector: "[data-desktop-path='diagnostics']" },
        { kind: "selector", label: "desktop backup count", selector: "[data-desktop-backup-summary='count']" },
        { kind: "selector", label: "desktop shortcut status", selector: "[data-desktop-shortcut-summary='desktop']" },
        { kind: "selector", label: "Start Menu shortcut status", selector: "[data-desktop-shortcut-summary='start-menu']" },
        { kind: "region", label: "Quality checks" },
        { kind: "region", label: "Language rules and exports" },
        { kind: "label", label: "Discovered models" },
        { kind: "label", label: "Provider" },
        { kind: "label", label: "Base URL" },
        { kind: "label", label: "Model" },
        { kind: "label", label: "Timeout" },
        { kind: "label", label: "Max tokens" },
        { kind: "label", label: "Launch at sign-in" },
        { kind: "label", label: "Hide to tray on close" },
        { kind: "selector", label: "desktop recovery actions", selector: "[data-desktop-action-group='recovery']" },
        { kind: "selector", label: "desktop diagnostics actions", selector: "[data-desktop-action-group='diagnostics']" },
        { kind: "selector", label: "desktop folder actions", selector: "[data-desktop-action-group='folders']" },
        { kind: "selector", label: "desktop backup actions", selector: "[data-desktop-action-group='backups']" },
        { kind: "selector", label: "desktop shortcut actions", selector: "[data-desktop-action-group='shortcuts']" },
        { kind: "button", label: "Refresh models" },
        { kind: "button", label: "Reset window layout" },
        { kind: "button", label: "Copy diagnostics" },
        { kind: "button", label: "Save diagnostics report" },
        { kind: "button", label: "Open app folder" },
        { kind: "button", label: "Open diagnostics folder" },
        { kind: "button", label: "Create data backup" },
        { kind: "button", label: "Restore latest backup" },
        { kind: "button", label: "Open backups folder" },
        { kind: "button", label: "Open latest backup" },
        { kind: "button", label: "Prune old backups" },
        { kind: "button", label: "Set up app shortcuts" },
        { kind: "button", label: "Create desktop shortcut" },
        { kind: "button", label: "Create Start Menu shortcut" },
        { kind: "button", label: "Save settings" },
        { kind: "selector", label: "model scan status", selector: ".model-scan-meta" }
      ]);

      clickButton("Copy diagnostics");
      await waitFor("diagnostics copied", () => requireText("Diagnostics copied to clipboard."));
      report.controls.desktopDiagnostics = {
        copied: true
      };

      clickButton("Save diagnostics report");
      await waitFor("diagnostics report saved", () => requireText("Saved diagnostics report at"));
      report.controls.desktopDiagnostics.saved = true;

      clickButton("Create data backup");
      await waitFor("desktop backup created", () => requireText("Created backup at"));
      await waitFor("desktop backup summary updated", () => requireText("1 backups"));
      await waitFor("desktop latest backup visible", () => requireElement("[data-desktop-backup-summary='latest']", "desktop latest backup"));
      report.controls.desktopBackup = {
        created: true,
        summaryUpdated: true
      };
      report.controls.desktopShortcuts = {
        desktopVisible: Boolean(requireElement("[data-desktop-shortcut-summary='desktop']", "desktop shortcut status")),
        startMenuVisible: Boolean(requireElement("[data-desktop-shortcut-summary='start-menu']", "Start Menu shortcut status"))
      };

      report.controls.desktopBridge = {
        apiBaseUrl: window.assiniDesktop.apiBaseUrl,
        appFolder: Boolean(window.assiniDesktop.appFolder),
        appPath: Boolean(window.assiniDesktop.appPath),
        appVersion: Boolean(window.assiniDesktop.appVersion),
        backupSummary: Boolean(window.assiniDesktop.backupSummary),
        backupsDir: Boolean(window.assiniDesktop.backupsDir),
        dataDir: Boolean(window.assiniDesktop.dataDir),
        diagnosticsDir: Boolean(window.assiniDesktop.diagnosticsDir),
        settingsPath: Boolean(window.assiniDesktop.settingsPath),
        isPackaged: Boolean(window.assiniDesktop.isPackaged),
        shortcutSummary: Boolean(window.assiniDesktop.shortcutSummary),
        openAppFolder: typeof window.assiniDesktop.openAppFolder === "function",
        openDataFolder: typeof window.assiniDesktop.openDataFolder === "function",
        openSettingsFolder: typeof window.assiniDesktop.openSettingsFolder === "function",
        openDiagnosticsFolder: typeof window.assiniDesktop.openDiagnosticsFolder === "function",
        openBackupsFolder: typeof window.assiniDesktop.openBackupsFolder === "function",
        openLatestBackupFolder: typeof window.assiniDesktop.openLatestBackupFolder === "function",
        pruneOldDataBackups: typeof window.assiniDesktop.pruneOldDataBackups === "function",
        createAppShortcuts: typeof window.assiniDesktop.createAppShortcuts === "function",
        createDataBackup: typeof window.assiniDesktop.createDataBackup === "function",
        createDesktopShortcut: typeof window.assiniDesktop.createDesktopShortcut === "function",
        createStartMenuShortcut: typeof window.assiniDesktop.createStartMenuShortcut === "function",
        restoreLatestDataBackup: typeof window.assiniDesktop.restoreLatestDataBackup === "function",
        resetWindowLayout: typeof window.assiniDesktop.resetWindowLayout === "function",
        desktopPreferences: Boolean(window.assiniDesktop.desktopPreferences),
        refreshShortcutSummary: typeof window.assiniDesktop.refreshShortcutSummary === "function",
        saveDiagnosticsReport: typeof window.assiniDesktop.saveDiagnosticsReport === "function",
        setDesktopPreferences: typeof window.assiniDesktop.setDesktopPreferences === "function"
      };
      report.controls.providerForm = {
        discoveredModelsDisabled: controlByLabel("Discovered models").disabled,
        providerValue: controlByLabel("Provider").value,
        baseUrlPlaceholder: controlByLabel("Base URL").getAttribute("placeholder"),
        modelPlaceholder: controlByLabel("Model").getAttribute("placeholder"),
        timeoutValue: controlByLabel("Timeout").value,
        maxTokensValue: controlByLabel("Max tokens").value
      };
      report.textSamples = Array.from(document.querySelectorAll("h1, h2, h3, button"))
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean)
        .slice(0, 50);
      report.bodyTextLength = (document.body.innerText ?? "").length;
      report.activeHeading = textOf(document.querySelector("h1"));
      return report;
    })()
  `;
}

async function runDesktopSmoke(api, eventLog) {
  mainWindow.setSize(MIN_WINDOW_BOUNDS.width, MIN_WINDOW_BOUNDS.height);
  mainWindow.center();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const bridge = await mainWindow.webContents.executeJavaScript(`
    Promise.all([
      Boolean(window.assiniDesktop && window.assiniDesktop.apiBaseUrl && window.assiniDesktop.authToken),
      Boolean(window.assiniDesktop && window.assiniDesktop.dataDir && window.assiniDesktop.settingsPath),
      Boolean(window.assiniDesktop && window.assiniDesktop.openDataFolder && window.assiniDesktop.openSettingsFolder),
      fetch("/api/health").then((response) => ({ ok: response.ok, status: response.status }))
    ])
  `);
  if (!Array.isArray(bridge) || bridge.slice(0, 3).some((item) => item !== true) || bridge[3]?.ok !== true) {
    throw new Error("Desktop preload or API health check failed.");
  }

  const ui = await mainWindow.webContents.executeJavaScript(desktopSmokeScript(), true);
  const image = await mainWindow.webContents.capturePage();
  const visual = analyzeSmokeImage(image);
  const screenshotPath = process.env.ASSINI_DESKTOP_SMOKE_SCREENSHOT;
  if (screenshotPath) {
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    writeFileSync(screenshotPath, image.toPNG());
  }

  if (eventLog.fatal.length > 0) {
    throw new Error(`Renderer reported fatal events: ${JSON.stringify(eventLog.fatal)}`);
  }

  const report = {
    ok: true,
    apiBaseUrl: api.baseUrl,
    bridge,
    dataDir: desktopRuntime?.dataDir,
    dbPath: desktopRuntime?.dbPath,
    backupsDir: desktopRuntime?.backupsDir,
    isPackaged: app.isPackaged,
    rendererEvents: eventLog.events,
    settingsPath: desktopRuntime?.settingsPath,
    ui,
    userDataDir: desktopRuntime?.userDataDir,
    visual
  };
  const reportPath = process.env.ASSINI_DESKTOP_SMOKE_REPORT;
  if (reportPath) {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
}

function analyzeSmokeImage(image) {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const pixelCount = Math.floor(bitmap.length / 4);
  const stride = Math.max(1, Math.floor(pixelCount / SMOKE_SAMPLE_LIMIT));
  let sampled = 0;
  let nonWhite = 0;
  let transparent = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    const first = bitmap[offset] ?? 255;
    const second = bitmap[offset + 1] ?? 255;
    const third = bitmap[offset + 2] ?? 255;
    const alpha = bitmap[offset + 3] ?? 255;
    sampled += 1;
    if (alpha < 10) {
      transparent += 1;
      continue;
    }
    if (first < 245 || second < 245 || third < 245) {
      nonWhite += 1;
    }
  }

  const nonWhiteRatio = sampled > 0 ? nonWhite / sampled : 0;
  const visual = {
    height: size.height,
    nonWhiteRatio,
    nonWhiteSampledPixels: nonWhite,
    sampledPixels: sampled,
    transparentSampledPixels: transparent,
    width: size.width
  };
  if (size.width < 800 || size.height < 600) {
    throw new Error(`Desktop smoke captured an unexpectedly small window: ${size.width}x${size.height}.`);
  }
  if (sampled === 0 || nonWhiteRatio < SMOKE_MIN_NON_WHITE_RATIO) {
    throw new Error(`Desktop smoke captured a blank or near-white window: ${JSON.stringify(visual)}.`);
  }

  return visual;
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
    ...(savedWindowState.x != null && savedWindowState.y != null ? { x: savedWindowState.x, y: savedWindowState.y } : {}),
    show: false,
    title: "AssiniLang",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: false
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
        await runDesktopSmoke(api, smokeEventLog);
        app.exit(0);
      } catch (error) {
        console.error(error);
        const reportPath = process.env.ASSINI_DESKTOP_SMOKE_REPORT;
        if (reportPath) {
          mkdirSync(path.dirname(reportPath), { recursive: true });
          writeFileSync(reportPath, JSON.stringify({
            ok: false,
            apiBaseUrl: api.baseUrl,
            backupsDir: desktopRuntime?.backupsDir,
            dataDir: desktopRuntime?.dataDir,
            error: serializeError(error),
            isPackaged: app.isPackaged,
            rendererEvents: smokeEventLog?.events ?? [],
            settingsPath: desktopRuntime?.settingsPath,
            userDataDir: desktopRuntime?.userDataDir
          }, null, 2));
        }
        app.exit(1);
      }
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadFile(indexPath);
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
