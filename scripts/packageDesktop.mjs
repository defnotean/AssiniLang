import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInstalledPackageMatchesLock,
  assertRuntimeManifestsMatchLock,
  createDesktopChecksumManifest,
  createDesktopRuntimeMetadata,
  publishStagedDirectory
} from "./lib/desktopPackageIntegrity.mjs";
import { desktopPackageLayout, desktopPackagePaths } from "./lib/desktopPackagePaths.mjs";
import {
  createIExpressSed,
  desktopSetupLayout,
  setupExtractorPowerShell
} from "./lib/desktopSetup.mjs";
import { readJsonFile } from "./lib/jsonHelpers.mjs";
import { npmSpawnSpec, run } from "./lib/processHelpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const finalPackagePaths = desktopPackagePaths(repoRoot);
const { electronDist, outputRoot } = finalPackagePaths;
const checksumManifestName = "SHA256SUMS.txt";
const iexpressPath = "C:\\Windows\\System32\\iexpress.exe";
const runtimePackageFiles = [
  ["", join(repoRoot, "package.json")],
  ["apps/api", join(repoRoot, "apps", "api", "package.json")],
  ["packages/db", join(repoRoot, "packages", "db", "package.json")],
  ["packages/api-contract", join(repoRoot, "packages", "api-contract", "package.json")],
  ["packages/eval", join(repoRoot, "packages", "eval", "package.json")]
];

function releasePaths(releaseRoot) {
  const packageRoot = join(releaseRoot, desktopPackageLayout.packageDirName);
  return {
    appRoot: join(packageRoot, ...desktopPackageLayout.appResourceSegments),
    archivePath: join(releaseRoot, desktopPackageLayout.archiveName),
    checksumManifestPath: join(releaseRoot, checksumManifestName),
    executablePath: join(packageRoot, desktopPackageLayout.executableName),
    outputRoot: releaseRoot,
    packageRoot,
    setupPath: join(releaseRoot, desktopSetupLayout.artifactName)
  };
}

async function assertExists(path, label, hint = "Run npm.cmd install first.") {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`${label} was not found at ${path}. ${hint}`);
  }
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function createPortableArchive(packageRoot, archivePath) {
  const temporaryArchivePath = `${archivePath}.${randomUUID()}.tmp`;
  const archiveCommand = [
    "$ErrorActionPreference = 'Stop'",
    `$source = ${psQuote(packageRoot)}`,
    `$destination = ${psQuote(temporaryArchivePath)}`,
    `$entryRoot = ${psQuote(basename(packageRoot))}`,
    "Add-Type -AssemblyName System.IO.Compression",
    "$epoch = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)",
    "$output = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)",
    "$zip = $null",
    "try {",
    "  $zip = [System.IO.Compression.ZipArchive]::new($output, [System.IO.Compression.ZipArchiveMode]::Create, $false)",
    "  $filePaths = [System.Collections.Generic.List[string]]::new()",
    "  Get-ChildItem -LiteralPath $source -Recurse -File -Force | ForEach-Object { $filePaths.Add($_.FullName) }",
    "  $filePaths.Sort([System.StringComparer]::Ordinal)",
    "  foreach ($filePath in $filePaths) {",
    "    $relativePath = $filePath.Substring($source.Length + 1).Replace('\\', '/')",
    "    $entry = $zip.CreateEntry(($entryRoot + '/' + $relativePath), [System.IO.Compression.CompressionLevel]::Optimal)",
    "    $entry.LastWriteTime = $epoch",
    "    $input = [System.IO.File]::OpenRead($filePath)",
    "    try {",
    "      $entryStream = $entry.Open()",
    "      try { $input.CopyTo($entryStream) } finally { $entryStream.Dispose() }",
    "    } finally { $input.Dispose() }",
    "  }",
    "} finally {",
    "  if ($null -ne $zip) { $zip.Dispose() }",
    "  $output.Dispose()",
    "}"
  ].join("\n");

  try {
    await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", archiveCommand], {
      logPrefix: "[desktop-package]"
    });
    await rename(temporaryArchivePath, archivePath);
  } finally {
    await rm(temporaryArchivePath, { force: true });
  }
}

