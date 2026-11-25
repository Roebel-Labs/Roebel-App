jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../gate', () => ({ isCredentialsAllowed: async () => false }));
jest.mock('../api', () => ({ fetchPublicEventBadge: async () => null }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { badgeForScan, momentFor, scanGate, scanOutcome, stateFromClaim, type BadgeInfo, type CollectState } from '../collect';
import { collectQueueKey, enqueueCollect } from '../collect-queue';
import { assertCleanCopy } from '../copy';

const BADGE: BadgeInfo = { eventId: 'ev-1', eventTitle: 'Sommerfest', eventDate: '2026-12-05', name: 'Dabei: Sommerfest', imageUrl: null };
const ADDR = '0x' + 'ab'.repeat(20);

describe('collect', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('maps paid, already_claimed and each rejection reason to the right state', () => {
    expect(stateFromClaim({ status: 'paid', amountAtto: '5000000000000000000', txHash: '0x1' }, BADGE)).toEqual({ kind: 'collected', muenzen: 5, badge: BADGE, pending: true });
    expect(stateFromClaim({ status: 'paid', amountAtto: '2000000000000000000', txHash: '0x1' }, null)).toEqual({ kind: 'collected', muenzen: 2, badge: null, pending: false });
    expect(stateFromClaim({ status: 'already_claimed' }, BADGE)).toEqual({ kind: 'already', badge: BADGE });
    expect(stateFromClaim({ status: 'rejected', reason: 'event not started' }, BADGE)).toEqual({ kind: 'not_started' });
    expect(stateFromClaim({ status: 'rejected', reason: 'event ended' }, BADGE)).toEqual({ kind: 'ended' });
    expect(stateFromClaim({ status: 'rejected', reason: 'event reward budget reached' }, null)).toEqual({ kind: 'budget_reached' });
    expect(stateFromClaim({ status: 'rejected', reason: 'unknown event' }, null)).toEqual({ kind: 'invalid' });
    expect(stateFromClaim({ status: 'rejected' }, null)).toEqual({ kind: 'invalid' });
    expect(stateFromClaim({ status: 'failed', reason: 'boom' }, null)).toEqual({ kind: 'error', message: 'boom' });
  });

  it('momentFor(collected) says "Abzeichen erhalten", thanks the guest and never mentions Röbel Münzen', () => {
    const m = momentFor({ kind: 'collected', muenzen: 5, badge: BADGE, pending: true });
    expect(m.headline).toBe('Abzeichen erhalten');
    expect(m.lines).toEqual(['Danke, dass du dabei warst.']);
    expect(m.tone).toBe('success');
    expect(m.stampState).toBe('pending');
    expect(m.actions).toEqual(['erhalten']);
    const plain = momentFor({ kind: 'collected', muenzen: 5, badge: null, pending: false });
    expect(JSON.stringify(plain)).not.toMatch(/Münzen/);
    expect(plain).toMatchObject({ headline: 'Danke fürs Dabeisein!', actions: ['weiter'] });
    expect(momentFor({ kind: 'already', badge: BADGE })).toMatchObject({ headline: 'Schon gesammelt', tone: 'info', stampState: 'collected', actions: ['erhalten'] });
    expect(momentFor({ kind: 'not_started' })).toMatchObject({ headline: 'Noch nicht gestartet', lines: ['Komm zum Beginn der Veranstaltung wieder.'] });
    expect(momentFor({ kind: 'ended' })).toMatchObject({ headline: 'Vorbei', lines: ['Diese Veranstaltung ist zu Ende.'] });
    expect(momentFor({ kind: 'invalid' }).headline).toBe('Dieser Code ist nicht gültig.');
    expect(momentFor({ kind: 'queued', badge: BADGE })).toMatchObject({
      headline: 'Gleich gesammelt',
      lines: ['Du bist offline. Wir sammeln dein Abzeichen, sobald du wieder online bist.'],
      stampState: 'queued',
    });
    expect(momentFor({ kind: 'signed_out' })).toMatchObject({ headline: 'Bitte zuerst anmelden.', actions: ['anmelden'] });
  });

  it('no copy produced by momentFor fails assertCleanCopy', () => {
    const states: CollectState[] = [
      { kind: 'working' },
      { kind: 'collected', muenzen: 3, badge: BADGE, pending: true },
      { kind: 'collected', muenzen: 3, badge: null, pending: false },
      { kind: 'already', badge: BADGE },
      { kind: 'already', badge: null },
      { kind: 'not_started' },
      { kind: 'ended' },
      { kind: 'budget_reached' },
      { kind: 'invalid' },
      { kind: 'queued', badge: BADGE },
      { kind: 'queued', badge: null },
      { kind: 'signed_out' },
      { kind: 'error', message: 'Netzwerkfehler' },
    ];
    const texts = states.flatMap((s) => {
      const m = momentFor(s);
      return [m.headline, ...m.lines];
    });
    expect(assertCleanCopy(texts)).toEqual([]);
  });

  it('a network failure on scan enqueues once and yields queued', async () => {
    const claim = jest.fn(async () => ({ status: 'failed' as const, reason: 'Failed to send a request to the Edge Function' }));
    const first = await scanOutcome(ADDR, 'rev-1', BADGE, { claim, online: async () => true });
    expect(first).toEqual({ kind: 'queued', badge: BADGE });
    // Offline from the start: no claim at all, still queued, and the queue holds the scan once.
    const second = await scanOutcome(ADDR, 'rev-1', null, { claim, online: async () => false });
    expect(second).toEqual({ kind: 'queued', badge: null });
    expect(claim).toHaveBeenCalledTimes(1);
    const q = JSON.parse((await AsyncStorage.getItem(collectQueueKey(ADDR))) ?? '[]');
    expect(q.map((e: { eventId: string }) => e.eventId)).toEqual(['rev-1']);
    // A server-side failure is an error, not a queued scan.
    const err = await scanOutcome(ADDR, 'rev-2', null, { claim: async () => ({ status: 'failed' as const, reason: 'Edge Function returned a non-2xx status code' }), online: async () => true });
    expect(err.kind).toBe('error');
    await enqueueCollect(ADDR, 'rev-1');
    expect(JSON.parse((await AsyncStorage.getItem(collectQueueKey(ADDR))) ?? '[]')).toHaveLength(1);
  });

  it("with the gate closed the screen keeps today's behaviour (no badge request)", async () => {
    const badge = { typeId: '0x1', name: 'Dabei', imageUrl: null, claimStart: 0, claimEnd: 0, collected: 0 };
    const deps = {
      gateOpen: jest.fn(async () => false),
      scanBadge: jest.fn(async () => ({ eventId: 'ev-1', eventTitle: 'Sommerfest', eventDate: '2026-12-05', badge })),
    };
    expect(await badgeForScan('rev-1', deps as never)).toBeNull();
    expect(deps.scanBadge).not.toHaveBeenCalled();
    deps.gateOpen.mockResolvedValue(true);
    expect(await badgeForScan('rev-1', deps as never)).toEqual({ eventId: 'ev-1', eventTitle: 'Sommerfest', eventDate: '2026-12-05', name: 'Dabei', imageUrl: null });
    expect(deps.scanBadge).toHaveBeenCalledWith('rev-1');
    deps.scanBadge.mockResolvedValue({ eventId: 'ev-1', eventTitle: 'Sommerfest', eventDate: '2026-12-05', badge: null } as never);
    expect(await badgeForScan('rev-1', deps as never)).toBeNull();
    deps.scanBadge.mockResolvedValue(undefined as never);
    expect(await badgeForScan('rev-1', deps as never)).toBeNull();
  });

  it('the scanned event is resolved by the server route, never by reading reward_events directly', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'collect.ts'), 'utf8') as string;
    const screen = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'app', 'e', '[id].tsx'), 'utf8') as string;
    expect(src).not.toMatch(/from\('reward_events'\)/);
    expect(screen).not.toMatch(/from\('reward_events'\)/);
  });

  it('offline at the door the last known gate decides', async () => {
    const allowed = jest.fn(async () => true);
    expect(await scanGate({ online: async () => false, allowed })).toBe(false);
    expect(await scanGate({ online: async () => true, allowed })).toBe(true);
    expect(await scanGate({ online: async () => false, allowed })).toBe(true);
    expect(allowed).toHaveBeenCalledTimes(1);
  });
});
