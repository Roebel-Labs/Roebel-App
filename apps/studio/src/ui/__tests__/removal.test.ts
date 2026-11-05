import { describe, expect, it } from 'vitest';
import { initialState, showReducer } from '../../state/reducer';
import type { ShowState } from '../../state/types';
import { removalPlan } from '../show/removal';

function setup() {
  let s = initialState();
  s = showReducer(s, { type: 'addSource', source: { id: 'a', kind: 'color', label: 'A', color: '#f00' } });
  s = showReducer(s, { type: 'addSource', source: { id: 'b', kind: 'color', label: 'B', color: '#00f' } });
  s = showReducer(s, { type: 'addScene', scene: { id: 'split', label: 'A | B', layout: 'split', sourceIds: ['a', 'b'] } });
  const [fa, fb] = s.scenes;
  return { s, fa: fa.id, fb: fb.id };
}
const live = (s: ShowState, id: string): ShowState => ({ ...s, programSceneId: id });

describe('removalPlan', () => {
  it('removing a full scene removes its source and every scene that uses it', () => {
    const { s, fa } = setup();
    const p = removalPlan(s, fa);
    expect(p.action).toEqual({ type: 'removeSource', id: 'a' });
    expect(p.affectedSceneIds.sort()).toEqual([fa, 'split'].sort());
    expect(p.blockedByLive).toBe(false);
  });

  it('is blocked when a split using that source is live', () => {
    const { s, fa } = setup();
    expect(removalPlan(live(s, 'split'), fa).blockedByLive).toBe(true);
  });

  it('is blocked when the scene is the outgoing side of a running transition', () => {
    const { s, fa, fb } = setup();
    const t: ShowState = { ...s, programSceneId: fb, transition: { ...s.transition, startedAt: 1, fromSceneId: fa } };
    expect(removalPlan(t, fa).blockedByLive).toBe(true);
  });

  it('removing a split only removes that scene, and is fine while a full scene is live', () => {
    const { s, fa } = setup();
    const p = removalPlan(live(s, fa), 'split');
    expect(p.action).toEqual({ type: 'removeScene', id: 'split' });
    expect(p.blockedByLive).toBe(false);
  });

  it('the live scene itself is blocked', () => {
    const { s, fb } = setup();
    expect(removalPlan(live(s, fb), fb).blockedByLive).toBe(true);
  });
});
