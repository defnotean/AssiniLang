import { describe, expect, it } from "vitest";
import config, { resolveApiProxyTarget } from "./vite.config";

describe("web vite config", () => {
  it("builds with relative asset paths for packaged desktop file loading", () => {
    expect((config as { base?: string }).base).toBe("./");
  });

  it("resolves the API proxy target from launcher environment", () => {
    expect(resolveApiProxyTarget({ ASSINI_API_HOST: "0.0.0.0", ASSINI_API_PORT: "4401" })).toBe("http://0.0.0.0:4401");
    expect(resolveApiProxyTarget({})).toBe("http://127.0.0.1:4321");
  });

  it("proxies API requests in both development and production preview", () => {
    const proxyConfig = config as {
      preview?: { proxy?: Record<string, unknown> };
      server?: { proxy?: Record<string, unknown> };
    };

    expect(proxyConfig.server?.proxy?.["/api"]).toBeDefined();
    expect(proxyConfig.preview?.proxy?.["/api"]).toBeDefined();
  });
});
