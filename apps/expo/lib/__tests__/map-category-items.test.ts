import {
  isBar,
  isCafe,
  isLodging,
  itemsForCategory,
  scoresFromSummaries,
} from '@/lib/map/category-items';
import { buildOrgIndex, EMPTY_ORG_INDEX } from '@/lib/map/org-lookup';
import type { EventWithCoordinates, OrgWithCoordinates } from '@/lib/map/geojson';
import type {
  Account,
  AccountSaveSummary,
  AccountVoteSummary,
  BusinessRecord,
  RestaurantRecord,
} from '@/lib/types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const restaurant = (
  id: string,
  name: string,
  extra: Partial<RestaurantRecord> = {}
): RestaurantRecord =>
  ({
    id,
    name,
    slug: id,
    description: null,
    latitude: 53.37,
    longitude: 12.6,
    is_featured: false,
    cover_image_url: null,
    logo_url: null,
    account_id: null,
    ...extra,
  }) as unknown as RestaurantRecord;

const business = (
  id: string,
  name: string,
  category: BusinessRecord['category'],
  extra: Partial<BusinessRecord> = {}
): BusinessRecord =>
  ({
    id,
    name,
    slug: id,
    category,
    description: null,
    latitude: 53.37,
    longitude: 12.6,
    is_featured: false,
    cover_image_url: null,
    logo_url: null,
    gallery_images: null,
    ...extra,
  }) as unknown as BusinessRecord;

const event = (id: string, date: string, extra: Partial<EventWithCoordinates> = {}) =>
  ({
    id,
    title: id,
    date,
    time: null,
    latitude: 53.37,
    longitude: 12.6,
    is_cancelled: false,
    ...extra,
  }) as unknown as EventWithCoordinates;

const org = (id: string, name: string): OrgWithCoordinates =>
  ({ id, name, sub_type: 'verein', latitude: 53.37, longitude: 12.6 }) as unknown as OrgWithCoordinates;

const NOW = new Date(2026, 8, 13, 12, 0, 0); // Sunday 2026-09-13

const empty = { events: [], restaurants: [], businesses: [], orgs: [] };

describe('keyword classifiers', () => {
  it('reads a Tortenbar as a café, not a bar', () => {
    expect(isCafe("Kathi's Tortenbar", null)).toBe(true);
    expect(isBar("Kathi's Tortenbar", null)).toBe(false);
  });

  it('finds a café in the description when the name says nothing', () => {
    expect(isCafe('Seglerheim', 'Café & Restaurant direkt am Wasser')).toBe(true);
  });

  it('recognises compound and standalone bar names', () => {
    expect(isBar('Strandbar Müritz', null)).toBe(true);
    expect(isBar('Bar 53', null)).toBe(true);
    expect(isBar('Kneipe zum Anker', null)).toBe(true);
    expect(isBar('Delizia', 'Italienische Küche')).toBe(false);
  });

  it('recognises lodging from name or description', () => {
    expect(isLodging('Seglerheim', 'Hotel und Restaurant direkt am Wasser')).toBe(true);
    expect(isLodging('Pension Seeblick', null)).toBe(true);
    expect(isLodging('Optik Wolter', 'Brillen und Kontaktlinsen')).toBe(false);
  });
});

