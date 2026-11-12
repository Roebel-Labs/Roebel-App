import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, ACCENT_STORAGE_KEY, applyAccent, DEFAULT_ACCENT, loadAccent, normalizeAccent, saveAccent } from '../accent';

describe('accent colour', () => {
  it('normalizes hex values and rejects everything else', () => {
    expect(normalizeAccent('#ABC')).toBe('#aabbcc');
    expect(normalizeAccent(' #00498B ')).toBe('#00498b');
    expect(normalizeAccent('red')).toBeNull();
    expect(normalizeAccent('#12345')).toBeNull();
    expect(normalizeAccent('url(x)')).toBeNull();
  });
  it('round-trips through storage and falls back to the default', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadAccent(st)).toBe(DEFAULT_ACCENT);
    saveAccent('#7a5af5', st);
    expect(m.get(ACCENT_STORAGE_KEY)).toBe('#7a5af5');
    expect(loadAccent(st)).toBe('#7a5af5');
    m.set(ACCENT_STORAGE_KEY, 'javascript:1');
    expect(loadAccent(st)).toBe(DEFAULT_ACCENT);
  });
  it('sets only a validated value on the root', () => {
    const set: Record<string, string> = {};
    const root = { style: { setProperty: (k: string, v: string) => void (set[k] = v) } };
    applyAccent('#c2417a', root);
    expect(set['--w-accent']).toBe('#c2417a');
    applyAccent('bad', root);
    expect(set['--w-accent']).toBe(DEFAULT_ACCENT);
    expect(ACCENT_PRESETS[0].value).toBe(DEFAULT_ACCENT);
  });
});
