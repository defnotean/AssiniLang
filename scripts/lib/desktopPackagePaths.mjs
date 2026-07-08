import { join } from "node:path";

export const desktopPackageLayout = Object.freeze({
  appResourceSegments: ["resources", "app"],
  archiveName: "AssiniLang-win32-x64.zip",
  executableName: "AssiniLang.exe",
  outputDirName: "dist-desktop",
  packageDirName: "AssiniLang-win32-x64",
  smokeReportName: "desktop-smoke-report.json",
  smokeScreenshotName: "desktop-smoke.png"
});

export function desktopPackagePaths(repoRoot) {
  const outputRoot = join(repoRoot, desktopPackageLayout.outputDirName);
  const packageRoot = join(outputRoot, desktopPackageLayout.packageDirName);

  return {
    appRoot: join(packageRoot, ...desktopPackageLayout.appResourceSegments),
    archivePath: join(outputRoot, desktopPackageLayout.archiveName),
    defaultReportPath: join(outputRoot, desktopPackageLayout.smokeReportName),
    defaultScreenshotPath: join(outputRoot, desktopPackageLayout.smokeScreenshotName),
    electronDist: join(repoRoot, "node_modules", "electron", "dist"),
    executablePath: join(packageRoot, desktopPackageLayout.executableName),
    outputRoot,
    packageRoot
  };
}
