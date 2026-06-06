import { describe, expect, it } from "vitest";
import { createDevProcessSpecs } from "./devLauncher.mjs";

describe("dev launcher", () => {
  it("builds Windows-safe child process specs with prototype auth and explicit ports", () => {
    const specs = createDevProcessSpecs({
      platform: "win32",
      env: {
        PATH: "C:\\node",
        ASSINI_DEV_API_PORT: "4401",
        ASSINI_DEV_WEB_PORT: "5501"
      }
    });

    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({
      name: "api",
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd --workspace @assini/api run dev"],
      options: {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          PATH: "C:\\node",
          ASSINI_ENABLE_PROTOTYPE_AUTH: "true",
          HOST: "127.0.0.1",
          PORT: "4401"
        }
      }
    });
    expect(specs[1]).toMatchObject({
      name: "web",
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd --workspace @assini/web run dev -- --host 127.0.0.1 --port 5501"],
      options: {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          PATH: "C:\\node",
          ASSINI_ENABLE_PROTOTYPE_AUTH: "true",
          ASSINI_API_HOST: "127.0.0.1",
          ASSINI_API_PORT: "4401"
        }
      }
    });
  });

  it("uses npm and default ports on non-Windows platforms", () => {
    const specs = createDevProcessSpecs({ platform: "linux", env: {} });

    expect(specs.map((spec) => spec.command)).toEqual(["npm", "npm"]);
    expect(specs[0].options.env).toMatchObject({ PORT: "4321" });
    expect(specs[1].args).toEqual(["--workspace", "@assini/web", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"]);
    expect(specs[1].options.env).toMatchObject({ ASSINI_API_PORT: "4321" });
  });
});
