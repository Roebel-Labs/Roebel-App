/**
 * The browse categories in the map's bottom row.
 *
 * Kept as plain data, separate from the component, so the row and the sheets
 * can both read it and so slice C can attach content per category without
 * touching layout code.
 */
import type { MapFilterState } from './filters';

export type MapCategoryKey =
  | 'empfehlungen'
  | 'essen'
  | 'cafes'
  | 'bars'
  | 'ausgehen'
  | 'shops'
  | 'uebernachten';

export type MapCategory = {
  key: MapCategoryKey;
  label: string;
  icon: string;
  /**
   * Layers to show on the map behind the category's sheet. Empfehlungen keeps
   * everything visible; the rest narrow the map to what the sheet is about.
   */
  layers?: Partial<MapFilterState>;
};

export const MAP_CATEGORIES: MapCategory[] = [
  { key: 'empfehlungen', label: 'Empfehlungen', icon: '⭐' },
  {
    key: 'essen',
    label: 'Essen',
    icon: '🍽️',
    layers: { restaurants: true, businesses: false, events: false, pois: false },
  },
  {
    key: 'cafes',
    label: 'Cafés',
    icon: '☕',
    layers: { restaurants: true, businesses: false, events: false, pois: false },
  },
  {
    key: 'bars',
    label: 'Bars',
    icon: '🍸',
    layers: { restaurants: true, businesses: false, events: false, pois: false },
  },
  {
    key: 'ausgehen',
    label: 'Ausgehen',
    icon: '🎭',
    layers: { events: true, restaurants: false, businesses: false, pois: false },
  },
  {
    key: 'shops',
    label: 'Shops',
    icon: '🛍️',
    layers: { businesses: true, restaurants: false, events: false, pois: false },
  },
  {
    key: 'uebernachten',
    label: 'Übernachten',
    icon: '🛏️',
    layers: { businesses: true, restaurants: false, events: false, pois: false },
  },
];

export function categoryByKey(key: MapCategoryKey): MapCategory | undefined {
  return MAP_CATEGORIES.find((c) => c.key === key);
}
