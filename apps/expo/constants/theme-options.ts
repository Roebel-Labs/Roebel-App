import type { ThemePreference } from '@/context/ThemeContext';

/** Theme choices shown in Einstellungen and Profil → Darstellung. */
export const THEME_OPTIONS: { value: ThemePreference; label: string; description?: string }[] = [
  { value: 'system', label: 'System', description: 'Folgt den Geräteeinstellungen' },
  { value: 'light', label: 'Hell' },
  { value: 'dim', label: 'Gedimmt', description: 'Dunkles Grau, schont die Augen' },
  { value: 'dark', label: 'Dunkel', description: 'Reines Schwarz, spart Akku bei OLED-Displays' },
];
