import { describe, expect, it } from "vitest";
import { resolveApiProxyTarget } from "./vite.config";

describe("web vite config", () => {
  it("resolves the API proxy target from launcher environment", () => {
    expect(resolveApiProxyTarget({ ASSINI_API_HOST: "0.0.0.0", ASSINI_API_PORT: "4401" })).toBe("http://0.0.0.0:4401");
    expect(resolveApiProxyTarget({})).toBe("http://127.0.0.1:4321");
  });
});
