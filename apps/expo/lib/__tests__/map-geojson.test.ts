import { entitiesToGeoJSON, processEventsWithCoordinates } from '@/lib/map/geojson';
import type { EventRecord, RestaurantRecord, BusinessRecord } from '@/lib/types';
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

describe('processEventsWithCoordinates', () => {
  it('filters events without coordinates', () => {
    const out = processEventsWithCoordinates([
      event() as any,
      event({ id: 'e2', latitude: null as any, longitude: null as any }) as any,
    ]);
    expect(out.map((e) => e.id)).toEqual(['e1']);
  });
});
