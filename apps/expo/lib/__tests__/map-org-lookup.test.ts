import {
  belongsToOrg,
  buildOrgIndex,
  accountIdForPin,
  orgForPin,
} from '@/lib/map/org-lookup';
import type { Account, BusinessRecord, RestaurantRecord } from '@/lib/types';

const org = (id: string, name: string): Account =>
  ({ id, name, account_type: 'organisation', sub_type: 'verein' }) as unknown as Account;

const restaurant = (id: string, name: string, accountId: string | null): RestaurantRecord =>
  ({ id, name, account_id: accountId }) as unknown as RestaurantRecord;

const business = (id: string, name: string): BusinessRecord =>
  ({ id, name }) as unknown as BusinessRecord;

describe('belongsToOrg', () => {
  it('matches the same name regardless of case and spacing', () => {
    expect(belongsToOrg('Optik Wolter', 'optik  wolter')).toBe(true);
  });

  it('lets an org name extend the business name at a word boundary', () => {
    expect(belongsToOrg('KABIMA Inhaber Karl Kneile', 'KABIMA')).toBe(true);
  });

  it('does NOT let a short org name claim a longer business name', () => {
    // Two different places two streets apart — the trap this guard exists for.
    expect(belongsToOrg('Bistro', 'Bistro zur Waage')).toBe(false);
  });

  it('does not match on a partial word', () => {
    expect(belongsToOrg('KABIMAX GmbH', 'KABIMA')).toBe(false);
  });

  it('does not match unrelated names that share a prefix token', () => {
    expect(belongsToOrg('PSV Röbel', 'PSV Boxclub')).toBe(false);
  });
});

describe('buildOrgIndex', () => {
  const orgs = [
    org('a-kabima', 'KABIMA Inhaber Karl Kneile'),
    org('a-bistro', 'Bistro'),
    org('a-waage', 'Bistro zur Waage'),
    org('a-verein', 'TSV 90 Röbel/ Müritz'),
  ];
  const restaurants = [
    restaurant('r-waage', 'Bistro zur Waage', 'a-waage'),
    restaurant('r-orphan', 'Ohne Account', null),
  ];
  const businesses = [
    business('b-kabima', 'KABIMA'),
    business('b-waage', 'Bistro zur Waage'),
    business('b-unknown', 'Fremdbetrieb'),
  ];

  const lookup = buildOrgIndex(orgs, restaurants, businesses);

  it('maps an org pin to itself', () => {
    expect(accountIdForPin(lookup, 'org', 'a-verein')).toBe('a-verein');
  });

  it('maps a restaurant pin through account_id', () => {
    expect(accountIdForPin(lookup, 'restaurant', 'r-waage')).toBe('a-waage');
  });

  it('leaves a restaurant without an account_id unresolved', () => {
    expect(accountIdForPin(lookup, 'restaurant', 'r-orphan')).toBeNull();
  });

  it('maps a business pin by name even when the org name is longer', () => {
    expect(accountIdForPin(lookup, 'business', 'b-kabima')).toBe('a-kabima');
  });

  it('gives "Bistro zur Waage" to its own org, never to the "Bistro" org', () => {
    expect(accountIdForPin(lookup, 'business', 'b-waage')).toBe('a-waage');
  });

  it('leaves a business with no matching org unresolved', () => {
    expect(accountIdForPin(lookup, 'business', 'b-unknown')).toBeNull();
  });

  it('resolves events and POIs to null so they keep the plain card', () => {
    expect(accountIdForPin(lookup, 'event', 'e1')).toBeNull();
    expect(accountIdForPin(lookup, 'poi', 'p1')).toBeNull();
  });

  it('orgForPin returns the account itself, not just the id', () => {
    expect(orgForPin(lookup, 'business', 'b-kabima')?.name).toBe('KABIMA Inhaber Karl Kneile');
    expect(orgForPin(lookup, 'poi', 'p1')).toBeNull();
  });
});
