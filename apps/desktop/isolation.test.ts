import { readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const mainSource = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const desktopSmokeSource = readFileSync(new URL("./desktopSmoke.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("./preload.cjs", import.meta.url), "utf8");
const webStylesSource = readFileSync(new URL("../web/src/styles.css", import.meta.url), "utf8");

function extractNamedFunction(name: string): string {
  const start = mainSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function not found in main.cjs: ${name}`);
  const bodyStart = mainSource.indexOf("{", start);
  let depth = 0;
  for (let cursor = bodyStart; cursor < mainSource.length; cursor += 1) {
    if (mainSource[cursor] === "{") depth += 1;
    if (mainSource[cursor] === "}") depth -= 1;
    if (depth === 0) return mainSource.slice(start, cursor + 1);
  }
  throw new Error(`Function body did not close in main.cjs: ${name}`);
}

function loadDesktopUiPathResolver(): (requestPath: unknown, root: string) => string | null {
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(
    `${extractNamedFunction("isStrictChildPath")}\n${extractNamedFunction("resolveDesktopUiAssetPath")}\n` +
      "module.exports.resolveDesktopUiAssetPath = resolveDesktopUiAssetPath;",
    { decodeURIComponent, module, path, realpathSync, statSync }
  );
  return module.exports.resolveDesktopUiAssetPath as (requestPath: unknown, root: string) => string | null;
}

function loadExternalNavigationResolver(): (value: unknown) => string | null {
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(
    `${extractNamedFunction("resolveExternalNavigationUrl")}\n` +
      "module.exports.resolveExternalNavigationUrl = resolveExternalNavigationUrl;",
    { module, URL }
  );
  return module.exports.resolveExternalNavigationUrl as (value: unknown) => string | null;
}

function executePreload() {
  let exposedBridge: Record<string, unknown> | undefined;
  const exposeInMainWorld = vi.fn((name: string, bridge: Record<string, unknown>) => {
    expect(name).toBe("assiniDesktop");
    exposedBridge = bridge;
  });
  const ipcRenderer = {
    invoke: vi.fn(async () => ({ ok: true })),
    sendSync: vi.fn(() => ({
      apiBaseUrl: "http://127.0.0.1:43123",
      appFolder: "C:\\AssiniLang",
      appPath: "C:\\AssiniLang\\AssiniLang.exe",
      appVersion: "0.1.0",
      authToken: "desktop-token",
      backupSummary: { count: 0 },
      backupsDir: "C:\\AssiniLang\\backups",
      dataDir: "C:\\AssiniLang\\data",
      desktopPreferences: {
        hideToTray: false,
        hideToTraySupported: true,
        launchAtLogin: false,
        launchAtLoginSupported: true
      },
      diagnosticsDir: "C:\\AssiniLang\\diagnostics",
      isPackaged: true,
      settingsPath: "C:\\AssiniLang\\.env",
      shortcutSummary: { desktopExists: false, startMenuExists: false }
    }))
  };

  vm.runInNewContext(preloadSource, {
    require: (specifier: string) => {
      if (specifier === "electron") {
        return { contextBridge: { exposeInMainWorld }, ipcRenderer };
      }
      throw new Error(`Unexpected preload require: ${specifier}`);
    }
  });

  if (!exposedBridge) throw new Error("Preload did not expose the desktop bridge.");
  return { bridge: exposedBridge, exposeInMainWorld, ipcRenderer };
}

describe("desktop context isolation", () => {
  it("enables isolation while keeping renderer Node integration disabled", () => {
    const webPreferences = mainSource.match(/webPreferences:\s*\{([\s\S]*?)\n\s*\}/)?.[1];

    expect(webPreferences).toBeDefined();
    expect(webPreferences).toMatch(/contextIsolation:\s*true/);
    expect(webPreferences).toMatch(/nodeIntegration:\s*false/);
    expect(webPreferences).toMatch(/sandbox:\s*true/);
  });

  it("exposes named operations through contextBridge without mutating the isolated window", async () => {
    expect(preloadSource).toContain('contextBridge.exposeInMainWorld("assiniDesktop", assiniDesktop)');
    expect(preloadSource).not.toMatch(/window\.assiniDesktop\s*=/);
    expect(preloadSource).not.toMatch(/window\.fetch\s*=/);

    const { bridge, exposeInMainWorld, ipcRenderer } = executePreload();
    expect(exposeInMainWorld).toHaveBeenCalledOnce();
    expect(bridge).not.toHaveProperty("invoke");
    expect(bridge).not.toHaveProperty("ipcRenderer");

    await (bridge.openDataFolder as () => Promise<unknown>)();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("assini:desktop-action", "openDataFolder");
  });

  it("filters bridge arguments before they cross IPC", async () => {
    const { bridge, ipcRenderer } = executePreload();

    await (bridge.setDesktopPreferences as (patch: unknown) => Promise<unknown>)({
      hideToTray: true,
      ignored: "value"
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("assini:desktop-preferences", { hideToTray: true });

    const invalidPreferences = await (bridge.setDesktopPreferences as (patch: unknown) => Promise<unknown>)({
      hideToTray: "yes"
    });
    expect(invalidPreferences).toMatchObject({
      ok: false,
      code: "DESKTOP_INVALID_PREFERENCES_PATCH"
    });

    const invalidDiagnostics = await (bridge.saveDiagnosticsReport as (text: unknown) => Promise<unknown>)({});
    expect(invalidDiagnostics).toMatchObject({
      ok: false,
      code: "DESKTOP_INVALID_DIAGNOSTICS_TEXT"
    });
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
  });

  it("opens only credential-free http and https URLs outside the app", () => {
    const resolveExternalUrl = loadExternalNavigationResolver();

    expect(resolveExternalUrl("https://example.test/docs?q=1#start")).toBe("https://example.test/docs?q=1#start");
    expect(resolveExternalUrl("http://127.0.0.1:8080/status")).toBe("http://127.0.0.1:8080/status");
    for (const forbiddenUrl of [
      "file:///C:/Windows/System32/calc.exe",
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "mailto:person@example.test",
      "https://user:secret@example.test/",
      "not a url"
    ]) {
      expect(resolveExternalUrl(forbiddenUrl), forbiddenUrl).toBeNull();
    }

    const handlerSource = mainSource.slice(
      mainSource.indexOf("mainWindow.webContents.setWindowOpenHandler"),
      mainSource.indexOf("await mainWindow.loadURL")
    );
    expect(handlerSource).toContain("resolveExternalNavigationUrl(url)");
    expect(handlerSource).toMatch(/if \(externalUrl\)[\s\S]*shell\.openExternal\(externalUrl\)/);
    expect(handlerSource).toContain('return { action: "deny" }');
    expect(handlerSource).not.toContain("shell.openExternal(url)");
  });
});

describe("desktop UI static route", () => {
  it("confines decoded paths to regular files beneath the built web root", () => {
    const resolveAsset = loadDesktopUiPathResolver();
    const desktopUiRoot = realpathSync(new URL("../web/dist", import.meta.url));
    const assetName = path.basename(
      readFileSync(path.join(desktopUiRoot, "index.html"), "utf8").match(/\.\/assets\/([^\"]+\.js)/)?.[1] ?? ""
    );

    expect(resolveAsset("index.html", desktopUiRoot)).toBe(path.join(desktopUiRoot, "index.html"));
    expect(resolveAsset(`assets/${assetName}`, desktopUiRoot)).toBe(path.join(desktopUiRoot, "assets", assetName));
    expect(resolveAsset("assets", desktopUiRoot)).toBeNull();

    for (const forbiddenPath of [
      "../main.cjs",
      "%2e%2e/main.cjs",
      "%252e%252e%252fmain.cjs",
      "assets\\..\\index.html",
      "/index.html",
      "assets//index.js",
      "C:/Windows/System32/config"
    ]) {
      expect(resolveAsset(forbiddenPath, desktopUiRoot), forbiddenPath).toBeNull();
    }
  });

  it("registers a read-only same-origin route before listen with restrictive response headers", () => {
    const startApi = mainSource.slice(
      mainSource.indexOf("async function startApiServer"),
      mainSource.indexOf("async function createMainWindow")
    );
    const createWindow = mainSource.slice(
      mainSource.indexOf("async function createMainWindow"),
      mainSource.indexOf("async function boot")
    );

    expect(mainSource).toContain("server.get(`${DESKTOP_UI_ROUTE_PREFIX}/*`");
    expect(mainSource).not.toContain("server.post(`${DESKTOP_UI_ROUTE_PREFIX}/*`");
    expect(mainSource).toContain('"Cache-Control": "no-store"');
    expect(mainSource).toContain('"Content-Security-Policy"');
    expect(mainSource).toContain("\"font-src 'self'\"");
    expect(mainSource).not.toContain("fonts.googleapis.com");
    expect(mainSource).not.toContain("fonts.gstatic.com");
    expect(webStylesSource).not.toMatch(/@import\s+url\(["']?https?:\/\//i);
    expect(mainSource).toContain('"X-Content-Type-Options": "nosniff"');
    expect(mainSource).toContain("realpathSync(candidatePath)");
    expect(mainSource).toContain("statSync(resolvedPath).isFile()");
    expect(startApi).not.toContain('"file://"');
    expect(startApi).not.toContain('"null"');
    expect(startApi.indexOf('applyLoopbackPrivateUrlDefault(process.env, "127.0.0.1")')).toBeLessThan(
      startApi.indexOf("createServer({")
    );
    expect(startApi.indexOf("registerDesktopUiRoute(server)")).toBeLessThan(startApi.indexOf("server.listen"));
    expect(createWindow).toContain("mainWindow.loadURL(`${api.baseUrl}${DESKTOP_UI_ROUTE_PREFIX}/index.html`)");
    expect(createWindow).not.toContain("mainWindow.loadFile(");
  });

  it("adds desktop smoke probes for route headers, traversal, directories, writes, and same-origin loading", () => {
    expect(mainSource).toContain('require("./desktopSmoke.cjs")');
    expect(desktopSmokeSource).toContain("async function verifyDesktopUiRoute(server, desktopUiRoutePrefix)");
    expect(desktopSmokeSource).toContain("%252e%252e%252fmain.cjs");
    expect(desktopSmokeSource).toContain('method: "POST", url: `${desktopUiRoutePrefix}/index.html`');
    expect(desktopSmokeSource).toContain("window.location.origin === new URL(window.assiniDesktop.apiBaseUrl).origin");
    expect(desktopSmokeSource).toContain('sidebarBrandOverflow: visibleTextOverflow(".brand-copy strong")');
    expect(desktopSmokeSource).not.toContain('visibleTextOverflow(".brand-copy strong, .brand-copy span")');
    expect(desktopSmokeSource).toContain('webContents.on("console-message", (details) =>');
    expect(desktopSmokeSource).toContain("level: details.level");
    expect(desktopSmokeSource).toContain("line: details.lineNumber");
    expect(desktopSmokeSource).toContain("message: details.message");
    expect(desktopSmokeSource).toContain("sourceId: details.sourceId");
  });
});
