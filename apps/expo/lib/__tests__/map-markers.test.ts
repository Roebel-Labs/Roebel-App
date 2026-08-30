import {
  eventEmoji,
  restaurantEmoji,
  businessEmoji,
  poiEmoji,
  markerImageForSlug,
} from '@/lib/map/markers';

describe('map marker emoji resolution', () => {
  it('maps event categories and falls back to 📍', () => {
    expect(eventEmoji('Musik')).toBe('🎵');
    expect(eventEmoji('Essen & Trinken')).toBe('🍴');
    expect(eventEmoji('Unbekannt')).toBe('📍');
    expect(eventEmoji(null)).toBe('📍');
  });

  it('maps business categories and falls back to 🏪', () => {
    expect(businessEmoji(null, 'gastronomie')).toBe('🍽️');
    expect(businessEmoji(null, 'handwerk')).toBe('🔨');
    expect(businessEmoji(null, null)).toBe('🏪');
  });

  it('slug overrides beat category emoji', () => {
    expect(businessEmoji('__test-doener', 'einzelhandel')).toBe('🥙');
    expect(restaurantEmoji('__test-doener')).toBe('🥙');
  });

  it('restaurants default to 🍽️', () => {
    expect(restaurantEmoji(null)).toBe('🍽️');
    expect(restaurantEmoji('unknown-slug')).toBe('🍽️');
  });

  it('maps poi types and falls back to ⭐', () => {
    expect(poiEmoji('swim_spot')).toBe('🏊');
    expect(poiEmoji('nope')).toBe('⭐');
  });

  it('resolves marker images by slug, undefined otherwise', () => {
    expect(markerImageForSlug('unknown')).toBeUndefined();
    expect(markerImageForSlug(null)).toBeUndefined();
  });
});
