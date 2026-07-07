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
});
