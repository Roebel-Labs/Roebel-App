/**
 * The "Stablecoin" map filter. Same shape as filterOpenNow in ./filters: pure,
 * takes the toggle explicitly, and is a no-op when the toggle is off, so callers
 * can apply it unconditionally.
 */
import { acceptsStablecoin, filterByAcceptance } from '../map/acceptance';
import { acceptanceKey } from '../merchant/registry';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async () => 'hash'),
}));

const acceptance = new Set([
  acceptanceKey('business', 'b-1'),
  acceptanceKey('restaurant', 'r-9'),
]);

describe('acceptsStablecoin', () => {
  it('is true for a listed entity', () => {
    expect(acceptsStablecoin('business', 'b-1', acceptance)).toBe(true);
    expect(acceptsStablecoin('restaurant', 'r-9', acceptance)).toBe(true);
  });

  it('is false for an unlisted entity', () => {
    expect(acceptsStablecoin('business', 'b-2', acceptance)).toBe(false);
  });

  it('does not confuse types that share an id', () => {
    expect(acceptsStablecoin('restaurant', 'b-1', acceptance)).toBe(false);
  });

  it('ignores id casing', () => {
    expect(acceptsStablecoin('business', 'B-1', acceptance)).toBe(true);
  });

  it('is false against an empty set', () => {
    expect(acceptsStablecoin('business', 'b-1', new Set())).toBe(false);
  });
});

describe('filterByAcceptance', () => {
  const items = [{ id: 'b-1' }, { id: 'b-2' }, { id: 'b-3' }];

  it('returns the same array untouched when the filter is off', () => {
    expect(filterByAcceptance(items, 'business', acceptance, false)).toBe(items);
  });

  it('keeps only accepting places when the filter is on', () => {
    expect(filterByAcceptance(items, 'business', acceptance, true)).toEqual([{ id: 'b-1' }]);
  });

  it('returns an empty list when nothing accepts', () => {
    expect(filterByAcceptance(items, 'business', new Set(), true)).toEqual([]);
  });

  it('filters restaurants against restaurant keys only', () => {
    const restaurants = [{ id: 'r-9' }, { id: 'b-1' }];
    expect(filterByAcceptance(restaurants, 'restaurant', acceptance, true)).toEqual([
      { id: 'r-9' },
    ]);
  });
});
