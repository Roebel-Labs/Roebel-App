/**
 * "Nachbarn einladen": the saving/reserve arithmetic. An invitation burns 96 of the inviter's own
 * personal Münzen when the neighbour joins, so the daily claim must hold them back instead of
 * converting them into shared Röbel Münzen (which can never be converted back).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/constants/gnosis', () => ({
  roebeltalerGroupAddress: '0xAc2CeCdBead594F97358a0d3132454f24F3E470c',
  attesterSafeGnosisAddress: '0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa',
}));

import {
  INVITE_COST_RAW,
  INVITE_RESERVE_RAW,
  MAX_OPEN_INVITES,
  convertibleRaw,
  daysUntilNextInvite,
  freeInviteSlots,
  inviteReserveRaw,
  neighbourStatus,
  savedTowardsNextRaw,
} from '../muenzen-invite';
import { buildMuenzenClaimTxs, groupMintAmount } from '../muenzen-claim';

const m = (n: number) => BigInt(Math.round(n * 100)) * 10n ** 16n;
const HUB = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8' as const;
const GROUP = '0xAc2CeCdBead594F97358a0d3132454f24F3E470c' as const;
const SELF = '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28' as const;

describe('invite reserve', () => {
  it('holds back nothing without saving or open invitations', () => {
    expect(inviteReserveRaw(0, false)).toBe(0n);
  });

  it('holds back one invitation while saving, plus one per open invitation', () => {
    expect(inviteReserveRaw(0, true)).toBe(INVITE_RESERVE_RAW);
    expect(inviteReserveRaw(2, false)).toBe(2n * INVITE_RESERVE_RAW);
    expect(inviteReserveRaw(2, true)).toBe(3n * INVITE_RESERVE_RAW);
  });

  it('bounds the reserve for an account with many open invitations', () => {
    expect(inviteReserveRaw(40, false)).toBe(BigInt(MAX_OPEN_INVITES) * INVITE_RESERVE_RAW);
  });

  it('holds back more than the cost so slow shrinkage cannot break a join', () => {
    expect(INVITE_RESERVE_RAW).toBeGreaterThan(INVITE_COST_RAW);
  });
});

describe('what the claim converts', () => {
  it('converts everything above the reserve and nothing below it', () => {
    expect(convertibleRaw(m(130), m(97))).toBe(m(33));
    expect(convertibleRaw(m(60), m(97))).toBe(0n);
    expect(convertibleRaw(m(60), 0n)).toBe(m(60));
  });

  it('passkey batch: skips the group mint while the reserve is not full', () => {
    const txs = buildMuenzenClaimTxs({
      hub: HUB, group: GROUP, self: SELF, member: true,
      personalBalance: m(40), mintable: m(24), reserve: INVITE_RESERVE_RAW,
    });
    expect(txs).toHaveLength(1); // personalMint only
  });

  it('passkey batch: converts only the surplus once the reserve is full', () => {
    expect(groupMintAmount(m(100), m(24), INVITE_RESERVE_RAW)).toBe(m(124) - m(124) / 1000n - INVITE_RESERVE_RAW);
    const txs = buildMuenzenClaimTxs({
      hub: HUB, group: GROUP, self: SELF, member: true,
      personalBalance: m(100), mintable: m(24), reserve: INVITE_RESERVE_RAW,
    });
    expect(txs).toHaveLength(2);
  });

  it('passkey batch: unchanged without a reserve', () => {
    expect(groupMintAmount(m(10), m(24))).toBe(m(34) - m(34) / 1000n);
  });
});

describe('invitation slots', () => {
  it('needs the full cost for the first invitation', () => {
    expect(freeInviteSlots(m(95.99), 0)).toBe(0);
    expect(freeInviteSlots(m(96), 0)).toBe(1);
  });

  it('never offers an invitation the open ones already need', () => {
    expect(freeInviteSlots(m(97), 1)).toBe(0);
    expect(freeInviteSlots(m(200), 1)).toBe(1);
    expect(freeInviteSlots(m(10), 3)).toBe(0);
  });

  it('caps the number of open invitations', () => {
    expect(freeInviteSlots(m(96 * 50), 0)).toBe(MAX_OPEN_INVITES);
    expect(freeInviteSlots(m(96 * 50), MAX_OPEN_INVITES)).toBe(0);
  });
});

describe('savings progress', () => {
  it('counts only what the open invitations do not need', () => {
    expect(savedTowardsNextRaw(m(30), 0)).toBe(m(30));
    expect(savedTowardsNextRaw(m(126), 1)).toBe(m(30));
    expect(savedTowardsNextRaw(m(50), 1)).toBe(0n);
    expect(savedTowardsNextRaw(m(500), 0)).toBe(INVITE_COST_RAW);
  });

  it('estimates the days of collecting that are left', () => {
    expect(daysUntilNextInvite(0n, 0)).toBe(4);
    expect(daysUntilNextInvite(m(48), 0)).toBe(2); // the welcome bonus is half an invitation
    expect(daysUntilNextInvite(m(73), 0)).toBe(1);
    expect(daysUntilNextInvite(m(96), 0)).toBe(0);
    expect(daysUntilNextInvite(m(72), 0, m(24))).toBe(0); // counting what is ready to collect
  });
});

describe('neighbour status', () => {
  const me = '0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa';
  const other = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  it('waits while nobody who can pay has invited them', () => {
    expect(neighbourStatus({ self: me, fundedInviters: [] })).toBe('waiting');
  });
  it('prefers my own invitation, case-insensitively', () => {
    expect(neighbourStatus({ self: me, fundedInviters: [other, me.toLowerCase()] })).toBe('invitedByMe');
  });
  it('reports an invitation by someone else', () => {
    expect(neighbourStatus({ self: me, fundedInviters: [other] })).toBe('invitedByOther');
  });
});
