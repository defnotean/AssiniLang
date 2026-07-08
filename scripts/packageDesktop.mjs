import { constants } from "node:fs";
import { access, cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopPackagePaths } from "./lib/desktopPackagePaths.mjs";
import { readJsonFile } from "./lib/jsonHelpers.mjs";
import { npmSpawnSpec, run } from "./lib/processHelpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const {
  appRoot,
  archivePath,
  electronDist,
  outputRoot,
  packageRoot
} = desktopPackagePaths(repoRoot);

async function assertExists(path, label) {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`${label} was not found at ${path}. Run npm.cmd install first.`);
  }
}

function externalDependencies(...dependencySets) {
  const dependencies = {};
  for (const dependencySet of dependencySets) {
    for (const [name, version] of Object.entries(dependencySet ?? {})) {
      if (name.startsWith("@assini/")) continue;
      dependencies[name] = version;
    }
  }

  // The desktop shell uses the JSON store. SQLite stays available in dev, but
  // the packaged runtime avoids shipping Electron-native SQLite bindings until
  // the desktop app exposes SQLite as a supported packaged storage option.
  delete dependencies["better-sqlite3"];
  return dependencies;
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function createPortableArchive() {
  await rm(archivePath, { force: true });
  const archiveCommand = [
    `$source = ${psQuote(packageRoot)}`,
    `$destination = ${psQuote(archivePath)}`,
    "$zipEpoch = Get-Date '1980-01-01T00:00:00'",
    "Get-Item -LiteralPath $source | Where-Object { $_.LastWriteTime -lt $zipEpoch } | ForEach-Object { $_.LastWriteTime = $zipEpoch }",
    "Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.LastWriteTime -lt $zipEpoch } | ForEach-Object { $_.LastWriteTime = $zipEpoch }",
    "Compress-Archive -LiteralPath $source -DestinationPath $destination -Force"
  ].join("; ");
  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", archiveCommand], {
    logPrefix: "[desktop-package]"
  });
}

async function copyDir(source, target) {
  await cp(source, target, { recursive: true, force: true });
}

async function copyPackageRuntime(packageName, sourceDir) {
  const targetDir = join(appRoot, "node_modules", "@assini", packageName);
  await mkdir(targetDir, { recursive: true });
  await cp(join(sourceDir, "package.json"), join(targetDir, "package.json"), { force: true });
  await copyDir(join(sourceDir, "dist"), join(targetDir, "dist"));
}

function cmdWrapper(scriptName) {
  return [
    "@echo off",
    "setlocal",
    `set "SCRIPT=%~dp0${scriptName}"`,
    "pushd \"%TEMP%\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT%\"",
    "set \"EXIT_CODE=%ERRORLEVEL%\"",
    "popd",
    "if not \"%EXIT_CODE%\"==\"0\" (",
    "  echo.",
    "  echo The operation failed. Check the messages above.",
    ")",
    "pause",
    "exit /b %EXIT_CODE%",
    ""
  ].join("\r\n");
}

export function outputRootLauncherScript() {
  return [
    "@echo off",
    "setlocal",
    "set \"APP_EXE=%~dp0AssiniLang-win32-x64\\AssiniLang.exe\"",
    "if not exist \"%APP_EXE%\" (",
    "  echo AssiniLang packaged app was not found.",
    "  echo Expected: %APP_EXE%",
    "  echo.",
    "  echo Run npm.cmd run desktop:package first.",
    "  pause",
    "  exit /b 1",
    ")",
    "start \"\" \"%APP_EXE%\"",
    "exit /b 0",
    ""
  ].join("\r\n");
}

