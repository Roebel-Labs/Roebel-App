import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import type { HeldCredential } from '../held';
import { buildProfile, isExpired, publicProfile, EXPIRED_GRACE_SEC } from '../model';

const NOW = 1_800_000_000;
const DAY = 86_400;
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;

const held = (over: Partial<HeldCredential> & { typeId: Hex }): HeldCredential => ({
  kind: 'role',
  title: 'Rolle',
  orgName: 'Verein',
  imageUrl: null,
  recognised: false,
  visibility: 'public',
  validUntil: null,
  invitationId: 'inv-' + over.typeId.slice(-4),
  claim: null,
  ...over,
});

describe('buildProfile', () => {
  it("a citizen with nothing else gets exactly today's cards", () => {
    const p = buildProfile({ isCitizen: true, isAttester: false, held: [], nowSec: NOW });
    expect(p.cards.map((c) => c.key)).toEqual(['builtin:citizen']);
    expect(p.badges).toEqual([]);
    expect(p.cards[0]).toMatchObject({ source: 'builtin', builtin: 'citizen', state: 'valid', visibility: 'public' });
  });

  it('a guest keeps the Gastkarte', () => {
    const p = buildProfile({ isCitizen: false, isAttester: false, held: [], nowSec: NOW });
    expect(p.cards.map((c) => c.key)).toEqual(['builtin:guest']);
  });

  it('an attester keeps citizen behind attester, register cards follow', () => {
    const p = buildProfile({
      isCitizen: true,
      isAttester: true,
      held: [held({ typeId: tid(1), kind: 'membership', title: 'Mitglied' })],
      nowSec: NOW,
    });
    expect(p.cards.map((c) => c.key)).toEqual(['builtin:citizen', 'builtin:attester', tid(1)]);
    expect(p.cards[2]).toMatchObject({ source: 'register', typeId: tid(1), kind: 'membership', title: 'Mitglied' });
  });

  it('recognised roles come before other roles and memberships', () => {
    const p = buildProfile({
      isCitizen: true,
      isAttester: false,
      held: [
        held({ typeId: tid(1), kind: 'membership', title: 'A-Mitglied' }),
        held({ typeId: tid(2), kind: 'role', title: 'Zeugwart' }),
        held({ typeId: tid(3), kind: 'role', title: 'Bürgermeister', recognised: true }),
        held({ typeId: tid(4), kind: 'role', title: 'Kassenwart' }),
        held({ typeId: tid(5), kind: 'role', title: 'Amtsvorsteher', recognised: true }),
      ],
      nowSec: NOW,
    });
    expect(p.cards.map((c) => c.title)).toEqual([
      'Bürgerausweis',
      'Amtsvorsteher',
      'Bürgermeister',
      'Kassenwart',
      'Zeugwart',
      'A-Mitglied',
    ]);
  });

  it('badges are separate and newest first', () => {
    const p = buildProfile({
      isCitizen: true,
      isAttester: false,
      // held comes in the server order of `mine`: oldest invitation first.
      held: [
        held({ typeId: tid(1), kind: 'badge', title: 'Alt' }),
        held({ typeId: tid(2), kind: 'role', title: 'Rolle' }),
        held({ typeId: tid(3), kind: 'badge', title: 'Neu' }),
      ],
      nowSec: NOW,
    });
    expect(p.badges.map((b) => b.title)).toEqual(['Neu', 'Alt']);
    expect(p.cards.map((c) => c.title)).toEqual(['Bürgerausweis', 'Rolle']);
  });

  it('an Ausweis expired 5 days ago is shown as expired; after 31 days it is gone', () => {
    const until = NOW - 5 * DAY;
    const input = { isCitizen: true, isAttester: false, held: [held({ typeId: tid(1), validUntil: until })] };
    const soon = buildProfile({ ...input, nowSec: NOW });
    expect(soon.cards[1]).toMatchObject({ typeId: tid(1), state: 'expired', validUntil: until });
    const later = buildProfile({ ...input, nowSec: until + 31 * DAY });
    expect(later.cards.map((c) => c.key)).toEqual(['builtin:citizen']);
    expect(EXPIRED_GRACE_SEC).toBe(30 * DAY);
    expect(isExpired({ validUntil: until }, NOW)).toBe(true);
    expect(isExpired({ validUntil: null }, NOW)).toBe(false);
  });

  it('a future validUntil is valid', () => {
    const p = buildProfile({ isCitizen: true, isAttester: false, held: [held({ typeId: tid(1), validUntil: NOW + DAY })], nowSec: NOW });
    expect(p.cards[1].state).toBe('valid');
  });

  it('the Guest register type never produces a second card', () => {
    const p = buildProfile({
      isCitizen: false,
      isAttester: false,
      held: [held({ typeId: RESERVED_TYPE_IDS.guest, kind: 'badge', title: 'Gast' }), held({ typeId: RESERVED_TYPE_IDS.citizen, title: 'Bürger' })],
      nowSec: NOW,
    });
    expect(p.cards.map((c) => c.key)).toEqual(['builtin:guest']);
    expect(p.badges).toEqual([]);
  });

  it('keeps visibility and invitationId of register entries', () => {
    const p = buildProfile({ isCitizen: true, isAttester: false, held: [held({ typeId: tid(1), visibility: 'private', invitationId: 'abc' })], nowSec: NOW });
    expect(p.cards[1]).toMatchObject({ visibility: 'private', invitationId: 'abc' });
  });
});

describe('publicProfile', () => {
  it('publicProfile contains no private entry even if one is passed in', () => {
    const p = publicProfile({
      isCitizen: true,
      isAttester: false,
      publicHeld: [
        held({ typeId: tid(1), visibility: 'private', title: 'Geheim' }),
        held({ typeId: tid(2), visibility: 'public', title: 'Offen' }),
        held({ typeId: tid(3), visibility: 'private', kind: 'badge', title: 'Geheim-Badge' }),
      ],
      nowSec: NOW,
    });
    expect(p.cards.map((c) => c.title)).toEqual(['Bürgerausweis', 'Offen']);
    expect(p.badges).toEqual([]);
    expect([...p.cards, ...p.badges].every((c) => c.visibility === 'public')).toBe(true);
    expect([...p.cards, ...p.badges].some((c) => c.invitationId)).toBe(false);
  });
});
