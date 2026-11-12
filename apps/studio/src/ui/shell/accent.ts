// User-selectable primary colour (Einstellungen → Akzentfarbe). All accent tones derive from it in CSS
// (color-mix), so one value themes chips, buttons, the agent card and links in light and dark mode.

export const ACCENT_STORAGE_KEY = 'ortis-studio-accent-v1';
export const DEFAULT_ACCENT = '#3e8e66';

export const ACCENT_PRESETS: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Salbei', value: '#3e8e66' },
  { name: 'Navy', value: '#00498b' },
  { name: 'Himmel', value: '#2f7ed8' },
  { name: 'Violett', value: '#7a5af5' },
  { name: 'Beere', value: '#c2417a' },
  { name: 'Koralle', value: '#e0613d' },
  { name: 'Senf', value: '#c79a1e' },
  { name: 'Graphit', value: '#4b5563' },
];

/** "#abc" / "#AABBCC" → "#aabbcc"; anything else → null. */
export function normalizeAccent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

export function loadAccent(storage: Pick<Storage, 'getItem'> | undefined = safe()): string {
  try {
    return normalizeAccent(storage?.getItem(ACCENT_STORAGE_KEY)) ?? DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function saveAccent(value: string, storage: Pick<Storage, 'setItem'> | undefined = safe()): void {
  try {
    storage?.setItem(ACCENT_STORAGE_KEY, value);
  } catch {
    /* not remembered */
  }
}

export function applyAccent(value: string, root: { style: { setProperty(k: string, v: string): void } } | undefined = globalThis.document?.documentElement): void {
  root?.style.setProperty('--w-accent', normalizeAccent(value) ?? DEFAULT_ACCENT);
}

function safe(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
