jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import type { EventBadgeGetResult, PublicEventBadge } from '../types';
import { afterBadgeSetup, ATTENDEE_LABELS, attendeeBadgeState, badgeOffWarning, badgeSetupPayload, defaultBadgeName, organiserBadgeView, ORGANISER_LABELS } from '../event-page';
import { eventBadgeRow } from '../org';
import { assertCleanCopy } from '../copy';

const badge: PublicEventBadge = {
  typeId: ('0x' + 'cd'.repeat(32)) as `0x${string}`,
  name: 'Dabei: Sommerfest',
  imageUrl: null,
  claimStart: 1_000,
  claimEnd: 2_000,
  collected: 3,
};
const onchain: NonNullable<EventBadgeGetResult['badge']> = {
  typeId: badge.typeId,
  name: badge.name,
  imageUrl: null,
  supplyCap: 0,
  chain: 'onchain',
  auto: false,
};

describe('event page badge', () => {
  it('attendee label: before, collected, pending, over', () => {
    expect(attendeeBadgeState({ badge: null, held: false, pending: false, nowSec: 1_500 })).toBeNull();
    expect(attendeeBadgeState({ badge, held: false, pending: false, nowSec: 500 })).toEqual({ label: 'Das bekommst du, wenn du dabei bist', state: 'before' });
    expect(attendeeBadgeState({ badge, held: false, pending: false, nowSec: 1_500 })).toEqual({ label: 'Das bekommst du, wenn du dabei bist', state: 'before' });
    expect(attendeeBadgeState({ badge, held: true, pending: false, nowSec: 1_500 })).toEqual({ label: 'Gesammelt', state: 'collected' });
    expect(attendeeBadgeState({ badge, held: true, pending: false, nowSec: 9_999 })).toEqual({ label: 'Gesammelt', state: 'collected' });
    expect(attendeeBadgeState({ badge, held: false, pending: true, nowSec: 1_500 })).toEqual({ label: 'Wird eingetragen', state: 'pending' });
    expect(attendeeBadgeState({ badge, held: false, pending: false, nowSec: 2_001 })).toEqual({ label: 'Vorbei', state: 'over' });
  });

  it('organiser view counts and primary label match the web panel', () => {
    const cases: EventBadgeGetResult[] = [
      { attendees: 4, notYetIssued: 4, issued: 0, accepted: 0, badge: null },
      { attendees: 15, notYetIssued: 3, issued: 12, accepted: 7, badge: onchain },
      { attendees: 15, notYetIssued: 0, issued: 15, accepted: 9, badge: onchain },
      { attendees: 0, notYetIssued: 0, issued: 0, accepted: 0, badge: { ...onchain, chain: 'draft' } },
    ];
    for (const g of cases) {
      const v = organiserBadgeView(g);
      const row = eventBadgeRow(g)!;
      expect(v.primary).toEqual({ label: row.label, disabled: row.disabled });
      expect(v.count).toBe(`${g.attendees} Teilnehmende · ${g.issued} eingeladen · ${g.accepted} angenommen`);
    }
    expect(organiserBadgeView(cases[1]).primary.label).toBe('Abzeichen vergeben (3)');
    expect(organiserBadgeView(cases[2]).primary).toEqual({ label: 'Alle haben ihr Abzeichen', disabled: true });
  });

  it('no label fails assertCleanCopy', () => {
    const labels = [...Object.values(ATTENDEE_LABELS), ...Object.values(ORGANISER_LABELS)].filter((x): x is string => typeof x === 'string');
    expect(labels.length).toBeGreaterThan(4);
    expect(assertCleanCopy(labels)).toEqual([]);
    expect(assertCleanCopy(['Dein NFT', 'Wallet verbinden', 'Gesammelt'])).toEqual(['Dein NFT', 'Wallet verbinden']);
  });

  it('create/edit toggle: payload defaults to Dabei: <Titel> and the poster, limit optional', () => {
    expect(defaultBadgeName('Sommerfest')).toBe('Dabei: Sommerfest');
    expect(defaultBadgeName('x'.repeat(80)).length).toBe(60);
    expect(badgeSetupPayload({ enabled: true, name: '', artUrl: null, limit: '' }, { eventId: 'e1', title: 'Sommerfest', posterUrl: 'https://p/1.jpg' })).toEqual({
      ok: true,
      payload: { eventId: 'e1', enabled: true, name: 'Dabei: Sommerfest', imageUrl: 'https://p/1.jpg' },
    });
    expect(badgeSetupPayload({ enabled: true, name: ' Mein Stempel ', artUrl: 'https://a/2.png', limit: '150' }, { eventId: 'e1', title: 'S', posterUrl: null })).toEqual({
      ok: true,
      payload: { eventId: 'e1', enabled: true, name: 'Mein Stempel', imageUrl: 'https://a/2.png', supplyCap: 150 },
    });
    expect(badgeSetupPayload({ enabled: false, name: 'x', artUrl: null, limit: '5' }, { eventId: 'e1', title: 'S', posterUrl: null })).toEqual({
      ok: true,
      payload: { eventId: 'e1', enabled: false },
    });
    expect(badgeSetupPayload({ enabled: true, name: '', artUrl: null, limit: 'zehn' }, { eventId: 'e1', title: 'S', posterUrl: null })).toEqual({
      ok: false,
      message: 'Die Anzahl muss eine ganze Zahl zwischen 1 und 100000 sein.',
    });
  });

  it('switching off a badge that is in the register warns first and opens the approve screen', () => {
    const on = { enabled: true, name: '', artUrl: null, limit: '' };
    const off = { ...on, enabled: false };
    expect(badgeOffWarning({ chain: 'onchain' }, off)).toMatch(/verlieren sofort ihre Gültigkeit/);
    expect(badgeOffWarning({ chain: 'draft' }, off)).toBeNull();
    expect(badgeOffWarning({ chain: 'onchain' }, on)).toBeNull();
    expect(badgeOffWarning(null, off)).toBeNull();
    expect(afterBadgeSetup({ ok: true, data: { typeId: '0x1', actionId: 'a-1' } }, 'org-1')).toEqual({
      pathname: '/org/credentials/approve/[id]',
      params: { id: 'a-1', org: 'org-1' },
    });
    expect(afterBadgeSetup({ ok: true, data: { typeId: '0x1' } }, 'org-1')).toBeNull();
    expect(afterBadgeSetup({ ok: false, code: 'X', message: 'm' } as never, 'org-1')).toBeNull();
  });
});
