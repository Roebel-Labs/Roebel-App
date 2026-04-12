import type { OrgSubType } from './types';

export type FeatureCardConfig = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  route: string;
  highlight?: boolean;
};

const DEFAULT_FEATURES: FeatureCardConfig[] = [
  {
    id: 'roebel-card',
    emoji: '🎴',
    title: 'Röbel Card',
    subtitle: 'Partner werden',
    route: '/roebel-card',
  },
  {
    id: 'dashboard',
    emoji: '📊',
    title: 'Dashboard',
    subtitle: 'Übersicht & Statistiken',
    route: '/org/dashboard',
  },
  {
    id: 'anzeigen',
    emoji: '📢',
    title: 'Anzeigen',
    subtitle: 'Werbung & Reichweite',
    route: '/org/ads',
  },
];

const SUB_TYPE_FEATURES: Record<OrgSubType, FeatureCardConfig[]> = {
  restaurant: [
    {
      id: 'tische',
      emoji: '🍽️',
      title: 'Tische',
      subtitle: 'Live-Ansicht',
      route: '/kitchen',
    },
    {
      id: 'verwalten',
      emoji: '⚙️',
      title: 'Verwalten',
      subtitle: 'Tische & QR-Codes',
      route: '/kitchen/tables',
    },
    {
      id: 'speisekarte',
      emoji: '📋',
      title: 'Speisekarte',
      subtitle: 'Kategorien & Gerichte',
      route: '/menu',
    },
  ],
  unternehmen: [
    {
      id: 'produkte',
      emoji: '📦',
      title: 'Produkte',
      subtitle: 'Produktkatalog',
      route: '/org/products',
    },
    {
      id: 'dienstleistungen',
      emoji: '🛠️',
      title: 'Dienstleistungen',
      subtitle: 'Serviceangebote',
      route: '/org/services',
    },
  ],
  verein: [],
  partei: [],
  fraktion: [],
};

export function getOrgFeatures(subType: OrgSubType): FeatureCardConfig[] {
  return [...DEFAULT_FEATURES, ...(SUB_TYPE_FEATURES[subType] || [])];
}
