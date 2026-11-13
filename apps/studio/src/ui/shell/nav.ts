// Top-level navigation of Ortis Studio: the left rail picks a section, the livestream is one of them.
// Pure helpers only (tested); the components live next to this file.

export type Section = 'home' | 'foryou' | 'skills' | 'wiki' | 'library' | 'live' | 'apps';
/** Everything the content frame can show: the rail sections plus pages reached from elsewhere. */
export type AppSection = Section | 'agent';
export type LiveTab = 'show' | 'design' | 'table' | 'liveroom' | 'settings' | 'help';

export const SECTIONS: ReadonlyArray<{ id: Section; label: string; soon?: boolean }> = [
  { id: 'home', label: 'Start' },
  { id: 'foryou', label: 'Für dich' },
  { id: 'skills', label: 'Funktionen' },
  { id: 'wiki', label: 'Wiki' },
  { id: 'library', label: 'Bibliothek' },
  { id: 'live', label: 'Livestream' },
  { id: 'apps', label: 'Mini-Apps' },
];

/** Own key, never part of ShowState (which is autosaved and broadcast to the overlay page). */
export const SECTION_STORAGE_KEY = 'ortis-studio-section-v1';

/** The multi-agent workspace is the main product (Max, 2026-11-12); the livestream is one section. */
export const DEFAULT_SECTION: Section = 'home';

export function parseSection(raw: unknown): Section {
  return SECTIONS.some((s) => s.id === raw) ? (raw as Section) : DEFAULT_SECTION;
}

export function loadSection(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Section {
  try {
    return parseSection(storage?.getItem(SECTION_STORAGE_KEY));
  } catch {
    return DEFAULT_SECTION;
  }
}

export function saveSection(section: Section, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(SECTION_STORAGE_KEY, section);
  } catch {
    /* private mode or blocked storage: the choice just is not remembered */
  }
}

/**
 * The livestream tab that is actually on screen, or null when another section is open.
 * Show hotkeys (TAKE, cut, presets) bind only to this, so typing in the workspace never cuts the program.
 */
export function visibleLiveTab(section: Section, tab: LiveTab): LiveTab | null {
  return section === 'live' ? tab : null;
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