describe('itemsForCategory', () => {
  it('essen lists every gastronomy place once, preferring the restaurant row', () => {
    const items = itemsForCategory(
      'essen',
      {
        ...empty,
        restaurants: [restaurant('r1', 'Delizia')],
        businesses: [
          business('b1', 'Delizia', 'gastronomie'),
          business('b2', 'Seglerheim', 'gastronomie'),
          business('b3', 'Optik Wolter', 'dienstleistung'),
        ],
      },
      { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW }
    );
    expect(items.map((it) => `${it.entityType}-${it.id}`)).toEqual(['restaurant-r1', 'business-b2']);
  });

  it('skips places without coordinates so a tap can always fly to them', () => {
    const items = itemsForCategory(
      'essen',
      { ...empty, restaurants: [restaurant('r1', 'Delizia', { latitude: null, longitude: null })] },
      { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW }
    );
    expect(items).toEqual([]);
  });

  it('cafes and bars filter gastronomy by keyword', () => {
    const sources = {
      ...empty,
      restaurants: [
        restaurant('r1', "Kathi's Tortenbar"),
        restaurant('r2', 'Strandbar Müritz'),
        restaurant('r3', 'Delizia'),
      ],
    };
    const opts = { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW };
    expect(itemsForCategory('cafes', sources, opts).map((it) => it.id)).toEqual(['r1']);
    expect(itemsForCategory('bars', sources, opts).map((it) => it.id)).toEqual(['r2']);
  });

  it('uebernachten finds lodging across restaurants and businesses', () => {
    const items = itemsForCategory(
      'uebernachten',
      {
        ...empty,
        restaurants: [restaurant('r1', 'Seglerheim')],
        businesses: [
          business('b1', 'Seglerheim', 'gastronomie', { description: 'Hotel und Restaurant' }),
          business('b2', 'Ferienwohnung am See', 'tourismus'),
        ],
      },
      { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW }
    );
    // The business row carries the hotel description, so it is the one that
    // qualifies — and the restaurant twin with the same name is not re-added.
    expect(items.map((it) => it.id)).toEqual(['b1', 'b2']);
  });

  it('shops lists non-gastronomy businesses', () => {
    const items = itemsForCategory(
      'shops',
      {
        ...empty,
        businesses: [
          business('b1', 'Delizia', 'gastronomie'),
          business('b2', 'Optik Wolter', 'dienstleistung'),
          business('b3', 'Antalya Barber', 'handwerk'),
        ],
      },
      { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW }
    );
    expect(items.map((it) => it.id)).toEqual(['b2', 'b3']);
  });

  it('ausgehen lists upcoming, non-cancelled events by date', () => {
    const items = itemsForCategory(
      'ausgehen',
      {
        ...empty,
        events: [
          event('later', '2026-09-20'),
          event('past', '2026-09-12'),
          event('today', '2026-09-13'),
          event('cancelled', '2026-09-14', { is_cancelled: true }),
        ],
      },
      { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW }
    );
    expect(items.map((it) => it.id)).toEqual(['today', 'later']);
  });

  it('empfehlungen ranks by community score, then featured, then image', () => {
    const account: Account = { id: 'acc-1', name: 'Delizia' } as unknown as Account;
    const restaurants = [
      restaurant('plain', 'Plain'),
      restaurant('pictured', 'Pictured', { cover_image_url: 'https://x/y.jpg' }),
      restaurant('featured', 'Featured', { is_featured: true }),
      restaurant('loved', 'Delizia', { account_id: 'acc-1' }),
    ];
    const orgIndex = buildOrgIndex([account], restaurants, []);
    const items = itemsForCategory(
      'empfehlungen',
      { ...empty, restaurants, orgs: [org('o1', 'Verein')] },
      { orgIndex, scores: { 'acc-1': 9 }, now: NOW }
    );
    // Ties keep source order: gastronomy, then shops, then org pins.
    expect(items.map((it) => it.id)).toEqual(['loved', 'featured', 'pictured', 'plain', 'o1']);
  });

  it('empfehlungen is capped so the sheet stays a recommendation, not a directory', () => {
    const restaurants = Array.from({ length: 30 }, (_, i) => restaurant(`r${i}`, `Place ${i}`));
    const items = itemsForCategory(
      'empfehlungen',
      { ...empty, restaurants },
      { orgIndex: EMPTY_ORG_INDEX, scores: {}, now: NOW }
    );
    expect(items.length).toBeLessThanOrEqual(12);
  });
});

describe('scoresFromSummaries', () => {
  it('adds up-votes and saves, subtracts down-votes, per account', () => {
    const votes: AccountVoteSummary[] = [
      { account_id: 'a', up_count: 5, down_count: 1, vote_count: 6, percent_liked: 83 },
    ];
    const saves: AccountSaveSummary[] = [
      { account_id: 'a', to_try_count: 2, been_count: 1, save_count: 3 },
      { account_id: 'b', to_try_count: 0, been_count: 2, save_count: 2 },
    ];
    expect(scoresFromSummaries(votes, saves)).toEqual({ a: 7, b: 2 });
  });
});
