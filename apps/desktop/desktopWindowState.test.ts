import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createDesktopWindowState } = require("./desktopWindowState.cjs") as {
  createDesktopWindowState: (options: Record<string, unknown>) => {
    readWindowState: () => Record<string, unknown>;
    resetWindowLayout: () => Promise<Record<string, unknown>>;
  };
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("desktop window state", () => {
  it("uses safe fallback bounds and persists a reset through injected window dependencies", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "assini-window-state-"));
    temporaryRoots.push(userDataDir);
    const mainWindow = {
      center: vi.fn(),
      focus: vi.fn(),
      getBounds: vi.fn(() => ({ x: 20, y: 30, width: 1280, height: 860 })),
      getNormalBounds: vi.fn(() => ({ x: 20, y: 30, width: 1280, height: 860 })),
      isDestroyed: vi.fn(() => false),
      isMaximized: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      setSize: vi.fn(),
      show: vi.fn()
    };
    const state = createDesktopWindowState({
      app: { getPath: () => userDataDir },
      defaultWindowBounds: { width: 1280, height: 860 },
      desktopIpcFailure: vi.fn((error) => ({ ok: false, ...error })),
      getMainWindow: () => mainWindow,
      minWindowBounds: { width: 1040, height: 720 },
      noWindowError: { code: "NO_WINDOW" },
      screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] }
    });

    expect(state.readWindowState()).toEqual({ width: 1280, height: 860, maximized: false });
    await expect(state.resetWindowLayout()).resolves.toEqual({ ok: true, message: "Reset window layout." });
    expect(mainWindow.setSize).toHaveBeenCalledWith(1280, 860);
    expect(mainWindow.center).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(join(userDataDir, "window-state.json"), "utf8"))).toEqual({
      height: 860,
      maximized: false,
      width: 1280,
      x: 20,
      y: 30
    });
  });

  it("returns the structured IPC failure when no live window exists", async () => {
    const state = createDesktopWindowState({
      app: { getPath: () => "unused" },
      defaultWindowBounds: { width: 1280, height: 860 },
      desktopIpcFailure: (error: unknown) => ({ ok: false, error }),
      getMainWindow: () => null,
      minWindowBounds: { width: 1040, height: 720 },
      noWindowError: { code: "NO_WINDOW" },
      screen: { getAllDisplays: () => [] }
    });
    await expect(state.resetWindowLayout()).resolves.toEqual({
      ok: false,
      error: { code: "NO_WINDOW" }
    });
  });
});
