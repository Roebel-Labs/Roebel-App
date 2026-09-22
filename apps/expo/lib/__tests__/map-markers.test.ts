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

describe('restaurant emoji from name/slug keywords', () => {
  it('reads the kind of place off the slug or the name', () => {
    expect(restaurantEmoji('pizzeria-roma', 'Pizzeria Roma')).toBe('🍕');
    expect(restaurantEmoji('eiscafe-venezia')).toBe('🍦');
    expect(restaurantEmoji('haus-am-see', 'Döner Haus')).toBe('🥙');
    expect(restaurantEmoji('fischerhof', 'Fischerhof')).toBe('🐟');
    expect(restaurantEmoji('cafe-am-markt')).toBe('☕');
  });

  it('keeps the plain plate when nothing matches', () => {
    expect(restaurantEmoji('seeblick', 'Seeblick')).toBe('🍽️');
  });

  it('slug overrides still beat keywords', () => {
    expect(restaurantEmoji('__test-doener', 'Pizza Palace')).toBe('🥙');
  });
});
