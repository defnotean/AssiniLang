import type { Theme, ThemeReader, ThemeStorage } from "./types";

export function getBrowserThemeStorage(): ThemeStorage | undefined {
  if (import.meta.env.MODE === "test") return undefined;
  if (typeof document === "undefined") return undefined;
  return document.defaultView?.localStorage;
}

export function getInitialTheme(storage: ThemeReader | undefined = getBrowserThemeStorage()): Theme {
  try {
    const stored = storage?.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Ignore localStorage failures in test runners or locked-down browsers.
  }
  return "dark";
}
