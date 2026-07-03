/**
 * German labels + display order for mini-app categories (spec §3.4 enum).
 */
import type { MiniAppCategory } from '@netizen/miniapp-sdk';

export const CATEGORY_LABELS: Record<MiniAppCategory, string> = {
  community: 'Gemeinschaft',
  governance: 'Mitbestimmung',
  finance: 'Finanzen',
  utility: 'Werkzeuge',
  games: 'Spiele',
  education: 'Bildung',
  news: 'Nachrichten',
  culture: 'Kultur',
  environment: 'Umwelt',
};

/** Fixed display order for the category filter row. */
export const CATEGORY_ORDER: MiniAppCategory[] = [
  'community',
  'governance',
  'finance',
  'utility',
  'games',
  'education',
  'news',
  'culture',
  'environment',
];
