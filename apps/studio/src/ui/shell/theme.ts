// Appearance (Einstellungen → Darstellung): System / Hell / Dunkel. The resolved theme is written to
// <html data-theme>, which the --w tokens in shell.css follow. "System" tracks prefers-color-scheme live.
// index.html applies the stored choice before the first paint with the same key and rules.

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ortis-studio-theme-v1';
export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeChoice; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
];

export function parseTheme(raw: unknown): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

/** Quick toggle: flips what is on screen; choosing the system's own appearance goes back to "System". */
export function toggledTheme(choice: ThemeChoice, systemDark: boolean): ThemeChoice {
  const next: Theme = resolveTheme(choice, systemDark) === 'dark' ? 'light' : 'dark';
  return next === resolveTheme('system', systemDark) ? 'system' : next;
}

export function loadTheme(storage: Pick<Storage, 'getItem'> | undefined = safe()): ThemeChoice {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function saveTheme(choice: ThemeChoice, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safe()): void {
  try {
    if (choice === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* not remembered */
  }
}

const QUERY = '(prefers-color-scheme: dark)';
const systemDark = (): boolean => {
  try {
    return !!globalThis.matchMedia?.(QUERY).matches;
  } catch {
    return false;
  }
};
export const isSystemDark = systemDark;

type Root = { dataset: Record<string, string | undefined> };

/**
 * Writes the resolved theme to the root element. `themeForced` marks a choice that differs from the
 * system: the native macOS glass behind the frame keeps following the system, so the frame is painted
 * opaque then (see shell.css).
 */
export function applyTheme(choice: ThemeChoice, root: Root | undefined = globalThis.document?.documentElement, dark = systemDark()): Theme {
  const theme = resolveTheme(choice, dark);
  if (root) {
    root.dataset.theme = theme;
    if (theme !== resolveTheme('system', dark)) root.dataset.themeForced = '';
    else delete root.dataset.themeForced;
  }
  return theme;
}

const listeners = new Set<(c: ThemeChoice) => void>();
let current: ThemeChoice | null = null;

export function currentTheme(): ThemeChoice {
  return current ?? (current = loadTheme());
}

/** Saves and applies a choice and tells every open control (settings, account menu). */
export function setTheme(choice: ThemeChoice): void {
  current = choice;
  saveTheme(choice);
  applyTheme(choice);
  for (const l of listeners) l(choice);
}

export function onThemeChange(fn: (c: ThemeChoice) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Call once at startup: applies the stored choice and keeps "System" in step with the OS. */
export function initTheme(): void {
  applyTheme(currentTheme());
  try {
    globalThis.matchMedia?.(QUERY).addEventListener('change', () => {
      applyTheme(currentTheme());
      for (const l of listeners) l(currentTheme());
    });
  } catch {
    /* no matchMedia: the stored or light theme stays */
  }
}

function safe(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
