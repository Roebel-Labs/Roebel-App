jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import type { EventBadgeGetResult } from '../types';
import { eventBadgeRow, issueEventBadge } from '../org';

const badge: NonNullable<EventBadgeGetResult['badge']> = {
  typeId: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
  name: 'Dabei: Sommerfest',
  imageUrl: null,
  supplyCap: 0,
  chain: 'onchain',
  auto: false,
};
const account = { address: '0x' + 'ab'.repeat(20), signMessage: jest.fn(async () => '0x') } as any;

describe('eventBadgeRow', () => {
  it('gate closed or nothing loaded: no row', () => {
    expect(eventBadgeRow(null)).toBeNull();
  });

  it('no badge yet: set it up', () => {
    expect(eventBadgeRow({ attendees: 4, notYetIssued: 4, issued: 0, accepted: 0, badge: null })).toEqual({
      label: 'Abzeichen für Teilnehmende einrichten',
      disabled: false,
    });
  });

  it('attendees not yet issued: issue with the count', () => {
    expect(eventBadgeRow({ attendees: 15, notYetIssued: 3, issued: 12, accepted: 7, badge })).toEqual({
      label: 'Abzeichen vergeben (3)',
      disabled: false,
    });
  });

  it('all issued: disabled', () => {
    expect(eventBadgeRow({ attendees: 15, notYetIssued: 0, issued: 15, accepted: 9, badge })).toEqual({
      label: 'Alle haben ihr Abzeichen',
      disabled: true,
    });
  });
});

describe('issueEventBadge', () => {
  it('prepares the badge and opens the approve screen with the returned id', async () => {
    const prepare = jest.fn(async () => ({ ok: true as const, data: { actionId: 'act-1', typeId: badge.typeId, count: 3 } }));
    const navigate = jest.fn();
    const r = await issueEventBadge(account, { eventId: 'ev-1', orgAccountId: 'org-1' }, { prepare, navigate });
    expect(r).toEqual({ ok: true });
    expect(prepare).toHaveBeenCalledWith(account, 'ev-1');
    expect(navigate).toHaveBeenCalledWith({ pathname: '/org/credentials/approve/[id]', params: { id: 'act-1', org: 'org-1' } });
  });

  it('a refusal returns the server message and navigates nowhere', async () => {
    const prepare = jest.fn(async () => ({ ok: false as const, code: 'NOTHING_TO_ISSUE', message: 'Alle Teilnehmenden haben ihr Abzeichen schon bekommen.' }));
    const navigate = jest.fn();
    const r = await issueEventBadge(account, { eventId: 'ev-1', orgAccountId: 'org-1' }, { prepare, navigate });
    expect(r).toEqual({ ok: false, message: 'Alle Teilnehmenden haben ihr Abzeichen schon bekommen.' });
    expect(navigate).not.toHaveBeenCalled();
  });
});
