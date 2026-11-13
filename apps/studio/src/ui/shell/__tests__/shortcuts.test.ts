import { describe, expect, it } from 'vitest';
import { historyMove, historyPush, matchShortcut, shortcutHint, shortcutKeys, SHORTCUTS } from '../shortcuts';
import { applyTheme, parseTheme, resolveTheme, toggledTheme, loadTheme, saveTheme, THEME_STORAGE_KEY } from '../theme';
import { tipAnchor, tipNudge } from '../../Tooltip';
import { mainThreadOf, marqueeShift } from '../../../workspace/thread-list';
import { botInitial, isMecky } from '../../../workspace/BotAvatar';
import type { ChatThread } from '../../../workspace/types';

const ev = (key: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; repeat: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...o });

describe('keyboard shortcuts', () => {
  it('uses ⌘ on macOS and Ctrl elsewhere', () => {
    expect(matchShortcut(ev('k', { metaKey: true }), true)).toBe('search');
    expect(matchShortcut(ev('k', { ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(ev('K', { ctrlKey: true }), false)).toBe('search');
    expect(matchShortcut(ev('k', { metaKey: true }), false)).toBeNull();
  });

  it('never binds a plain key or a repeat', () => {
    expect(matchShortcut(ev('k'), true)).toBeNull();
    expect(matchShortcut(ev('n', { shiftKey: true }), true)).toBeNull();
    expect(matchShortcut(ev('n', { metaKey: true, repeat: true }), true)).toBeNull();
  });

  it('tells ⌘] (details) from ⌘⇧] (forward) and maps the section digits', () => {
    expect(matchShortcut(ev(']', { metaKey: true }), true)).toBe('togglePanel');
    expect(matchShortcut(ev('}', { metaKey: true, shiftKey: true }), true)).toBe('forward');
    expect(matchShortcut(ev(']', { metaKey: true, shiftKey: true }), true)).toBe('forward');
    expect(matchShortcut(ev('[', { metaKey: true }), true)).toBe('back');
    expect(['1', '2', '3', '4', '5'].map((k) => matchShortcut(ev(k, { metaKey: true }), true))).toEqual(['goHome', 'goForYou', 'goSkills', 'goWiki', 'goLibrary']);
    expect(matchShortcut(ev(',', { metaKey: true }), true)).toBe('settings');
    expect(matchShortcut(ev('b', { metaKey: true }), true)).toBe('toggleList');
    expect(matchShortcut(ev('n', { metaKey: true }), true)).toBe('newChat');
  });

  it('has no two shortcuts on the same combination', () => {
    const combos = SHORTCUTS.map((s) => `${s.shift ? 'S' : ''}${s.key.toLowerCase()}`);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('renders keycaps per platform', () => {
    expect(shortcutHint('search', true)).toBe('⌘ K');
    expect(shortcutHint('search', false)).toBe('Ctrl K');
    expect(shortcutKeys({ key: ']', shift: true }, true)).toEqual(['⌘', '⇧', ']']);
  });

  it('keeps a back/forward history of sections', () => {
    let h = { items: ['home'], at: 0 };
    h = historyPush(h, 'wiki');
    h = historyPush(h, 'wiki');
    h = historyPush(h, 'skills');
    expect(h).toEqual({ items: ['home', 'wiki', 'skills'], at: 2 });
    h = historyMove(h, -1);
    expect(h.items[h.at]).toBe('wiki');
    expect(historyMove(historyMove(h, -1), -1).at).toBe(0);
    // Going somewhere new after going back drops the forward entries.
    expect(historyPush(h, 'library')).toEqual({ items: ['home', 'wiki', 'library'], at: 2 });
    expect(historyMove({ items: ['home'], at: 0 }, 1).at).toBe(0);
  });
});

describe('appearance', () => {
  it('resolves System / Hell / Dunkel', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('sepia')).toBe('system');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('quick toggle flips the visible theme and returns to System when it matches the OS', () => {
    expect(toggledTheme('system', true)).toBe('light');
    expect(toggledTheme('light', true)).toBe('system');
    expect(toggledTheme('system', false)).toBe('dark');
    expect(toggledTheme('dark', false)).toBe('system');
  });

  it('stores the choice and marks a theme that differs from the system', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(loadTheme(st)).toBe('system');
    saveTheme('light', st);
    expect(m.get(THEME_STORAGE_KEY)).toBe('light');
    expect(loadTheme(st)).toBe('light');
    saveTheme('system', st);
    expect(m.has(THEME_STORAGE_KEY)).toBe(false);

    const root = { dataset: {} as Record<string, string | undefined> };
    expect(applyTheme('light', root, true)).toBe('light');
    expect(root.dataset).toEqual({ theme: 'light', themeForced: '' });
    applyTheme('system', root, true);
    expect(root.dataset).toEqual({ theme: 'dark' });
  });
});

describe('tooltip placement', () => {
  const rect = { left: 10, right: 44, top: 100, bottom: 134 };
  it('anchors right of rail icons and below top-bar icons', () => {
    expect(tipAnchor(rect, 'right')).toEqual({ x: 52, y: 117 });
    expect(tipAnchor(rect, 'bottom')).toEqual({ x: 27, y: 142 });
    expect(tipAnchor(rect, 'top')).toEqual({ x: 27, y: 92 });
  });
  it('nudges a tooltip back inside the window', () => {
    expect(tipNudge({ left: 900, right: 1030, top: 50, bottom: 76 }, { width: 1000, height: 700 })).toEqual({ dx: -38, dy: 0 });
    expect(tipNudge({ left: -20, right: 60, top: 690, bottom: 716 }, { width: 1000, height: 700 })).toEqual({ dx: 28, dy: -24 });
    expect(tipNudge({ left: 100, right: 200, top: 100, bottom: 126 }, { width: 1000, height: 700 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('Start sidebar', () => {
  const t = (id: string, botId: string, at: string, kind: 'direct' | 'group' = 'direct'): ChatThread => ({
    id, title: id, topic: null, kind, bots: [{ id: botId, name: botId, description: '', avatar: { shape: 'circle', color: '#000', eyes: 'dots' }, isPreset: true }], lastMessageAt: at, lastMessagePreview: '', unread: false,
  });
  it('finds the default assistant\'s main conversation', () => {
    const threads = [t('a', 'other', '2026-11-13T10:00:00Z'), t('b', 'mecky', '2026-11-12T10:00:00Z'), t('c', 'mecky', '2026-11-13T09:00:00Z', 'group'), t('d', 'mecky', '2026-11-11T10:00:00Z')];
    expect(mainThreadOf(threads, 'mecky')?.id).toBe('b');
    expect(mainThreadOf(threads, 'nobody')?.id).toBe('a');
    expect(mainThreadOf([], 'mecky')).toBeNull();
  });
  it('slides a title only when it overflows', () => {
    expect(marqueeShift(180, 200)).toBe(0);
    expect(marqueeShift(200.4, 200)).toBe(0);
    expect(marqueeShift(260, 200)).toBe(72);
  });
  it('gives Mecky the mascot and other assistants an initial', () => {
    expect(isMecky({ id: 'preset-mecky', name: 'Mecky' })).toBe(true);
    expect(isMecky({ id: 'x1', name: 'Mecky Recherche' })).toBe(true);
    expect(isMecky({ id: 'x2', name: 'Kassenwart' })).toBe(false);
    expect(botInitial(' kassenwart')).toBe('K');
    expect(botInitial('')).toBe('·');
  });
});
