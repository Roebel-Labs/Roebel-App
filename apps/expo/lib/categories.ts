// Event category constants and metadata

export const EVENT_CATEGORIES = [
  'Kultur',
  'Musik',
  'Essen & Trinken',
  'Kirchliches',
  'Ausstellungen',
  'Stadt',
  'Sport',
  'Sonstige',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

// Category metadata with descriptions and image paths
export const CATEGORY_METADATA: Record<
  EventCategory,
  {
    label: string;
    description: string;
    image: any;
  }
> = {
  Kultur: {
    label: 'Kultur',
    description: 'Kulturelle Veranstaltungen, Theater, Konzerte und mehr',
    image: require('@/assets/illustration/categories/kultur.png'),
  },
  Musik: {
    label: 'Musik',
    description: 'Konzerte, Festivals und musikalische Veranstaltungen',
    image: require('@/assets/illustration/categories/musik.png'),
  },
  'Essen & Trinken': {
    label: 'Essen & Trinken',
    description: 'Kulinarische Events, Märkte und gastronomische Erlebnisse',
    image: require('@/assets/illustration/categories/essen_trinken.png'),
  },
  Kirchliches: {
    label: 'Kirchliches',
    description: 'Kirchliche Veranstaltungen und religiöse Feiern',
    image: require('@/assets/illustration/categories/kirchliches.png'),
  },
  Ausstellungen: {
    label: 'Ausstellungen',
    description: 'Kunstausstellungen, Museen und Galerien',
    image: require('@/assets/illustration/categories/ausstellungen.png'),
  },
  Stadt: {
    label: 'Stadt',
    description: 'Städtische Veranstaltungen und kommunale Events',
    image: require('@/assets/illustration/categories/stadt.png'),
  },
  Sport: {
    label: 'Sport',
    description: 'Sportliche Events, Wettkämpfe und Aktivitäten',
    image: require('@/assets/illustration/categories/sport.png'),
  },
  Sonstige: {
    label: 'Sonstige',
    description: 'Weitere interessante Veranstaltungen',
    image: require('@/assets/illustration/categories/sonstige.png'),
  },
};
