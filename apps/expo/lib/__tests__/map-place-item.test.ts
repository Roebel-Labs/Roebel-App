import {
  getCategoryLabel,
  getGalleryUrls,
  getImageUrl,
  getSubtitle,
  getTitle,
  type PlaceItem,
} from '@/lib/map/place-item';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const eventItem = {
  id: 'e',
  entityType: 'event',
  lat: 0,
  lon: 0,
  data: { id: 'e', title: 'Bingo', location: 'Rathaus', category: 'Kultur', image_url: 'https://i/e.jpg' },
} as unknown as PlaceItem;

const businessItem = {
  id: 'b',
  entityType: 'business',
  lat: 0,
  lon: 0,
  data: {
    id: 'b',
    name: 'KABIMA',
    slug: 'kabima',
    category: 'sonstiges',
    address: 'Mirower Str. 18A',
    cover_image_url: 'https://i/cover.jpg',
    logo_url: 'https://i/logo.jpg',
    gallery_images: ['https://i/g1.jpg', 'https://i/g2.jpg'],
  },
} as unknown as PlaceItem;

const orgItem = {
  id: 'o',
  entityType: 'org',
  lat: 0,
  lon: 0,
  data: { id: 'o', name: 'Verein', sub_type: 'verein', address: null, cover_url: null, avatar_url: 'https://i/a.jpg' },
} as unknown as PlaceItem;

describe('place-item presenters', () => {
  it('titles and subtitles come from the entity-specific fields', () => {
    expect(getTitle(eventItem)).toBe('Bingo');
    expect(getSubtitle(eventItem)).toBe('Rathaus');
    expect(getTitle(businessItem)).toBe('KABIMA');
    expect(getSubtitle(businessItem)).toBe('Mirower Str. 18A');
    expect(getSubtitle(orgItem)).toBe('');
  });

  it('labels categories in German', () => {
    expect(getCategoryLabel(businessItem)).toBe('Sonstiges');
    expect(getCategoryLabel(orgItem)).toBe('Verein');
    expect(getCategoryLabel(eventItem)).toBe('Kultur');
  });

  it('picks the cover before the logo, and the avatar when there is no cover', () => {
    expect(getImageUrl(businessItem)).toBe('https://i/cover.jpg');
    expect(getImageUrl(orgItem)).toBe('https://i/a.jpg');
  });

  it('gallery leads with the uploaded photos and adds the cover once', () => {
    expect(getGalleryUrls(businessItem)).toEqual([
      'https://i/g1.jpg',
      'https://i/g2.jpg',
      'https://i/cover.jpg',
    ]);
    expect(getGalleryUrls(eventItem)).toEqual(['https://i/e.jpg']);
  });
});
