import { nextCreatedAt, planSocialLists } from '../nostr/social-list-plan';
import { EMPTY_SNAPSHOT } from '../relations-state';

const orgs = new Map([['org-1', 'a'.repeat(64)], ['org-2', 'b'.repeat(64)]]);

describe('social-list-plan', () => {
  it('contact list holds followed ORGS only; persons never appear by pubkey', () => {
    const plan = planSocialLists({ ...EMPTY_SNAPSHOT, following: ['org-1', 'person-1'] }, orgs);
    expect(plan.contacts).toEqual(['a'.repeat(64)]);
  });
  it('mutes carry p for orgs plus netizen_account for everyone', () => {
    const plan = planSocialLists({ ...EMPTY_SNAPSHOT, muted: ['org-2', 'person-1'] }, orgs);
    expect(plan.muteItems).toEqual([
      ['p', 'b'.repeat(64)], ['netizen_account', 'org-2'],
      ['netizen_account', 'person-1'],
    ]);
  });
  it('unfollowed set uses account tags only', () => {
    const plan = planSocialLists({ ...EMPTY_SNAPSHOT, unfollowed: ['org-1'] }, orgs);
    expect(plan.unfollowedItems).toEqual([['netizen_account', 'org-1']]);
  });
  it('created_at strictly increases so two publishes in one second never tie', () => {
    expect(nextCreatedAt(100, null)).toBe(100);
    expect(nextCreatedAt(100, 100)).toBe(101);
    expect(nextCreatedAt(100, 150)).toBe(151);
  });
});