export function outputRootInstallScript() {
  return [
    "@echo off",
    "setlocal",
    "set \"INSTALLER=%~dp0AssiniLang-win32-x64\\Install AssiniLang.cmd\"",
    "if not exist \"%INSTALLER%\" (",
    "  echo AssiniLang installer was not found.",
    "  echo Expected: %INSTALLER%",
    "  echo.",
    "  echo Run npm.cmd run desktop:package first.",
    "  pause",
    "  exit /b 1",
    ")",
    "call \"%INSTALLER%\"",
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}

export function outputRootReadme() {
  return [
    "AssiniLang Desktop Build",
    "",
    "Double-click Open AssiniLang.cmd to run the packaged desktop app from this folder.",
    "Double-click Install AssiniLang.cmd to install it into your user Programs folder and create Start Menu/Desktop shortcuts.",
    "Share AssiniLang-win32-x64.zip when you need a portable copy.",
    "",
    "The app stores local language data and model settings in its user-data folder, not in dist-desktop.",
    ""
  ].join("\r\n");
}

export function packageRootLauncherScript() {
  return [
    "@echo off",
    "setlocal",
    "set \"APP_EXE=%~dp0AssiniLang.exe\"",
    "if not exist \"%APP_EXE%\" (",
    "  echo AssiniLang.exe was not found next to this launcher.",
    "  echo Expected: %APP_EXE%",
    "  pause",
    "  exit /b 1",
    ")",
    "start \"\" \"%APP_EXE%\"",
    "exit /b 0",
    ""
  ].join("\r\n");
}

async function writeOutputRootHelpers() {
  await writeFile(join(outputRoot, "Open AssiniLang.cmd"), outputRootLauncherScript(), "utf8");
  await writeFile(join(outputRoot, "Install AssiniLang.cmd"), outputRootInstallScript(), "utf8");
  await writeFile(join(outputRoot, "README.txt"), outputRootReadme(), "utf8");
}

function shortcutPowerShell() {
  return [
    "function New-AssiniShortcut {",
    "  param(",
    "    [Parameter(Mandatory = $true)][string]$ShortcutPath,",
    "    [Parameter(Mandatory = $true)][string]$TargetPath",
    "  )",
    "  $shortcutDir = Split-Path -Parent $ShortcutPath",
    "  New-Item -ItemType Directory -Force -Path $shortcutDir | Out-Null",
    "  $shell = New-Object -ComObject WScript.Shell",
    "  $shortcut = $shell.CreateShortcut($ShortcutPath)",
    "  $shortcut.TargetPath = $TargetPath",
    "  $shortcut.WorkingDirectory = Split-Path -Parent $TargetPath",
    "  $shortcut.IconLocation = $TargetPath",
    "  $shortcut.Description = 'Open AssiniLang Desktop'",
    "  $shortcut.Save()",
    "}",
    ""
  ].join("\r\n");
}

function installScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path",
    "$installDir = Join-Path $env:LOCALAPPDATA 'Programs\\AssiniLang'",
    "$installedExe = Join-Path $installDir 'AssiniLang.exe'",
    shortcutPowerShell(),
    "function Same-Path([string]$Left, [string]$Right) {",
    "  $leftFull = [System.IO.Path]::GetFullPath($Left).TrimEnd('\\')",
    "  $rightFull = [System.IO.Path]::GetFullPath($Right).TrimEnd('\\')",
    "  return [StringComparer]::OrdinalIgnoreCase.Equals($leftFull, $rightFull)",
    "}",
    "",
    "if (-not (Same-Path $sourceDir $installDir)) {",
    "  Write-Host \"Installing AssiniLang to $installDir\"",
    "  if (Test-Path -LiteralPath $installDir) {",
    "    Remove-Item -LiteralPath $installDir -Recurse -Force",
    "  }",
    "  New-Item -ItemType Directory -Force -Path $installDir | Out-Null",
    "  Get-ChildItem -LiteralPath $sourceDir -Force | Copy-Item -Destination $installDir -Recurse -Force",
    "} else {",
    "  Write-Host \"AssiniLang is already running from the install folder.\"",
    "}",
    "",
    "$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AssiniLang.lnk'",
    "$startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'AssiniLang'",
    "$startMenuShortcut = Join-Path $startMenuDir 'AssiniLang.lnk'",
    "New-AssiniShortcut -ShortcutPath $desktopShortcut -TargetPath $installedExe",
    "New-AssiniShortcut -ShortcutPath $startMenuShortcut -TargetPath $installedExe",
    "",
    "Write-Host \"Installed AssiniLang.\"",
    "Write-Host \"Desktop shortcut: $desktopShortcut\"",
    "Write-Host \"Start Menu shortcut: $startMenuShortcut\"",
    "Write-Host \"Local data stays in $env:APPDATA\\AssiniLang\"",
    ""
  ].join("\r\n");
}

function uninstallScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$installDir = Join-Path $env:LOCALAPPDATA 'Programs\\AssiniLang'",
    "$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AssiniLang.lnk'",
    "$startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'AssiniLang'",
    "$startMenuShortcut = Join-Path $startMenuDir 'AssiniLang.lnk'",
    "",
    "Remove-Item -LiteralPath $desktopShortcut -Force -ErrorAction SilentlyContinue",
    "Remove-Item -LiteralPath $startMenuShortcut -Force -ErrorAction SilentlyContinue",
    "if (Test-Path -LiteralPath $startMenuDir) {",
    "  $remaining = Get-ChildItem -LiteralPath $startMenuDir -Force -ErrorAction SilentlyContinue",
    "  if (-not $remaining) {",
    "    Remove-Item -LiteralPath $startMenuDir -Force -ErrorAction SilentlyContinue",
    "  }",
    "}",
    "if (Test-Path -LiteralPath $installDir) {",
    "  Remove-Item -LiteralPath $installDir -Recurse -Force",
    "}",
    "",
    "Write-Host \"Removed AssiniLang program files and shortcuts.\"",
    "Write-Host \"Local data was kept in $env:APPDATA\\AssiniLang.\"",
    ""
  ].join("\r\n");
}

