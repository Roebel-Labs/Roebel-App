import { describe, expect, it } from 'vitest';
import { decideOnStage, followOnAir } from '../stage-sync';

const base = {
  auto: true,
  connected: true,
  currentRowId: 'r2',
  lastHandledRowId: 'r1',
  appCurrentItemId: 'i1',
  resolveItem: (id: string) => ({ r1: 'i1', r2: 'i2' })[id] ?? null,
};

describe('decideOnStage', () => {
  it('sends when the current row changed to a mapped item', () => {
    expect(decideOnStage(base)).toEqual({ kind: 'send', rowId: 'r2', itemId: 'i2' });
  });
  it('does nothing when off, disconnected, unchanged or no row', () => {
    expect(decideOnStage({ ...base, auto: false }).kind).toBe('none');
    expect(decideOnStage({ ...base, connected: false }).kind).toBe('none');
    expect(decideOnStage({ ...base, lastHandledRowId: 'r2' }).kind).toBe('none');
    expect(decideOnStage({ ...base, currentRowId: null }).kind).toBe('none');
  });
  it('skips when the app already shows that item', () => {
    expect(decideOnStage({ ...base, appCurrentItemId: 'i2' }).kind).toBe('none');
  });
  it('reports rows that are not in the app', () => {
    expect(decideOnStage({ ...base, currentRowId: 'r9' })).toEqual({ kind: 'unmapped', rowId: 'r9' });
  });
});

describe('followOnAir', () => {
  it('goes LIVE when the studio starts sending', () => {
    expect(followOnAir(false, true, 'scheduled')).toBe('live');
    expect(followOnAir(null, true, 'ended')).toBe('live');
    expect(followOnAir(false, true, 'live')).toBeNull();
  });
  it('only asks (never ends) when the studio stops', () => {
    expect(followOnAir(true, false, 'live')).toBe('ask-end');
    expect(followOnAir(true, false, 'scheduled')).toBeNull();
    expect(followOnAir(null, false, 'live')).toBeNull();
  });
  it('ignores repeats', () => {
    expect(followOnAir(true, true, 'scheduled')).toBeNull();
  });
});
