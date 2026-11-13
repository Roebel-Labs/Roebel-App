// User-selectable primary colour (Einstellungen → Akzentfarbe). All accent tones derive from it in CSS
// (color-mix), so one value themes chips, buttons, the agent card and links in light and dark mode.

export const ACCENT_STORAGE_KEY = 'ortis-studio-accent-v1';
export const DEFAULT_ACCENT = '#3a8872';
/** The default before 0.3.2; a stored copy of it means "never chose a colour". */
const LEGACY_DEFAULT = '#3e8e66';

export const ACCENT_PRESETS: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Salbei', value: '#3a8872' },
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
    const v = normalizeAccent(storage?.getItem(ACCENT_STORAGE_KEY));
    return !v || v === LEGACY_DEFAULT ? DEFAULT_ACCENT : v;
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

type AccentRoot = { style: { setProperty(k: string, v: string): void }; dataset?: Record<string, string | undefined> };

/**
 * Sets the accent. With the default green the agent card and avatar tile use their fixed reference
 * colours; any other colour marks the root `data-accent="custom"` so they are derived from it (shell.css).
 */
export function applyAccent(value: string, root: AccentRoot | undefined = globalThis.document?.documentElement): void {
  const v = normalizeAccent(value) ?? DEFAULT_ACCENT;
  root?.style.setProperty('--w-accent', v);
  if (root?.dataset) {
    if (v === DEFAULT_ACCENT) delete root.dataset.accent;
    else root.dataset.accent = 'custom';
  }
}

function safe(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