async function stageDesktopApp() {
  const [rootPackage, apiPackage, dbPackage, apiContractPackage, evalPackage] = await Promise.all([
    readJsonFile(join(repoRoot, "package.json")),
    readJsonFile(join(repoRoot, "apps", "api", "package.json")),
    readJsonFile(join(repoRoot, "packages", "db", "package.json")),
    readJsonFile(join(repoRoot, "packages", "api-contract", "package.json")),
    readJsonFile(join(repoRoot, "packages", "eval", "package.json"))
  ]);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(appRoot, { recursive: true });

  await copyDir(electronDist, packageRoot);
  await rename(join(packageRoot, "electron.exe"), join(packageRoot, "AssiniLang.exe"));

  const dependencies = externalDependencies(
    rootPackage.dependencies,
    apiPackage.dependencies,
    dbPackage.dependencies,
    apiContractPackage.dependencies,
    evalPackage.dependencies
  );

  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({
      name: "assini-lang-desktop",
      productName: "AssiniLang",
      version: rootPackage.version,
      private: true,
      main: "apps/desktop/main.cjs",
      dependencies
    }, null, 2)}\n`,
    "utf8"
  );

  await copyDir(join(repoRoot, "apps", "desktop"), join(appRoot, "apps", "desktop"));
  await mkdir(join(appRoot, "apps", "api"), { recursive: true });
  await cp(join(repoRoot, "apps", "api", "package.json"), join(appRoot, "apps", "api", "package.json"), {
    force: true
  });
  await copyDir(join(repoRoot, "apps", "api", "dist"), join(appRoot, "apps", "api", "dist"));
  await copyDir(join(repoRoot, "apps", "web", "dist"), join(appRoot, "apps", "web", "dist"));

  const npmInstall = npmSpawnSpec(["install", "--omit=dev", "--no-audit", "--no-fund"]);
  await run(npmInstall.command, npmInstall.args, { cwd: appRoot, logPrefix: "[desktop-package]" });

  await copyPackageRuntime("api-contract", join(repoRoot, "packages", "api-contract"));
  await copyPackageRuntime("db", join(repoRoot, "packages", "db"));
  await copyPackageRuntime("eval", join(repoRoot, "packages", "eval"));

  await writeFile(
    join(packageRoot, "README.txt"),
    [
      "AssiniLang Desktop",
      "",
      "Double-click Open AssiniLang.cmd to open the app.",
      "AssiniLang.exe also works directly.",
      "Run Install AssiniLang.cmd once to copy it into your user Programs folder and create Start Menu/Desktop shortcuts.",
      "Run Create Desktop Shortcut.cmd once if you want an AssiniLang shortcut on your Windows desktop.",
      "Run Uninstall AssiniLang.cmd to remove installed program files and shortcuts. Local data is kept.",
      "Opening AssiniLang while it is already running focuses the existing window, and the app remembers your last window size and position.",
      "Local data and model settings are stored in Electron's user-data folder for this app, not in this install folder.",
      ""
    ].join("\r\n"),
    "utf8"
  );

  await writeFile(join(packageRoot, "Open AssiniLang.cmd"), packageRootLauncherScript(), "utf8");

  await writeFile(
    join(packageRoot, "Create Desktop Shortcut.cmd"),
    [
      "@echo off",
      "setlocal",
      "set \"APP_EXE=%~dp0AssiniLang.exe\"",
      "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AssiniLang.lnk'; $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($shortcutPath); $shortcut.TargetPath = $env:APP_EXE; $shortcut.WorkingDirectory = Split-Path $env:APP_EXE; $shortcut.IconLocation = $env:APP_EXE; $shortcut.Save(); Write-Host ('Created ' + $shortcutPath)\"",
      "if errorlevel 1 (",
      "  echo Failed to create the desktop shortcut.",
      ")",
      "pause",
      ""
    ].join("\r\n"),
    "utf8"
  );

  await writeFile(join(packageRoot, "Install AssiniLang.ps1"), installScript(), "utf8");
  await writeFile(join(packageRoot, "Install AssiniLang.cmd"), cmdWrapper("Install AssiniLang.ps1"), "utf8");
  await writeFile(join(packageRoot, "Uninstall AssiniLang.ps1"), uninstallScript(), "utf8");
  await writeFile(join(packageRoot, "Uninstall AssiniLang.cmd"), cmdWrapper("Uninstall AssiniLang.ps1"), "utf8");
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("The current desktop package script builds the Windows x64 package from a Windows machine.");
  }

  await assertExists(join(electronDist, "electron.exe"), "Electron runtime");
  await assertExists(join(repoRoot, "apps", "api", "dist", "index.js"), "Built API");
  await assertExists(join(repoRoot, "apps", "web", "dist", "index.html"), "Built web app");
  await stageDesktopApp();
  await writeOutputRootHelpers();
  console.log(`[desktop-package] Wrote ${join(packageRoot, "AssiniLang.exe")}`);
  await createPortableArchive();
  console.log(`[desktop-package] Wrote ${archivePath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
