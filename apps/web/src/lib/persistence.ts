import { getBrowserThemeStorage } from "./theme";
import type { ThemeReader, ThemeStorage, ViewMode } from "./types";
import { VIEW_ORDER } from "./viewConfig";

const VIEW_KEY = "workspace.view";
const LANGUAGE_KEY = "workspace.languageId";

const LEGACY_VIEW_MAP: Partial<Record<ViewMode, ViewMode>> = {
  corpus: "profile",
  review: "ingest",
  elder: "ingest",
  assistant: "learner",
  eval: "model",
  governance: "model"
};

export function getInitialView(storage: ThemeReader | undefined = getBrowserThemeStorage()): ViewMode {
  try {
    const stored = storage?.getItem(VIEW_KEY);
    if (stored && (VIEW_ORDER as string[]).includes(stored)) return stored as ViewMode;
    if (stored && stored in LEGACY_VIEW_MAP) return LEGACY_VIEW_MAP[stored as ViewMode] ?? "profile";
  } catch {
    // Ignore localStorage failures in test runners or locked-down browsers.
  }
  return "profile";
}

export function getStoredLanguageId(storage: ThemeReader | undefined = getBrowserThemeStorage()): string | null {
  try {
    const stored = storage?.getItem(LANGUAGE_KEY);
    return stored && stored.trim().length > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function persistWorkspaceSelection(
  view: ViewMode,
  languageId: string | null,
  storage: ThemeStorage | undefined = getBrowserThemeStorage()
): void {
  try {
    storage?.setItem(VIEW_KEY, view);
    storage?.setItem(LANGUAGE_KEY, languageId ?? "");
  } catch {
    // Ignore localStorage failures in test runners or locked-down browsers.
  }
}
