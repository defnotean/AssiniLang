import { describe, expect, it, vi } from "vitest";
import { assertOutboundHttpUrlAllowed, fetchOutboundHttp, resolveOutboundHttpUrl } from "./urlSafety.js";

describe("outbound URL safety", () => {
  it("blocks private discovery base URLs when ASSINI_ALLOW_PRIVATE_URLS is unset", async () => {
    await expect(assertOutboundHttpUrlAllowed("http://127.0.0.1:11434/v1", { env: {} })).rejects.toThrow(
      /private or local network/
    );
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

  it("blocks IPv4-mapped IPv6 loopback results", async () => {
    await expect(
      assertOutboundHttpUrlAllowed("http://mapped-loopback.example/v1", {
        env: {},
        lookupFn: async () => ({ address: "::ffff:7f00:1", family: 6 })
      })
    ).rejects.toThrow(/resolves to a private/);
  });

  it("pins the approved DNS result so a rebinding lookup cannot replace it", async () => {
    const lookupFn = vi
      .fn()
      .mockResolvedValueOnce({ address: "93.184.216.34", family: 4 })
      .mockResolvedValueOnce({ address: "169.254.169.254", family: 4 });
    const target = await resolveOutboundHttpUrl("https://rebinding.example/words", {
      env: {},
      lookupFn
    });

    const connectionAddress = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      target.lookup?.("rebinding.example", { all: false }, (error, address, family) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ address: String(address), family: family ?? 0 });
      });
    });

    expect(connectionAddress).toEqual({ address: "93.184.216.34", family: 4 });
    expect(lookupFn).toHaveBeenCalledTimes(1);
  });

  it("blocks CGNAT addresses", async () => {
    await expect(assertOutboundHttpUrlAllowed("http://100.64.0.1/v1", { env: {} })).rejects.toThrow(
      /private or local network/
    );
  });

  it("redacts URL userinfo from invalid-URL validation errors", async () => {
    await expect(assertOutboundHttpUrlAllowed("https://user:url-pass-secret@%zz", { env: {} })).rejects.toThrow(
      /\[redacted-secret\]/
    );

    try {
      await assertOutboundHttpUrlAllowed("https://user:url-pass-secret@%zz", { env: {} });
      throw new Error("expected URL validation to fail");
    } catch (error) {
      expect((error as Error).message).not.toContain("url-pass-secret");
    }
  });

  it.each([
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "[2001:db8::1]",
    "[ff02::1]"
  ])("blocks non-public reserved address %s", async (address) => {
    await expect(assertOutboundHttpUrlAllowed(`http://${address}/v1`, { env: {} })).rejects.toThrow(
      /private or local network/
    );
  });

  it("rejects valid endpoint URLs that contain credentials", async () => {
    await expect(
      assertOutboundHttpUrlAllowed("https://user:secret@example.com/v1", {
        env: {},
        lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
      })
    ).rejects.toThrow(/must not include credentials/);
  });

  it("uses a pinned dispatcher at the real fetch boundary", async () => {
    const lookupFn = vi.fn().mockResolvedValue({ address: "93.184.216.34", family: 4 });
    const fetchFn = vi.fn(async (_input, init) => {
      expect((init as RequestInit & { dispatcher?: unknown }).dispatcher).toBeDefined();
      return new Response("ok");
    });

    await expect(
      fetchOutboundHttp(
        "https://pin.example/v1",
        {},
        {
          env: {},
          fetchFn,
          lookupFn
        }
      ).then((response) => response.text())
    ).resolves.toBe("ok");
    expect(lookupFn).toHaveBeenCalledTimes(1);
  });

  it("blocks redirects before credentials can cross origins", async () => {
    const secret = "redirect-secret";
    const fetchFn = vi.fn(async (_input, init) => {
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${secret}`);
      return new Response(null, {
        status: 307,
        headers: { Location: "http://169.254.169.254/latest/meta-data" }
      });
    });

    await expect(
      fetchOutboundHttp(
        "https://public.example/v1",
        {
          headers: { Authorization: `Bearer ${secret}` }
        },
        {
          env: {},
          fetchFn,
          secrets: [secret],
          lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
        }
      )
    ).rejects.toThrow(/redirect was blocked/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("caps streamed responses even without a Content-Length header", async () => {
    const fetchFn = vi.fn(async () => new Response("12345"));
    const response = await fetchOutboundHttp(
      "https://public.example/v1",
      {},
      {
        env: {},
        fetchFn,
        maxResponseBytes: 4,
        lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
      }
    );
    await expect(response.text()).rejects.toThrow(/4-byte limit/);
  });

  it("redacts configured secrets from transport failures", async () => {
    const secret = "transport-secret";
    await expect(
      fetchOutboundHttp(
        "https://public.example/v1",
        {},
        {
          env: {},
          secrets: [secret],
          fetchFn: async () => {
            throw new Error(`connection failed for Bearer ${secret}`);
          },
          lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
        }
      )
    ).rejects.toThrow(/\[redacted-secret\]/);
  });

  it("enforces the deadline even when an injected transport ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const result = fetchOutboundHttp(
        "https://public.example/v1",
        {},
        {
          env: {},
          timeoutMs: 25,
          fetchFn: async () => new Promise<Response>(() => undefined),
          lookupFn: async () => ({ address: "93.184.216.34", family: 4 })
        }
      );
      const assertion = expect(result).rejects.toThrow(/timed out after 25ms/);
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
