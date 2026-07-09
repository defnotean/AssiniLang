/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = window.fetch;

function setDesktopBridge(apiBaseUrl?: string): void {
  Object.defineProperty(window, "assiniDesktop", {
    configurable: true,
    value: apiBaseUrl
      ? {
          apiBaseUrl,
          authToken: "desktop-token",
          prototypeAuth: true
        }
      : undefined
  });
}

function setFetch(fetchImplementation: typeof fetch): void {
  Object.defineProperty(window, "fetch", {
    configurable: true,
    value: fetchImplementation,
    writable: true
  });
}

afterEach(() => {
  setDesktopBridge();
  setFetch(originalFetch);
  vi.resetModules();
});

describe("desktop API URL resolution", () => {
  it("routes only /api paths to the exposed loopback API and preserves request options", async () => {
    const nativeFetch = vi.fn(async () => new Response(null, { status: 204 }));
    setDesktopBridge("http://127.0.0.1:43123");
    setFetch(nativeFetch as typeof fetch);
    vi.resetModules();

    await import("./apiClient");

    const init: RequestInit = {
      credentials: "include",
      headers: { "x-assini-dev-token": "desktop-token" }
    };
    await window.fetch("/api/health?verbose=1", init);
    await window.fetch("/apiary", init);
    await window.fetch("https://example.test/api/health", init);

    expect(nativeFetch).toHaveBeenNthCalledWith(1, "http://127.0.0.1:43123/health?verbose=1", init);
    expect(nativeFetch).toHaveBeenNthCalledWith(2, "/apiary", init);
    expect(nativeFetch).toHaveBeenNthCalledWith(3, "https://example.test/api/health", init);
  });

  it("leaves ordinary browser fetch untouched when the desktop bridge is absent", async () => {
    const nativeFetch = vi.fn(async () => new Response(null, { status: 204 }));
    setDesktopBridge();
    setFetch(nativeFetch as typeof fetch);
    vi.resetModules();

    await import("./apiClient");

    expect(window.fetch).toBe(nativeFetch);
    await window.fetch("/api/health", { credentials: "include" });
    expect(nativeFetch).toHaveBeenCalledWith("/api/health", { credentials: "include" });
  });

  it("rejects non-loopback desktop API bases", async () => {
    const nativeFetch = vi.fn(async () => new Response(null, { status: 204 }));
    setDesktopBridge("https://example.test");
    setFetch(nativeFetch as typeof fetch);
    vi.resetModules();

    await import("./apiClient");

    expect(window.fetch).toBe(nativeFetch);
    await window.fetch("/api/health");
    expect(nativeFetch).toHaveBeenCalledWith("/api/health");
  });
});
