import {
  entitiesToGeoJSON,
  processEventsWithCoordinates,
  processOrgsWithCoordinates,
} from '@/lib/map/geojson';
import type { Account, EventRecord, RestaurantRecord, BusinessRecord } from '@/lib/types';
import type { PoiRecord } from '@/lib/supabase-pois';

const event = (over: Partial<EventRecord> = {}): EventRecord =>
  ({
    id: 'e1',
    title: 'Stadtfest',
    category: 'Fest',
    latitude: 53.37,
    longitude: 12.6,
    image_url: null,
    date: '2026-09-01',
    location: 'Marktplatz',
    is_popular: false,
    ...over,
  }) as unknown as EventRecord;

const restaurant = (over: Partial<RestaurantRecord> = {}): RestaurantRecord =>
  ({
    id: 'r1',
    name: 'Seeblick',
    slug: 'seeblick',
    latitude: 53.37,
    longitude: 12.61,
    address: 'Am See 1',
    cover_image_url: null,
    logo_url: null,
    is_featured: false,
    opening_hours: null,
    ...over,
  }) as unknown as RestaurantRecord;

const business = (over: Partial<BusinessRecord> = {}): BusinessRecord =>
  ({
    id: 'b1',
    name: 'Backhaus',
    slug: 'backhaus',
    category: 'gastronomie',
    latitude: 53.36,
    longitude: 12.59,
    address: 'Str. 2',
    cover_image_url: null,
    logo_url: null,
    is_featured: true,
    opening_hours: null,
    ...over,
  }) as unknown as BusinessRecord;

const poi = (over: Partial<PoiRecord> = {}): PoiRecord =>
  ({
    id: 'p1',
    type: 'swim_spot',
    name_de: 'Badestelle',
    lat: 53.35,
    lon: 12.58,
    address: null,
    status: 'swim_good',
    ...over,
  }) as unknown as PoiRecord;

const org = (over: Partial<Account> = {}): Account =>
  ({
    id: 'o1',
    account_type: 'organisation',
    sub_type: 'verein',
    name: 'Männerchor',
    bio: null,
    avatar_url: null,
    cover_url: null,
    slug: 'maennerchor',
    address: 'Bahnhofstraße 34',
    latitude: 53.3732,
    longitude: 12.6033,
    opening_hours: null,
    ...over,
  }) as unknown as Account;

describe('entitiesToGeoJSON marker properties', () => {
  it('sets fid, emoji, size and featured', () => {
    const fc = entitiesToGeoJSON(
      [event() as any],
      [restaurant()],
      [business()],
      [poi()]
    );
    const byFid = Object.fromEntries(fc.features.map((f) => [f.properties.fid, f.properties]));
    expect(byFid['event-e1'].emoji).toBe('🎉');
    expect(byFid['event-e1'].size).toBe('md');
    expect(byFid['restaurant-r1'].emoji).toBe('🍽️');
    expect(byFid['business-b1'].emoji).toBe('🍽️');
    expect(byFid['business-b1'].featured).toBe(true);
    expect(byFid['business-b1'].size).toBe('lg');
    expect(byFid['poi-p1'].emoji).toBe('🏊');
    expect(byFid['poi-p1'].size).toBe('sm');
  });

  it('omits the markerImage key when no PNG is registered', () => {
    const fc = entitiesToGeoJSON([], [restaurant()], [], []);
    expect('markerImage' in fc.features[0].properties).toBe(false);
  });

  it('emits org pins with the sub-type emoji and the address as subtitle', () => {
    const fc = entitiesToGeoJSON([], [], [], [], [
      org() as any,
      org({ id: 'o2', name: 'Stadt Röbel', sub_type: 'stadt' }) as any,
    ]);
    const byFid = Object.fromEntries(fc.features.map((f) => [f.properties.fid, f.properties]));
    expect(byFid['org-o1'].emoji).toBe('🎗️');
    expect(byFid['org-o1'].subtitle).toBe('Bahnhofstraße 34');
    expect(byFid['org-o1'].category).toBe('verein');
    expect(byFid['org-o2'].emoji).toBe('🏛️');
  });

  it('drops a business that duplicates a restaurant of the same name', () => {
    // Seglerheim exists as both a restaurants row and a businesses row — one
    // place must not get two pins stacked on top of each other.
    const fc = entitiesToGeoJSON(
      [],
      [restaurant({ id: 'r9', name: 'Seglerheim', slug: 'seglerheim' })],
      [business({ id: 'b9', name: 'Seglerheim', slug: 'seglerheim-biz' })],
      []
    );
    expect(fc.features.map((f) => f.properties.fid)).toEqual(['restaurant-r9']);
  });

  it('keeps a business whose name differs from every restaurant', () => {
    const fc = entitiesToGeoJSON(
      [],
      [restaurant({ id: 'r9', name: 'Delizia' })],
      [business({ id: 'b9', name: 'Antalya Barber' })],
      []
    );
    expect(fc.features.map((f) => f.properties.fid)).toEqual([
      'restaurant-r9',
      'business-b9',
    ]);
  });

  it('drops restaurants/businesses without coordinates instead of faking them', () => {
    const fc = entitiesToGeoJSON(
      [],
      [restaurant({ latitude: null as any, longitude: null as any })],
      [business({ latitude: null as any })],
      []
    );
    expect(fc.features).toHaveLength(0);
  });
});

describe('processOrgsWithCoordinates', () => {
  it('keeps only orgs that carry their own coordinates', () => {
    const out = processOrgsWithCoordinates([
      org(),
      org({ id: 'o2', latitude: null, longitude: null }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['o1']);
  });
});

describe('processEventsWithCoordinates', () => {
  it('filters events without coordinates', () => {
    const out = processEventsWithCoordinates([
      event() as any,
      event({ id: 'e2', latitude: null as any, longitude: null as any }) as any,
    ]);
    expect(out.map((e) => e.id)).toEqual(['e1']);
  });
});
