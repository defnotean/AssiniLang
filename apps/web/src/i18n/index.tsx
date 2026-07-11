import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { en, type MessageKey } from "./en";

export type { MessageKey } from "./en";
export type Locale = "en";
export type Direction = "ltr";

export const DEFAULT_LOCALE: Locale = "en";

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

const TOKEN_PATTERN = /\{(\w+)\}/g;

/** Builds the English lookup and preserves raw keys for any missing translation. */
export function createTranslator(_locale: Locale = DEFAULT_LOCALE): Translate {
  return (key, vars) => {
    const template = en[key] ?? key;
    if (!vars) return template;
    return template.replace(TOKEN_PATTERN, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  };
}

export interface I18nContextValue {
  locale: Locale;
  dir: Direction;
  t: Translate;
}

const DEFAULT_CONTEXT: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  dir: "ltr",
  t: createTranslator()
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

export function I18nProvider({ children }: { children: ReactNode; initialLocale?: Locale }) {
  const locale = DEFAULT_LOCALE;
  const dir = "ltr";
  const t = useMemo(() => createTranslator(), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }, []);

  const value = useMemo<I18nContextValue>(() => ({ locale, dir, t }), [locale, dir, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
