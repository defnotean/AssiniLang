const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

function createDesktopWindowState({
  app,
  defaultWindowBounds,
  desktopIpcFailure,
  getMainWindow,
  minWindowBounds,
  noWindowError,
  screen
}) {
  function windowStatePath() {
    return path.join(app.getPath("userData"), "window-state.json");
  }

  function ensureVisibleWindowBounds(bounds) {
    if (bounds.x == null || bounds.y == null) return bounds;
    const windowArea = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(minWindowBounds.width, bounds.width),
      height: Math.max(minWindowBounds.height, bounds.height)
    };
    const intersectsDisplay = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        windowArea.x < area.x + area.width &&
        windowArea.x + windowArea.width > area.x &&
        windowArea.y < area.y + area.height &&
        windowArea.y + windowArea.height > area.y
      );
    });
    if (intersectsDisplay) return bounds;

    return {
      width: bounds.width,
      height: bounds.height,
      maximized: bounds.maximized
    };
  }

  function readWindowState() {
    const fallback = { ...defaultWindowBounds, maximized: false };
    try {
      const parsed = JSON.parse(readFileSync(windowStatePath(), "utf8"));
      const width = Math.max(minWindowBounds.width, Number.parseInt(parsed.width, 10));
      const height = Math.max(minWindowBounds.height, Number.parseInt(parsed.height, 10));
      const bounds = {
        width: Number.isFinite(width) ? width : fallback.width,
        height: Number.isFinite(height) ? height : fallback.height,
        maximized: parsed.maximized === true
      };
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        bounds.x = parsed.x;
        bounds.y = parsed.y;
      }
      return ensureVisibleWindowBounds(bounds);
    } catch {
      return fallback;
    }
  }

  function writeWindowState(window) {
    try {
      if (!window || window.isDestroyed()) return;
      const maximized = window.isMaximized();
      const normalBounds = typeof window.getNormalBounds === "function" ? window.getNormalBounds() : window.getBounds();
      const bounds = maximized ? normalBounds : window.getBounds();
      mkdirSync(app.getPath("userData"), { recursive: true });
      writeFileSync(
        windowStatePath(),
        JSON.stringify(
          {
            height: bounds.height,
            maximized,
            width: bounds.width,
            x: bounds.x,
            y: bounds.y
          },
          null,
          2
        )
      );
    } catch {
      // Window-state persistence is a convenience; never block shutdown on it.
    }
  }

  function applyWindowState(window, state) {
    if (state.maximized) {
      window.once("ready-to-show", () => {
        if (!window.isDestroyed()) window.maximize();
      });
    }
  }

  async function resetWindowLayout() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return desktopIpcFailure(noWindowError);
    }
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setSize(defaultWindowBounds.width, defaultWindowBounds.height);
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
    writeWindowState(mainWindow);
    return { ok: true, message: "Reset window layout." };
  }

  return { applyWindowState, readWindowState, resetWindowLayout, writeWindowState };
}

module.exports = { createDesktopWindowState };
