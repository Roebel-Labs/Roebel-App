import { describe, expect, it } from 'vitest';
import { classifyTarget, hotkeyAction } from '../hotkeys';
import { initialState, showReducer } from '../../state/reducer';
import type { ShowState } from '../../state/types';

function show(): ShowState {
  let s = initialState();
  s = showReducer(s, { type: 'addSource', source: { kind: 'color', label: 'Rot', color: '#f00' } });
  s = showReducer(s, { type: 'addSource', source: { kind: 'color', label: 'Blau', color: '#00f' } });
  s = showReducer(s, { type: 'addSource', source: { kind: 'color', label: 'Grün', color: '#0f0' } });
  return s;
}

const key = (k: string, code: string, extra: Partial<{ target: 'input' | 'other'; shift: boolean }> = {}) => ({
  key: k,
  code,
  target: 'other' as const,
  shift: false,
  ...extra,
});

describe('hotkeyAction', () => {
  const s = show();

  it('Space and Enter take', () => {
    expect(hotkeyAction(key(' ', 'Space'), s)).toMatchObject({ type: 'take' });
    expect(hotkeyAction(key('Enter', 'Enter'), s)).toMatchObject({ type: 'take' });
    expect(hotkeyAction(key('Enter', 'NumpadEnter'), s)).toMatchObject({ type: 'take' });
  });

  it('c cuts', () => {
    expect(hotkeyAction(key('c', 'KeyC'), s)).toEqual({ type: 'cut' });
  });

  it('1–9 put the n-th scene into preview', () => {
    expect(hotkeyAction(key('1', 'Digit1'), s)).toEqual({ type: 'setPreview', sceneId: s.scenes[0].id });
    expect(hotkeyAction(key('3', 'Digit3'), s)).toEqual({ type: 'setPreview', sceneId: s.scenes[2].id });
    expect(hotkeyAction(key('2', 'Numpad2'), s)).toEqual({ type: 'setPreview', sceneId: s.scenes[1].id });
  });

  it('a digit without a scene does nothing', () => {
    expect(hotkeyAction(key('9', 'Digit9'), s)).toBeNull();
  });

  it('l toggles the first lower third', () => {
    const lt = s.overlays.find((o) => s.templates.find((t) => t.id === o.templateId)?.kind === 'lowerThird')!;
    expect(hotkeyAction(key('l', 'KeyL'), s)).toMatchObject({ type: 'toggleOverlay', id: lt.id });
  });

  it('b toggles the logo bug', () => {
    const bug = s.overlays.find((o) => s.templates.find((t) => t.id === o.templateId)?.kind === 'logoBug')!;
    expect(hotkeyAction(key('b', 'KeyB'), s)).toMatchObject({ type: 'toggleOverlay', id: bug.id });
  });

  it('l without a lower third does nothing', () => {
    expect(hotkeyAction(key('l', 'KeyL'), { ...s, overlays: [] })).toBeNull();
  });

  it('n advances the table row', () => {
    expect(hotkeyAction(key('n', 'KeyN'), s)).toEqual({ type: 'nextRow' });
  });

  it('works with caps lock / German layout via code', () => {
    expect(hotkeyAction(key('C', 'KeyC'), s)).toEqual({ type: 'cut' });
  });

  it('ignores every key while typing in a field', () => {
    for (const k of [key(' ', 'Space'), key('Enter', 'Enter'), key('c', 'KeyC'), key('1', 'Digit1'), key('l', 'KeyL'), key('n', 'KeyN')]) {
      expect(hotkeyAction({ ...k, target: 'input' }, s)).toBeNull();
    }
  });

  it('Shift+Enter does not go on air', () => {
    expect(hotkeyAction(key('Enter', 'Enter', { shift: true }), s)).not.toBe('goLive');
    expect(hotkeyAction(key('Enter', 'Enter', { shift: true }), s)).toBeNull();
  });

  it('unbound keys return null', () => {
    expect(hotkeyAction(key('x', 'KeyX'), s)).toBeNull();
  });
});

describe('classifyTarget', () => {
  it('text-like fields swallow hotkeys', () => {
    expect(classifyTarget({ tag: 'INPUT', type: 'text' })).toBe('input');
    expect(classifyTarget({ tag: 'INPUT', type: 'password' })).toBe('input');
    expect(classifyTarget({ tag: 'INPUT', type: 'number' })).toBe('input');
    expect(classifyTarget({ tag: 'INPUT' })).toBe('input');
    expect(classifyTarget({ tag: 'TEXTAREA' })).toBe('input');
    expect(classifyTarget({ tag: 'SELECT' })).toBe('input');
    expect(classifyTarget({ tag: 'DIV', editable: true })).toBe('input');
  });

  it('a focused slider, checkbox or colour well keeps the hotkeys working', () => {
    for (const type of ['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset']) {
      expect(classifyTarget({ tag: 'INPUT', type })).toBe('other');
    }
    expect(classifyTarget({ tag: 'BUTTON' })).toBe('other');
  });

  it('Space after dragging the duration slider still takes', () => {
    const s = show();
    const target = classifyTarget({ tag: 'INPUT', type: 'range' });
    expect(hotkeyAction(key(' ', 'Space', { target }), s)).toMatchObject({ type: 'take' });
  });
});
