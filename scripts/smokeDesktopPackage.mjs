import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repoRoot, "dist-desktop");
const packageRoot = join(outputRoot, "AssiniLang-win32-x64");
const executablePath = join(packageRoot, "AssiniLang.exe");
const defaultReportPath = join(outputRoot, "desktop-smoke-report.json");
const defaultScreenshotPath = join(outputRoot, "desktop-smoke.png");
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_SCREENSHOT_BYTES = 10_000;
const MIN_NON_WHITE_RATIO = 0.01;

function parseTimeoutMs(argv = process.argv.slice(2)) {
  const timeoutArg = argv.find((arg) => arg.startsWith("--timeout-ms="));
  if (!timeoutArg) return DEFAULT_TIMEOUT_MS;
  const value = Number.parseInt(timeoutArg.slice("--timeout-ms=".length), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  return value;
}

async function assertFileExists(path, label) {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`${label} was not found at ${path}. Run npm.cmd run desktop:package first.`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateSmokeReport(report) {
  assert(report && typeof report === "object", "Desktop smoke report is not an object.");
  assert(report.ok === true, `Desktop smoke did not pass: ${report.error?.message ?? "unknown failure"}`);
  assert(report.isPackaged === true, "Desktop smoke did not run against a packaged app.");
  assert(Array.isArray(report.bridge), "Desktop bridge checks are missing.");
  assert(report.bridge[0] === true && report.bridge[1] === true && report.bridge[2] === true, "Desktop bridge preload checks failed.");
  assert(report.bridge[3]?.ok === true, "Desktop API health check failed.");

  const screens = report.ui?.screens ?? {};
  for (const screen of ["start", "build", "practice", "settings"]) {
    assert(screens[screen]?.heading, `Desktop smoke did not verify the ${screen} screen.`);
    assert((screens[screen].textLength ?? 0) > 0, `Desktop smoke found no visible text on the ${screen} screen.`);
  }

  const layoutFit = report.ui?.layoutFit ?? {};
  for (const screen of ["start", "build", "practice", "settings"]) {
    assert(layoutFit[screen], `Desktop smoke did not capture layout fit for the ${screen} screen.`);
    assert((layoutFit[screen].pageOverflowX ?? 999) <= 1, `${screen} screen has horizontal overflow.`);
    assert((layoutFit[screen].sidebarBrandOverflow?.length ?? 999) === 0, `${screen} screen clips sidebar brand text.`);
    assert((layoutFit[screen].noteTopicOverflow?.length ?? 999) === 0, `${screen} screen clips note topic text.`);
  }
  const settingsLayout = layoutFit.settings ?? {};
  assert((settingsLayout.modelGridColumns ?? 0) === 1, "Settings model grid did not collapse at the packaged minimum width.");
  const settingControls = new Map((settingsLayout.controls ?? []).map((control) => [control.label, control.width]));
  assert((settingControls.get("Interface language") ?? 0) >= 80, "Interface language control is too narrow in desktop smoke.");
  assert((settingControls.get("Discovered models") ?? 0) >= 320, "Discovered models control is too narrow in desktop smoke.");
  assert((settingControls.get("Base URL") ?? 0) >= 240, "Base URL control is too narrow in desktop smoke.");
  assert((settingControls.get("Model") ?? 0) >= 240, "Model control is too narrow in desktop smoke.");
  assert((settingControls.get("Timeout") ?? 0) >= 120, "Timeout control is too narrow in desktop smoke.");
  assert((settingControls.get("Max tokens") ?? 0) >= 120, "Max tokens control is too narrow in desktop smoke.");
  assert(settingsLayout.desktopActionGroups?.length === 5, "Desktop action groups did not render in desktop smoke.");
  for (const group of settingsLayout.desktopActionGroups ?? []) {
    assert((group.buttonCount ?? 0) > 0, `Desktop action group ${group.group ?? "unknown"} has no buttons.`);
    assert((group.clippedButtons?.length ?? 0) === 0, `Desktop action group ${group.group ?? "unknown"} has clipped buttons.`);
  }

  const bridge = report.ui?.controls?.desktopBridge ?? {};
  assert(bridge.apiBaseUrl, "Desktop bridge did not expose an API base URL.");
  assert(bridge.appFolder === true, "Desktop bridge did not expose the app folder.");
  assert(bridge.appPath === true, "Desktop bridge did not expose the app executable path.");
  assert(bridge.appVersion === true, "Desktop bridge did not expose the app version.");
  assert(bridge.backupSummary === true, "Desktop bridge did not expose the backup summary.");
  assert(bridge.backupsDir === true, "Desktop bridge did not expose the backups directory.");
  assert(bridge.dataDir === true, "Desktop bridge did not expose the data directory.");
  assert(bridge.diagnosticsDir === true, "Desktop bridge did not expose the diagnostics directory.");
  assert(bridge.settingsPath === true, "Desktop bridge did not expose the settings path.");
  assert(bridge.shortcutSummary === true, "Desktop bridge did not expose the shortcut summary.");
  assert(bridge.openAppFolder === true, "Desktop bridge did not expose Open app folder.");
  assert(bridge.openDataFolder === true, "Desktop bridge did not expose Open data folder.");
  assert(bridge.openSettingsFolder === true, "Desktop bridge did not expose Open settings folder.");
  assert(bridge.openDiagnosticsFolder === true, "Desktop bridge did not expose Open diagnostics folder.");
  assert(bridge.openBackupsFolder === true, "Desktop bridge did not expose Open backups folder.");
  assert(bridge.openLatestBackupFolder === true, "Desktop bridge did not expose Open latest backup.");
  assert(bridge.pruneOldDataBackups === true, "Desktop bridge did not expose backup pruning.");
  assert(bridge.createAppShortcuts === true, "Desktop bridge did not expose one-click shortcut setup.");
  assert(bridge.createDataBackup === true, "Desktop bridge did not expose data backup creation.");
  assert(bridge.createDesktopShortcut === true, "Desktop bridge did not expose shortcut creation.");
  assert(bridge.createStartMenuShortcut === true, "Desktop bridge did not expose Start Menu shortcut creation.");
  assert(bridge.restoreLatestDataBackup === true, "Desktop bridge did not expose data backup restore.");
  assert(bridge.resetWindowLayout === true, "Desktop bridge did not expose window layout reset.");
  assert(bridge.desktopPreferences === true, "Desktop bridge did not expose desktop preferences.");
  assert(bridge.refreshShortcutSummary === true, "Desktop bridge did not expose shortcut summary refresh.");
  assert(bridge.saveDiagnosticsReport === true, "Desktop bridge did not expose diagnostics report saving.");
  assert(bridge.setDesktopPreferences === true, "Desktop bridge did not expose desktop preference updates.");

  const desktopBackup = report.ui?.controls?.desktopBackup ?? {};
  assert(desktopBackup.created === true, "Desktop smoke did not create a desktop data backup.");
  assert(desktopBackup.summaryUpdated === true, "Desktop smoke did not update the desktop backup summary.");

  const desktopDiagnostics = report.ui?.controls?.desktopDiagnostics ?? {};
  assert(desktopDiagnostics.copied === true, "Desktop smoke did not copy desktop diagnostics.");
  assert(desktopDiagnostics.saved === true, "Desktop smoke did not save a desktop diagnostics report.");

  const desktopShortcuts = report.ui?.controls?.desktopShortcuts ?? {};
  assert(desktopShortcuts.desktopVisible === true, "Desktop smoke did not render desktop shortcut status.");
  assert(desktopShortcuts.startMenuVisible === true, "Desktop smoke did not render Start Menu shortcut status.");

  const providerForm = report.ui?.controls?.providerForm ?? {};
  assert(typeof providerForm.providerValue === "string", "Provider form value was not captured.");
  assert(providerForm.baseUrlPlaceholder === "http://127.0.0.1:11434/v1", "Provider base URL placeholder changed unexpectedly.");
  assert(providerForm.modelPlaceholder === "irene-fusion", "Provider model placeholder changed unexpectedly.");
  assert(Number.parseInt(providerForm.timeoutValue, 10) > 0, "Provider timeout value is invalid.");
  assert(Number.parseInt(providerForm.maxTokensValue, 10) > 0, "Provider max token value is invalid.");

  const visual = report.visual ?? {};
  assert((visual.width ?? 0) >= 800 && (visual.height ?? 0) >= 600, "Desktop smoke screenshot is too small.");
  assert((visual.nonWhiteRatio ?? 0) >= MIN_NON_WHITE_RATIO, "Desktop smoke screenshot appears blank or near-white.");

  return {
    apiBaseUrl: report.apiBaseUrl,
    createdLanguage: Boolean(report.ui?.createdLanguage),
    dataDir: report.dataDir,
    isPackaged: report.isPackaged,
    layoutViewport: `${settingsLayout.viewport?.width ?? "unknown"}x${settingsLayout.viewport?.height ?? "unknown"}`,
    screens: Object.keys(screens),
    screenshotPixels: `${visual.width}x${visual.height}`,
    nonWhiteRatio: visual.nonWhiteRatio
  };
}

async function waitForReport(reportPath, child, timeoutMs) {
  const started = Date.now();
  let childExit;
  child.once("exit", (code, signal) => {
    childExit = { code, signal };
  });

  while (Date.now() - started < timeoutMs) {
    try {
      await access(reportPath, constants.F_OK);
      return;
    } catch {
      if (childExit && childExit.code !== 0) {
        throw new Error(`AssiniLang.exe exited before writing a smoke report (${childExit.signal ?? `exit code ${childExit.code}`}).`);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${reportPath}.`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function killProcessTree(pid) {
  if (!pid || process.platform !== "win32") return;
  await new Promise((resolvePromise) => {
    const child = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    child.once("exit", resolvePromise);
    child.once("error", resolvePromise);
  });
}

export async function runDesktopPackageSmoke({
  exePath = executablePath,
  packageCwd = packageRoot,
  reportPath = defaultReportPath,
  screenshotPath = defaultScreenshotPath,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (process.platform !== "win32") {
    throw new Error("The desktop package smoke currently runs the Windows packaged app and must be run on Windows.");
  }

  await assertFileExists(exePath, "AssiniLang packaged executable");
  await mkdir(dirname(reportPath), { recursive: true });
  await rm(reportPath, { force: true });
  await rm(screenshotPath, { force: true });

  const child = spawn(exePath, [], {
    cwd: packageCwd,
    env: {
      ...process.env,
      ASSINI_DESKTOP_SMOKE: "1",
      ASSINI_DESKTOP_SMOKE_REPORT: reportPath,
      ASSINI_DESKTOP_SMOKE_SCREENSHOT: screenshotPath
    },
    stdio: "ignore",
    windowsHide: true
  });

  try {
    await waitForReport(reportPath, child, timeoutMs);
    const report = await readJson(reportPath);
    const summary = validateSmokeReport(report);
    const screenshot = await stat(screenshotPath);
    assert(screenshot.size >= MIN_SCREENSHOT_BYTES, `Desktop smoke screenshot is unexpectedly small (${screenshot.size} bytes).`);
    await waitForExit(child, 10_000);
    if (child.exitCode === null && child.signalCode === null) {
      await killProcessTree(child.pid);
    }
    return {
      ...summary,
      reportPath,
      screenshotBytes: screenshot.size,
      screenshotPath
    };
  } catch (error) {
    await killProcessTree(child.pid);
    throw error;
  }
}

async function main() {
  const timeoutMs = parseTimeoutMs();
  const summary = await runDesktopPackageSmoke({ timeoutMs });
  console.log("[desktop-smoke] Packaged AssiniLang rendered and passed UI smoke checks.");
  console.log(`[desktop-smoke] Report: ${summary.reportPath}`);
  console.log(`[desktop-smoke] Screenshot: ${summary.screenshotPath}`);
  console.log(`[desktop-smoke] Screens: ${summary.screens.join(", ")}`);
  console.log(`[desktop-smoke] Screenshot pixels: ${summary.screenshotPixels}; non-white ratio: ${summary.nonWhiteRatio}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
