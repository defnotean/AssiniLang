import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

type SmokeImage = {
  getSize: () => { width: number; height: number };
  toBitmap: () => Buffer;
  toPNG: () => Buffer;
};

type InjectResponse = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

const require = createRequire(import.meta.url);
const { analyzeSmokeImage, createSmokeEventLog, runDesktopSmoke, serializeError, verifyDesktopUiRoute } =
  require("./desktopSmoke.cjs") as {
    analyzeSmokeImage: (image: SmokeImage) => Record<string, number>;
    createSmokeEventLog: (webContents: { on: (event: string, handler: (...args: unknown[]) => void) => void }) => {
      events: Array<Record<string, unknown>>;
      fatal: Array<Record<string, unknown>>;
    };
    runDesktopSmoke: (
      api: {
        baseUrl: string;
        server: { inject: (request: { method: string; url: string }) => Promise<InjectResponse> };
      },
      eventLog: { events: Array<Record<string, unknown>>; fatal: Array<Record<string, unknown>> },
      options: Record<string, unknown>
    ) => Promise<void>;
    serializeError: (error: unknown) => Record<string, unknown>;
    verifyDesktopUiRoute: (
      server: { inject: (request: { method: string; url: string }) => Promise<InjectResponse> },
      routePrefix: string
    ) => Promise<Record<string, unknown>>;
  };

function smokeImage(width = 1_040, height = 720, color = 0): SmokeImage {
  const bitmap = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    bitmap[offset] = color;
    bitmap[offset + 1] = color;
    bitmap[offset + 2] = color;
    bitmap[offset + 3] = 255;
  }
  return {
    getSize: () => ({ width, height }),
    toBitmap: () => bitmap,
    toPNG: () => Buffer.from("png")
  };
}

function desktopUiServer() {
  const inject = vi.fn(async ({ method, url }: { method: string; url: string }): Promise<InjectResponse> => {
    if (method === "GET" && url === "/desktop-ui/index.html") {
      return {
        body: '<div id="root"></div>',
        headers: {
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; object-src 'none'",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff"
        },
        statusCode: 200
      };
    }
    return { body: "", headers: {}, statusCode: 404 };
  });
  return { inject };
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ASSINI_DESKTOP_SMOKE_REPORT;
  delete process.env.ASSINI_DESKTOP_SMOKE_SCREENSHOT;
});

describe("desktop smoke module", () => {
  it("serializes Error diagnostics without assuming every thrown value is an Error", () => {
    expect(serializeError(new TypeError("bad render"))).toMatchObject({
      message: "bad render",
      name: "TypeError"
    });
    expect(serializeError("plain failure")).toEqual({ message: "plain failure" });
  });

  it("bounds renderer events and classifies only fatal renderer failures", () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const log = createSmokeEventLog({
      on: (event, handler) => {
        handlers.set(event, handler);
      }
    });

    for (let index = 0; index < 55; index += 1) {
      handlers.get("console-message")?.({
        level: "info",
        lineNumber: index,
        message: `message-${index}`,
        sourceId: "renderer"
      });
    }
    handlers.get("did-fail-load")?.({}, -3, "aborted", "https://example.test/asset", false);
    expect(log.events).toHaveLength(50);
    expect(log.fatal).toHaveLength(0);

    handlers.get("did-fail-load")?.({}, -105, "name not resolved", "https://example.test/", true);
    expect(log.fatal).toHaveLength(1);
    expect(log.fatal[0]).toMatchObject({ isMainFrame: true, errorCode: -105 });
  });

  it("accepts a materially rendered image and rejects undersized or blank captures", () => {
    expect(analyzeSmokeImage(smokeImage())).toMatchObject({
      height: 720,
      width: 1_040,
      nonWhiteRatio: 1
    });
    expect(() => analyzeSmokeImage(smokeImage(799, 600))).toThrow(/unexpectedly small window/);
    expect(() => analyzeSmokeImage(smokeImage(1_040, 720, 255))).toThrow(/blank or near-white/);
  });

  it("verifies the same-origin UI route and all forbidden request probes", async () => {
    const server = desktopUiServer();
    await expect(verifyDesktopUiRoute(server, "/desktop-ui")).resolves.toMatchObject({
      indexStatus: 200,
      rejectedStatuses: [404, 404, 404, 404]
    });
    expect(server.inject).toHaveBeenCalledTimes(5);
    expect(server.inject).toHaveBeenCalledWith({ method: "POST", url: "/desktop-ui/index.html" });
    expect(server.inject).toHaveBeenCalledWith({
      method: "GET",
      url: "/desktop-ui/%252e%252e%252fmain.cjs"
    });
  });

  it("runs the smoke composition through route, bridge, UI, and visual checks", async () => {
    vi.useFakeTimers();
    const server = desktopUiServer();
    const executeJavaScript = vi
      .fn()
      .mockResolvedValueOnce([true, true, true, { ok: true, status: 200 }, true])
      .mockResolvedValueOnce({ activeHeading: "Settings" });
    const mainWindow = {
      center: vi.fn(),
      setSize: vi.fn(),
      webContents: {
        capturePage: vi.fn(async () => smokeImage()),
        executeJavaScript
      }
    };
    const result = runDesktopSmoke(
      { baseUrl: "http://127.0.0.1:43123", server },
      { events: [], fatal: [] },
      {
        app: { isPackaged: false },
        desktopRuntime: { dataDir: "data", dbPath: "db", userDataDir: "user-data" },
        desktopUiRoutePrefix: "/desktop-ui",
        mainWindow,
        minWindowBounds: { width: 1_040, height: 720 }
      }
    );
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toBeUndefined();

    expect(mainWindow.setSize).toHaveBeenCalledWith(1_040, 720);
    expect(mainWindow.center).toHaveBeenCalledOnce();
    expect(executeJavaScript).toHaveBeenCalledTimes(2);
    expect(server.inject).toHaveBeenCalledTimes(5);
  });
});
