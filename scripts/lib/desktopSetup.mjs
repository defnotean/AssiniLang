import { win32 } from "node:path";

export const desktopSetupLayout = Object.freeze({
  artifactName: "AssiniLang-Setup-x64.exe",
  helperName: "AssiniLangSetup.ps1",
  sedName: "AssiniLangSetup.sed"
});

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSafeWindowsFileName(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(value)) {
    throw new Error(`${label} must be a conservative Windows file name.`);
  }
  if (/[. ]$/.test(value) || value === "." || value === "..") {
    throw new Error(`${label} has an unsafe trailing character.`);
  }

  const stem = value.split(".", 1)[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    throw new Error(`${label} is a reserved Windows file name.`);
  }
  return value;
}

function quotedSedPath(value, label) {
  if (typeof value !== "string" || /[\0\r\n"%]/.test(value) || !win32.isAbsolute(value)) {
    throw new Error(`${label} must be a safe absolute Windows path.`);
  }
  return `"${win32.normalize(value)}"`;
}

export function normalizeSetupPayloadFileNames(fileNames) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    throw new Error("At least one setup payload file is required.");
  }

  const sortedNames = fileNames
    .map((fileName, index) => assertSafeWindowsFileName(fileName, `Setup payload file ${index}`))
    .sort(compareText);
  const caseInsensitiveNames = new Set();
  for (const fileName of sortedNames) {
    const comparableName = fileName.toLowerCase();
    if (caseInsensitiveNames.has(comparableName)) {
      throw new Error(`Duplicate setup payload file: ${fileName}`);
    }
    caseInsensitiveNames.add(comparableName);
  }
  return sortedNames;
}

export function createIExpressSed({
  launcherFileName = desktopSetupLayout.helperName,
  payloadFileNames,
  sourceDirectory,
  targetPath
}) {
  const launcher = assertSafeWindowsFileName(launcherFileName, "Setup launcher");
  const payloadNames = normalizeSetupPayloadFileNames(payloadFileNames);
  if (!payloadNames.some((fileName) => fileName.toLowerCase() === launcher.toLowerCase())) {
    throw new Error(`Setup launcher ${launcher} is not present in the payload.`);
  }

  const fileVariables = payloadNames.map((fileName, index) => `FILE${index}="${fileName}"`);
  const sourceEntries = payloadNames.map((_fileName, index) => `%FILE${index}%=`);
  return [
    "[Version]",
    "Class=IEXPRESS",
    "SEDVersion=3",
    "[Options]",
    "PackagePurpose=InstallApp",
    "ShowInstallProgramWindow=1",
    "HideExtractAnimation=0",
    "UseLongFileName=1",
    "InsideCompressed=0",
    "CAB_FixedSize=0",
    "CAB_ResvCodeSigning=0",
    "RebootMode=N",
    "InstallPrompt=%InstallPrompt%",
    "DisplayLicense=%DisplayLicense%",
    "FinishMessage=%FinishMessage%",
    "TargetName=%TargetName%",
    "FriendlyName=%FriendlyName%",
    "AppLaunched=%AppLaunched%",
    "PostInstallCmd=%PostInstallCmd%",
    "AdminQuietInstCmd=%AdminQuietInstCmd%",
    "UserQuietInstCmd=%UserQuietInstCmd%",
    "SourceFiles=SourceFiles",
    "[Strings]",
    "InstallPrompt=",
    "DisplayLicense=",
    "FinishMessage=",
    `TargetName=${quotedSedPath(targetPath, "IExpress target")}`,
    "FriendlyName=AssiniLang Setup (Windows x64)",
    `AppLaunched=powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "${launcher}"`,
    "PostInstallCmd=<None>",
    "AdminQuietInstCmd=",
    "UserQuietInstCmd=",
    ...fileVariables,
    "[SourceFiles]",
    `SourceFiles0=${quotedSedPath(sourceDirectory, "IExpress source directory")}`,
    "[SourceFiles0]",
    ...sourceEntries,
    ""
  ].join("\r\n");
}

function psLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function setupExtractorPowerShell({
  archiveName,
  installerName = "Install AssiniLang.ps1",
  packageDirectoryName
}) {
  const safeArchiveName = assertSafeWindowsFileName(archiveName, "Portable archive");
  const safeInstallerName = assertSafeWindowsFileName(installerName, "Packaged installer");
  const safePackageDirectoryName = assertSafeWindowsFileName(
    packageDirectoryName,
    "Packaged app directory"
  );
  const installerRelativePath = win32.join(safePackageDirectoryName, safeInstallerName);

  return [
    "$ErrorActionPreference = 'Stop'",
    `$archivePath = Join-Path $PSScriptRoot ${psLiteral(safeArchiveName)}`,
    "$extractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('AssiniLang-Setup-' + [Guid]::NewGuid().ToString('N'))",
    "$exitCode = 0",
    "try {",
    "  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {",
    "    throw \"Portable archive was not found: $archivePath\"",
    "  }",
    "  [void][System.IO.Directory]::CreateDirectory($extractRoot)",
    "  $extractRootFull = [System.IO.Path]::GetFullPath($extractRoot)",
    "  $extractRootPrefix = $extractRootFull + [System.IO.Path]::DirectorySeparatorChar",
    "  Add-Type -AssemblyName System.IO.Compression",
    "  Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)",
    "  try {",
    "    $entries = [System.Collections.Generic.List[System.IO.Compression.ZipArchiveEntry]]::new()",
    "    foreach ($entry in $zip.Entries) { [void]$entries.Add($entry) }",
    "    $comparison = [System.Comparison[System.IO.Compression.ZipArchiveEntry]] {",
    "      param($left, $right)",
    "      [System.StringComparer]::Ordinal.Compare($left.FullName, $right.FullName)",
    "    }",
    "    $entries.Sort($comparison)",
    "    foreach ($entry in $entries) {",
    "      if ([string]::IsNullOrEmpty($entry.FullName)) { continue }",
    "      $entryName = $entry.FullName.Replace([char]47, [System.IO.Path]::DirectorySeparatorChar)",
    "      if ([System.IO.Path]::IsPathRooted($entryName)) {",
    "        throw \"Archive entry uses a rooted path: $($entry.FullName)\"",
    "      }",
    "      $destinationPath = [System.IO.Path]::GetFullPath((Join-Path $extractRootFull $entryName))",
    "      if (-not $destinationPath.StartsWith($extractRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "        throw \"Archive entry escapes the setup directory: $($entry.FullName)\"",
    "      }",
    "      if ([string]::IsNullOrEmpty($entry.Name)) {",
    "        [void][System.IO.Directory]::CreateDirectory($destinationPath)",
    "        continue",
    "      }",
    "      [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destinationPath))",
    "      $input = $entry.Open()",
    "      try {",
    "        $output = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)",
    "        try { $input.CopyTo($output) } finally { $output.Dispose() }",
    "      } finally { $input.Dispose() }",
    "    }",
    "  } finally { $zip.Dispose() }",
    `  $installerPath = Join-Path $extractRootFull ${psLiteral(installerRelativePath)}`,
    "  if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {",
    "    throw \"Packaged installer was not found: $installerPath\"",
    "  }",
    "  $powershellPath = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "  & $powershellPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File $installerPath",
    "  if ($LASTEXITCODE -ne 0) { throw \"Packaged installer failed with exit code $LASTEXITCODE.\" }",
    "} catch {",
    "  [Console]::Error.WriteLine(('AssiniLang setup failed: ' + $_.Exception.Message))",
    "  $exitCode = 1",
    "} finally {",
    "  if (Test-Path -LiteralPath $extractRoot) {",
    "    Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue",
    "  }",
    "}",
    "exit $exitCode",
    ""
  ].join("\r\n");
}
