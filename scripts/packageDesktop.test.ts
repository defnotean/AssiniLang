import { describe, expect, it } from "vitest";

describe("desktop package helper scripts", () => {
  it("generates a top-level launcher that opens the packaged app", async () => {
    const { outputRootLauncherScript } = await import("./packageDesktop.mjs");
    const script = outputRootLauncherScript();

    expect(script).toContain("AssiniLang-win32-x64\\AssiniLang.exe");
    expect(script).toContain("start \"\" \"%APP_EXE%\"");
    expect(script).toContain("Run npm.cmd run desktop:package first.");
  });

  it("generates an in-package launcher for extracted zip users", async () => {
    const { packageRootLauncherScript } = await import("./packageDesktop.mjs");
    const script = packageRootLauncherScript();

    expect(script).toContain("AssiniLang.exe");
    expect(script).toContain("start \"\" \"%APP_EXE%\"");
    expect(script).toContain("was not found next to this launcher");
  });

  it("generates a top-level installer handoff to the package installer", async () => {
    const { outputRootInstallScript } = await import("./packageDesktop.mjs");
    const script = outputRootInstallScript();

    expect(script).toContain("AssiniLang-win32-x64\\Install AssiniLang.cmd");
    expect(script).toContain("call \"%INSTALLER%\"");
    expect(script).toContain("Run npm.cmd run desktop:package first.");
  });

  it("explains the output folder click targets", async () => {
    const { outputRootReadme } = await import("./packageDesktop.mjs");
    const readme = outputRootReadme();

    expect(readme).toContain("Open AssiniLang.cmd");
    expect(readme).toContain("Install AssiniLang.cmd");
    expect(readme).toContain("AssiniLang-win32-x64.zip");
  });
});
