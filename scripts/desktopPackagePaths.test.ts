import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop package paths", () => {
  it("centralizes package, archive, executable, app, and smoke artifact paths", async () => {
    const { desktopPackagePaths } = await import("./lib/desktopPackagePaths.mjs");
    const root = join("C:", "repo", "AssiniLang");

    expect(desktopPackagePaths(root)).toEqual({
      appRoot: join(root, "dist-desktop", "AssiniLang-win32-x64", "resources", "app"),
      archivePath: join(root, "dist-desktop", "AssiniLang-win32-x64.zip"),
      defaultReportPath: join(root, "dist-desktop", "desktop-smoke-report.json"),
      defaultScreenshotPath: join(root, "dist-desktop", "desktop-smoke.png"),
      electronDist: join(root, "node_modules", "electron", "dist"),
      executablePath: join(root, "dist-desktop", "AssiniLang-win32-x64", "AssiniLang.exe"),
      outputRoot: join(root, "dist-desktop"),
      packageRoot: join(root, "dist-desktop", "AssiniLang-win32-x64")
    });
  });
});