export async function createWindowsSetup(paths, { iexpressExecutablePath = iexpressPath } = {}) {
  const helperPath = join(paths.outputRoot, desktopSetupLayout.helperName);
  const sedPath = join(paths.outputRoot, desktopSetupLayout.sedName);
  const payloadFileNames = [basename(paths.archivePath), desktopSetupLayout.helperName];
  const helperScript = setupExtractorPowerShell({
    archiveName: basename(paths.archivePath),
    packageDirectoryName: basename(paths.packageRoot)
  });
  const sed = createIExpressSed({
    launcherFileName: desktopSetupLayout.helperName,
    payloadFileNames,
    sourceDirectory: paths.outputRoot,
    targetPath: paths.setupPath
  });

  try {
    await writeFile(helperPath, helperScript, "utf8");
    await writeFile(sedPath, sed, "utf8");
    await run(iexpressExecutablePath, ["/N", "/Q", desktopSetupLayout.sedName], {
      cwd: paths.outputRoot,
      logPrefix: "[desktop-package]"
    });
    const setupStats = await stat(paths.setupPath);
    if (!setupStats.isFile() || setupStats.size === 0) {
      throw new Error(`IExpress did not create a non-empty setup executable at ${paths.setupPath}.`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`IExpress setup creation failed: ${detail}`, { cause: error });
  } finally {
    await Promise.all([rm(helperPath, { force: true }), rm(sedPath, { force: true })]);
  }
}

async function copyDir(source, target) {
  await cp(source, target, { recursive: true, force: true });
}

async function copyPackageRuntime(appRoot, packageName, sourceDir) {
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
    "Double-click AssiniLang-Setup-x64.exe for a single-file, per-user install that creates Desktop and Start Menu shortcuts.",
    "Double-click Open AssiniLang.cmd to run the packaged desktop app from this folder.",
    "Double-click Install AssiniLang.cmd to install it into your user Programs folder and create Start Menu/Desktop shortcuts.",
    "Share AssiniLang-Setup-x64.exe when you need one downloadable setup file.",
    "Share AssiniLang-win32-x64.zip when you need a portable copy.",
    "SHA256SUMS.txt contains SHA-256 checksums for the setup, portable zip, and packaged Windows x64 executable.",
    "The portable zip is deterministic. The Windows IExpress setup wrapper may not be byte-reproducible and is not code-signed.",
    "The packaged Windows x64 executable is also unsigned and depends on the sibling files in its folder.",
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

async function writeOutputRootHelpers(releaseRoot) {
  await writeFile(join(releaseRoot, "Open AssiniLang.cmd"), outputRootLauncherScript(), "utf8");
  await writeFile(join(releaseRoot, "Install AssiniLang.cmd"), outputRootInstallScript(), "utf8");
  await writeFile(join(releaseRoot, "README.txt"), outputRootReadme(), "utf8");
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

async function prepareDesktopRuntimeMetadata() {
  const [repositoryLockfile, installedElectronManifest, electronRuntimeVersion, manifestEntries] =
    await Promise.all([
      readJsonFile(join(repoRoot, "package-lock.json")),
      readJsonFile(join(repoRoot, "node_modules", "electron", "package.json")),
      readFile(join(electronDist, "version"), "utf8"),
      Promise.all(
        runtimePackageFiles.map(async ([packagePath, filePath]) => [packagePath, await readJsonFile(filePath)])
      )
    ]);

  const runtimeManifests = Object.fromEntries(manifestEntries);
  assertRuntimeManifestsMatchLock(repositoryLockfile, runtimeManifests);
  const lockedElectronVersion = assertInstalledPackageMatchesLock(
    repositoryLockfile,
    "electron",
    installedElectronManifest
  );
  const installedRuntimeVersion = electronRuntimeVersion.trim();
  if (installedRuntimeVersion !== lockedElectronVersion) {
    throw new Error(
      `Installed Electron runtime ${installedRuntimeVersion || "<missing>"} does not match package-lock.json ${lockedElectronVersion}. Run npm.cmd ci before packaging.`
    );
  }

  return createDesktopRuntimeMetadata(repositoryLockfile, {
    runtimePackagePaths: runtimePackageFiles.map(([packagePath]) => packagePath),
    version: runtimeManifests[""].version
  });
}

async function assertWindowsX64Executable(executablePath) {
  const file = await open(executablePath, "r");
  try {
    const dosHeader = Buffer.alloc(64);
    const dosRead = await file.read(dosHeader, 0, dosHeader.length, 0);
    if (dosRead.bytesRead !== dosHeader.length || dosHeader.toString("ascii", 0, 2) !== "MZ") {
      throw new Error(`Electron runtime is not a valid Windows executable: ${executablePath}`);
    }

    const peOffset = dosHeader.readUInt32LE(0x3c);
    const peHeader = Buffer.alloc(6);
    const peRead = await file.read(peHeader, 0, peHeader.length, peOffset);
    const isPe = peRead.bytesRead === peHeader.length && peHeader.readUInt32LE(0) === 0x00004550;
    const machine = isPe ? peHeader.readUInt16LE(4) : undefined;
    if (!isPe || machine !== 0x8664) {
      throw new Error(`Electron runtime is not a Windows x64 executable: ${executablePath}`);
    }
  } finally {
    await file.close();
  }
}

async function writeArtifactChecksums(paths) {
  const manifest = await createDesktopChecksumManifest(paths);
  await writeFile(paths.checksumManifestPath, manifest, "utf8");
}

async function stageDesktopApp(paths, runtimeMetadata) {
  const { appRoot, packageRoot } = paths;
  await mkdir(appRoot, { recursive: true });

  await copyDir(electronDist, packageRoot);
  await rename(join(packageRoot, "electron.exe"), join(packageRoot, "AssiniLang.exe"));

  await writeFile(join(appRoot, "package.json"), runtimeMetadata.packageJsonText, "utf8");
  await writeFile(join(appRoot, "package-lock.json"), runtimeMetadata.packageLockText, "utf8");

  await copyDir(join(repoRoot, "apps", "desktop"), join(appRoot, "apps", "desktop"));
  await mkdir(join(appRoot, "apps", "api"), { recursive: true });
  await cp(join(repoRoot, "apps", "api", "package.json"), join(appRoot, "apps", "api", "package.json"), {
    force: true
  });
  await copyDir(join(repoRoot, "apps", "api", "dist"), join(appRoot, "apps", "api", "dist"));
  await copyDir(join(repoRoot, "apps", "web", "dist"), join(appRoot, "apps", "web", "dist"));

  const npmCi = npmSpawnSpec(["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]);
  await run(npmCi.command, npmCi.args, { cwd: appRoot, logPrefix: "[desktop-package]" });

  await copyPackageRuntime(appRoot, "api-contract", join(repoRoot, "packages", "api-contract"));
  await copyPackageRuntime(appRoot, "db", join(repoRoot, "packages", "db"));
  await copyPackageRuntime(appRoot, "eval", join(repoRoot, "packages", "eval"));

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
      "This executable targets Windows x64 and is not code-signed.",
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
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("The desktop package script only builds a Windows x64 package from Windows x64 Node.js.");
  }

  await assertExists(join(electronDist, "electron.exe"), "Electron runtime");
  await assertExists(join(electronDist, "version"), "Electron runtime version");
  await assertExists(join(repoRoot, "node_modules", "electron", "package.json"), "Electron package manifest");
  await assertExists(join(repoRoot, "package-lock.json"), "npm lockfile");
  await assertExists(
    iexpressPath,
    "Windows IExpress",
    "This Windows installation must provide System32\\iexpress.exe to build the setup artifact."
  );
  await assertExists(join(repoRoot, "apps", "api", "dist", "index.js"), "Built API");
  await assertExists(join(repoRoot, "apps", "web", "dist", "index.html"), "Built web app");
  await assertWindowsX64Executable(join(electronDist, "electron.exe"));

  const runtimeMetadata = await prepareDesktopRuntimeMetadata();
  const stagedOutputRoot = await mkdtemp(join(repoRoot, ".dist-desktop-stage-"));
  const stagedPaths = releasePaths(stagedOutputRoot);
  let published = false;

  try {
    await stageDesktopApp(stagedPaths, runtimeMetadata);
    await writeOutputRootHelpers(stagedOutputRoot);
    await createPortableArchive(stagedPaths.packageRoot, stagedPaths.archivePath);
    await createWindowsSetup(stagedPaths);
    await writeArtifactChecksums(stagedPaths);
    await publishStagedDirectory(stagedOutputRoot, outputRoot);
    published = true;
  } finally {
    if (!published) {
      await rm(stagedOutputRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  console.log(`[desktop-package] Wrote ${finalPackagePaths.executablePath}`);
  console.log(`[desktop-package] Wrote ${finalPackagePaths.archivePath}`);
  console.log(`[desktop-package] Wrote ${join(outputRoot, desktopSetupLayout.artifactName)}`);
  console.log(`[desktop-package] Wrote ${join(outputRoot, checksumManifestName)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
