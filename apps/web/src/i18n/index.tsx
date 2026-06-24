import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getBrowserThemeStorage } from "../lib/theme";
import { en, type MessageKey } from "./en";
import { ar } from "./ar";

export type { MessageKey } from "./en";
export type Locale = "en" | "ar";
export type Direction = "ltr" | "rtl";

export interface LocaleMeta {
  code: Locale;
  /** Endonym, shown in the language switcher in its own script. */
  label: string;
  dir: Direction;
}

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "workspace.locale";

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, ar };

export const LOCALE_META: LocaleMeta[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" }
];

export function localeDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

const TOKEN_PATTERN = /\{(\w+)\}/g;

/**
 * Builds a lookup function for a locale. Missing keys fall back to English and
 * then to the raw key, so a half-translated catalog degrades gracefully rather
 * than rendering blanks. `{token}` placeholders are filled from `vars`.
 */
export function createTranslator(locale: Locale): Translate {
  const table = CATALOGS[locale] ?? en;
  return (key, vars) => {
    const template = table[key] ?? en[key] ?? key;
    if (!vars) return template;
    return template.replace(TOKEN_PATTERN, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  };
}

export function getInitialLocale(storage = getBrowserThemeStorage()): Locale {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "ar") return stored;
  } catch {
    // Ignore localStorage failures in test runners or locked-down browsers.
  }
  return DEFAULT_LOCALE;
}

export interface I18nContextValue {
  locale: Locale;
  dir: Direction;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

// The default value is a fully functional English translator. Components
// rendered outside a provider (notably the test suite, which mounts views
// directly) therefore behave exactly as they did before i18n existed.
const DEFAULT_CONTEXT: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  dir: localeDirection(DEFAULT_LOCALE),
  t: createTranslator(DEFAULT_LOCALE),
  setLocale: () => {}
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

export function I18nProvider({
  children,
  initialLocale
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? getInitialLocale());
  const dir = localeDirection(locale);
  const t = useMemo(() => createTranslator(locale), [locale]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.lang = locale;
    root.dir = dir;
    try {
      getBrowserThemeStorage()?.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore localStorage failures in test runners or locked-down browsers.
    }
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir, t, setLocale }),
    [locale, dir, t, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
