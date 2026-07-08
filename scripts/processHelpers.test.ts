import { describe, expect, it } from "vitest";

describe("process helpers", () => {
  it("quotes Windows command arguments only when needed", async () => {
    const { quoteCmdArg } = await import("./lib/processHelpers.mjs");

    expect(quoteCmdArg("run")).toBe("run");
    expect(quoteCmdArg("desktop:package")).toBe("desktop:package");
    expect(quoteCmdArg("hello world")).toBe("\"hello world\"");
  });

  it("uses npm directly on non-Windows platforms", async () => {
    const { npmSpawnSpec } = await import("./lib/processHelpers.mjs");

    expect(npmSpawnSpec(["run", "build"], { platform: "linux" })).toEqual({
      command: "npm",
      args: ["run", "build"]
    });
  });

  it("uses npm.cmd through cmd.exe on Windows", async () => {
    const { npmSpawnSpec } = await import("./lib/processHelpers.mjs");

    expect(npmSpawnSpec(["run", "desktop:package"], {
      comSpec: "C:\\Windows\\System32\\cmd.exe",
      platform: "win32"
    })).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd run desktop:package"]
    });
  });
});
