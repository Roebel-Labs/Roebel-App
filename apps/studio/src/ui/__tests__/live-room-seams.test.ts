import { describe, expect, it } from 'vitest';
import { broadcasting } from '../live-room-seams';

const air = (phase: string, recordOnly?: boolean) => ({ get: () => ({ phase, status: recordOnly === undefined ? null : { recordOnly } }) }) as never;

describe('broadcasting (Live-Raum on-air follow)', () => {
  it('is true only while a stream really goes out', () => {
    expect(broadcasting(air('on', false))).toBe(true);
    expect(broadcasting(air('on'))).toBe(true);
    expect(broadcasting(air('on', true))).toBe(false); // "Nur aufnehmen" never puts the app on LIVE
    expect(broadcasting(air('starting'))).toBe(false);
    expect(broadcasting(air('off'))).toBe(false);
  });
});
