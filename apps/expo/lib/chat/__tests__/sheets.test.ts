import { defaultPopoverFrame, normalizeMenuGroups, popoverFrameFromPress, type ChatMenuItem } from '../sheets';

const item = (label: string, extra: Partial<ChatMenuItem> = {}): ChatMenuItem => ({ label, onPress: () => {}, ...extra });

describe('normalizeMenuGroups', () => {
  it('wraps a flat list into one group', () => {
    const out = normalizeMenuGroups([item('a'), item('b')]);
    expect(out).toHaveLength(1);
    expect(out[0].map((i) => i.label)).toEqual(['a', 'b']);
  });

  it('keeps groups, drops hidden items and empty groups', () => {
    const out = normalizeMenuGroups([[item('a'), item('x', { hidden: true })], [item('y', { hidden: true })], [item('b')]]);
    expect(out.map((g) => g.map((i) => i.label))).toEqual([['a'], ['b']]);
  });

  it('returns no groups for empty input', () => {
    expect(normalizeMenuGroups([])).toEqual([]);
  });
});

describe('popoverFrameFromPress', () => {
  it('anchors under the control, right-aligned to it', () => {
    // 44pt control at x=313..357, y=59..103 on a 375pt window; touched at its center.
    const f = popoverFrameFromPress(
      { pageX: 335, pageY: 81, locationX: 22, locationY: 22 },
      { windowWidth: 375, controlSize: 44 },
    );
    expect(f).toEqual({ top: 111, right: 18 });
  });

  it('clamps to the minimum edge distance', () => {
    const f = popoverFrameFromPress(
      { pageX: 380, pageY: 10, locationX: 0, locationY: 0 },
      { windowWidth: 375, controlSize: 44, gap: 4, minEdge: 9 },
    );
    expect(f.right).toBe(9);
    expect(f.top).toBe(58);
  });
});

describe('defaultPopoverFrame', () => {
  it('sits under a top-right header control', () => {
    expect(defaultPopoverFrame(47)).toEqual({ top: 107, right: 18 });
  });
});
