"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Language, t as translate, translations } from "./translations";

const STORAGE_KEY = "language";
const DEFAULT_LANGUAGE: Language = "si"; // existing game is primarily Sinhala

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "en" || raw === "si" ? raw : DEFAULT_LANGUAGE;
}

type Key = keyof typeof translations.si;

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: Key, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => readStoredLanguage());

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback((key: Key, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** `{ lang, setLang, t }` — `t("menu.createRoom")` style lookups against the
 * centralized dictionary in translations.ts. Must be used under LanguageProvider. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
