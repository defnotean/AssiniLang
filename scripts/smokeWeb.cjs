const { spawn } = require("node:child_process");
const { existsSync, rmSync } = require("node:fs");
const net = require("node:net");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { parseSmokeReport } = require("./lib/smokeWebChecks.cjs");

const repoRoot = path.resolve(__dirname, "..");
const STARTUP_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 20_000;
const nodeExecutable = process.env.npm_node_execpath || (process.platform === "win32" ? "node.exe" : "node");
let smokeDbPath;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHttp(url, timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Web preview did not become ready at ${url}: ${lastError?.message ?? "timeout"}`);
}

async function findAvailablePort(preferredPort) {
  if (preferredPort) return String(preferredPort);
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return String(port);
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => resolve();
    child.once("exit", finish);
    if (process.platform === "win32") {
      child.kill();
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      killer.once("exit", () => {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      });
    } else {
      child.kill("SIGTERM");
    }
    setTimeout(finish, 5_000).unref();
  });
}

async function removeTempFile(filePath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(filePath, { force: true });
      if (!existsSync(filePath)) return;
    } catch {
      // Windows can briefly retain a just-exited file handle.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Could not remove temporary smoke file: ${filePath}`);
}

async function startApi(port) {
  const apiPath = path.join(repoRoot, "apps", "api", "dist", "index.js");
  assert(existsSync(apiPath), "Built API was not found. Run npm run build first.");
  const dbPath = path.join(tmpdir(), `assini-web-smoke-${process.pid}-${port}.json`);
  smokeDbPath = dbPath;
  const child = spawn(nodeExecutable, [apiPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ASSINI_DB_PATH: dbPath,
      ASSINI_DEV_AUTH_TOKEN: "web-smoke-token",
      ASSINI_ENABLE_PROTOTYPE_AUTH: "true",
      HOST: "127.0.0.1",
      PORT: port
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[web-api] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[web-api] ${chunk}`));
  return { child, dbPath, url: `http://127.0.0.1:${port}` };
}

function startWebServer(url, apiUrl) {
  const parsed = new URL(url);
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  assert(
    existsSync(path.join(repoRoot, "apps", "web", "dist", "index.html")),
    "Built web app was not found. Run npm run build first."
  );
  assert(existsSync(viteBin), `Vite CLI was not found at ${viteBin}.`);
  const child = spawn(nodeExecutable, [viteBin, "preview", "--host", parsed.hostname, "--port", parsed.port], {
    cwd: path.join(repoRoot, "apps", "web"),
    env: {
      ...process.env,
      ASSINI_API_HOST: "127.0.0.1",
      ASSINI_API_PORT: new URL(apiUrl).port
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[web-preview] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[web-preview] ${chunk}`));
  return child;
}

async function renderSmoke(url) {
  const fatalEvents = [];
  const consoleErrors = [];
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(repoRoot, "scripts", "smokeWebPreload.cjs")
    }
  });
  const { webContents } = window;
  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) fatalEvents.push({ errorCode, errorDescription, validatedURL });
  });
  webContents.on("render-process-gone", (_event, details) => fatalEvents.push({ details }));
  webContents.on("console-message", (details) => {
    if (details.level === "error") {
      consoleErrors.push({
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId
      });
    }
  });

  try {
    await webContents.loadURL(url);
    const report = await webContents.executeJavaScript(
      `
      new Promise((resolve) => {
        const deadline = Date.now() + ${RENDER_TIMEOUT_MS};
        const snapshot = () => ({
          bodyTextLength: (document.body?.innerText ?? "").trim().length,
          headingCount: document.querySelectorAll("h1, h2, h3").length,
          rootChildCount: document.querySelector("#root")?.children.length ?? 0,
          title: document.title
        });
        const poll = () => {
          const report = snapshot();
          const rendered = report.bodyTextLength >= 40 && report.headingCount > 0 && report.rootChildCount > 0;
          if (rendered || Date.now() >= deadline) {
            resolve(report);
            return;
          }
          setTimeout(poll, 100);
        };
        poll();
      })
    `,
      true
    );
    const screenshotPath = process.env.ASSINI_WEB_SMOKE_SCREENSHOT;
    if (screenshotPath)
      await webContents.capturePage().then((image) => require("node:fs").writeFileSync(screenshotPath, image.toPNG()));
    const complete = parseSmokeReport({ ...report, consoleErrors, fatalEvents });
    return complete;
  } finally {
    window.destroy();
  }
}

async function main() {
  const explicitUrl = process.env.ASSINI_WEB_SMOKE_URL;
  const webPort = explicitUrl ? new URL(explicitUrl).port : await findAvailablePort(process.env.ASSINI_WEB_SMOKE_PORT);
  const url = explicitUrl || `http://${process.env.ASSINI_WEB_SMOKE_HOST || "127.0.0.1"}:${webPort}`;
  const apiPort = await findAvailablePort(process.env.ASSINI_WEB_SMOKE_API_PORT);
  const api = process.env.ASSINI_WEB_SMOKE_SKIP_SERVER === "1" ? null : await startApi(apiPort);
  const webServer = process.env.ASSINI_WEB_SMOKE_SKIP_SERVER === "1" ? null : startWebServer(url, api.url);
  try {
    if (api) await waitForHttp(`${api.url}/health`);
    if (api) {
      process.env.ASSINI_WEB_SMOKE_API_TOKEN = "web-smoke-token";
    }
    await waitForHttp(url);
    const report = await renderSmoke(url);
    console.log(`[web-smoke] passed: ${report.title}, ${report.bodyTextLength} visible characters`);
  } finally {
    await stopChild(webServer);
    await stopChild(api?.child);
    if (api?.dbPath) await removeTempFile(api.dbPath);
  }
}

// Keep Electron alive after the hidden smoke window closes so cleanup and the
// final result are guaranteed to finish before the process exits.
app.on("window-all-closed", () => {});

app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(`[web-smoke] failed: ${error instanceof Error ? error.stack : String(error)}`);
    app.exit(1);
  });

app.on("will-quit", () => {
  if (smokeDbPath) rmSync(smokeDbPath, { force: true });
});
