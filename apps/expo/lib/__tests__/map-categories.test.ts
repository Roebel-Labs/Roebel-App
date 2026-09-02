import { MAP_CATEGORIES, categoryByKey } from '@/lib/map/categories';

describe('MAP_CATEGORIES', () => {
  it('has unique keys', () => {
    const keys = MAP_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every category a label and an icon', () => {
    for (const category of MAP_CATEGORIES) {
      expect(category.label.trim()).not.toBe('');
      expect(category.icon.trim()).not.toBe('');
    }
  });

  it('leads with Empfehlungen', () => {
    expect(MAP_CATEGORIES[0].key).toBe('empfehlungen');
  });

  it('leaves Empfehlungen without a layer filter so the whole map stays visible', () => {
    expect(categoryByKey('empfehlungen')?.layers).toBeUndefined();
  });

  it('narrows the map for every other category', () => {
    for (const category of MAP_CATEGORIES.filter((c) => c.key !== 'empfehlungen')) {
      expect(category.layers).toBeDefined();
      // A category that turns nothing on would open onto an empty map.
      expect(Object.values(category.layers!).some(Boolean)).toBe(true);
    }
  });

  it('resolves a known key and rejects an unknown one', () => {
    expect(categoryByKey('essen')?.label).toBe('Essen');
    // @ts-expect-error — guarding the runtime path, not the type
    expect(categoryByKey('nicht-vorhanden')).toBeUndefined();
  });
});
