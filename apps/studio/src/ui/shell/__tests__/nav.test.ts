import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION, loadSection, parseSection, saveSection, SECTION_STORAGE_KEY, visibleLiveTab } from '../nav';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('shell navigation', () => {
  it('defaults to the livestream for unknown or missing values', () => {
    expect(DEFAULT_SECTION).toBe('live');
    expect(parseSection(null)).toBe('live');
    expect(parseSection('workspace')).toBe('live');
    expect(parseSection('home')).toBe('home');
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
    expect(loadSection(broken)).toBe('live');
    expect(() => saveSection('home', broken)).not.toThrow();
  });

  it('binds show hotkeys only while the livestream section is open', () => {
    expect(visibleLiveTab('live', 'show')).toBe('show');
    expect(visibleLiveTab('live', 'design')).toBe('design');
    expect(visibleLiveTab('home', 'show')).toBeNull();
    expect(visibleLiveTab('apps', 'show')).toBeNull();
  });
});
