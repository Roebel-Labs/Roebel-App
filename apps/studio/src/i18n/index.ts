// Interface language. German is the source and the default: every string in the code is German,
// and `t('Speichern')` looks the German text up in the dictionary of the chosen language (falls
// back to the German text). So German needs no dictionary and a missing translation is never blank.
//
// Rules for callers:
//  - Call t() while rendering (or in an event handler), never at module level: a table of labels
//    defined at module level keeps its German strings and is translated where it is shown, t(label).
//  - Placeholders: t('Routine eingerichtet: {title}', { title }). No string concatenation.
//  - Dates and numbers: locale() instead of a hardcoded 'de-DE'.
//  - What goes on air (lower thirds, full screens, the show's own texts) is content, not interface:
//    it is never translated.
/// <reference types="vite/client" />
import { useSyncExternalStore } from 'react';

export type Lang = 'de' | 'en';
export const DEFAULT_LANG: Lang = 'de';
export const LANG_OPTIONS: ReadonlyArray<{ id: Lang; label: string }> = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
];

const KEY = 'ortis.lang';
const LOCALES: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

// Every file in ./en contributes entries (German text → English text), so screens can be
// translated independently without one shared file.
const modules = import.meta.glob<{ default: Record<string, string> }>('./en/*.ts', { eager: true });
const EN: Record<string, string> = Object.assign({}, ...Object.values(modules).map((m) => m.default));
const DICTS: Record<Lang, Record<string, string> | null> = { de: null, en: EN };

function safe(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function parseLang(raw: unknown): Lang {
  return raw === 'en' ? 'en' : DEFAULT_LANG;
}

let lang: Lang = parseLang(safe()?.getItem(KEY));
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    safe()?.setItem(KEY, next);
  } catch {
    /* private mode: the choice lasts for this session */
  }
  applyLang();
  for (const l of listeners) l();
}

/** Marks the document language (screen readers, hyphenation, spell check). */
export function applyLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current language; a component that uses it re-renders when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang, getLang);
}

/** BCP 47 tag for Intl and toLocale…String. */
export function locale(): string {
  return LOCALES[lang];
}

const fill = (text: string, vars?: Record<string, string | number>): string =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;

/** The German text in the chosen language, with {placeholders} filled in. */
export function t(de: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[lang];
  return fill(dict?.[de] ?? de, vars);
}

/** Every German string the English dictionary covers (tests). */
export const translatedKeys = (): string[] => Object.keys(EN);
