import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION, loadSection, parseSection, saveSection, SECTION_STORAGE_KEY, SECTIONS, visibleLiveTab } from '../nav';
import { SECTION_ICONS } from '../icons';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('shell navigation', () => {
  it('defaults to the workspace for unknown or missing values', () => {
    expect(DEFAULT_SECTION).toBe('home');
    expect(parseSection(null)).toBe('home');
    expect(parseSection('workspace')).toBe('home');
    expect(parseSection('live')).toBe('live');
  });

  it('lists the personal-context sections between Start and the livestream', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['home', 'foryou', 'skills', 'wiki', 'library', 'live', 'apps']);
    for (const id of ['foryou', 'skills', 'wiki', 'library'] as const) expect(parseSection(id)).toBe(id);
    for (const s of SECTIONS) expect(typeof SECTION_ICONS[s.id]).toBe('function');
  });

  it('remembers the last section', () => {
    const s = memory();
    saveSection('apps', s);
    expect(s.m.get(SECTION_STORAGE_KEY)).toBe('apps');
    expect(loadSection(s)).toBe('apps');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSection(broken)).toBe('home');
    expect(() => saveSection('home', broken)).not.toThrow();
  });

  it('binds show hotkeys only while the livestream section is open', () => {
    expect(visibleLiveTab('live', 'show')).toBe('show');
    expect(visibleLiveTab('live', 'design')).toBe('design');
    expect(visibleLiveTab('home', 'show')).toBeNull();
    expect(visibleLiveTab('apps', 'show')).toBeNull();
    expect(visibleLiveTab('wiki', 'show')).toBeNull();
  });
});
