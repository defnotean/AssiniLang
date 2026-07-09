import { describe, expect, it } from "vitest";
import { assertOutboundHttpUrlAllowed } from "./urlSafety.js";

describe("outbound URL safety", () => {
  it("blocks private discovery base URLs when ASSINI_ALLOW_PRIVATE_URLS is unset", async () => {
    await expect(assertOutboundHttpUrlAllowed("http://127.0.0.1:11434/v1", { env: {} }))
      .rejects.toThrow(/private or local network/);
  });

  it("allows private discovery base URLs when ASSINI_ALLOW_PRIVATE_URLS=1", async () => {
    const parsed = await assertOutboundHttpUrlAllowed("http://127.0.0.1:11434/v1", {
      env: { ASSINI_ALLOW_PRIVATE_URLS: "1" }
    });
    expect(parsed.hostname).toBe("127.0.0.1");
  });

  it("fails closed when DNS lookup fails", async () => {
    await expect(
      assertOutboundHttpUrlAllowed("http://unresolvable.example/v1", {
        env: {},
        lookupFn: async () => {
          throw new Error("ENOTFOUND");
        }
      })
    ).rejects.toThrow(/could not be resolved/);
  });

  it("blocks hostnames that resolve to private addresses", async () => {
    await expect(
      assertOutboundHttpUrlAllowed("http://metadata.example/v1", {
        env: {},
        lookupFn: async () => ({ address: "169.254.169.254", family: 4 })
      })
    ).rejects.toThrow(/resolves to a private/);
  });

  it("blocks CGNAT addresses", async () => {
    await expect(assertOutboundHttpUrlAllowed("http://100.64.0.1/v1", { env: {} }))
      .rejects.toThrow(/private or local network/);
  });

  it("redacts URL userinfo from invalid-URL validation errors", async () => {
    await expect(
      assertOutboundHttpUrlAllowed("https://user:url-pass-secret@%zz", { env: {} })
    ).rejects.toThrow(/\[redacted-secret\]/);

    try {
      await assertOutboundHttpUrlAllowed("https://user:url-pass-secret@%zz", { env: {} });
      throw new Error("expected URL validation to fail");
    } catch (error) {
      expect((error as Error).message).not.toContain("url-pass-secret");
    }
  });
});
