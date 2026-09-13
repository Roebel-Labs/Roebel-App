// Quick-action tiles on the profile. Art is attached in ProfileActionGrid.

export type ProfileActionKey =
  | 'abfallkalender'
  | 'governance'
  | 'create-org'
  | 'submit-event'
  | 'create-listing'
  | 'create-service'
  | 'create-product'
  | 'org-ads'
  | 'org-dashboard';

export type ProfileAction = {
  key: ProfileActionKey;
  /** Tile label; "\n" marks the preferred line break. */
  label: string;
  href: string;
  params?: Record<string, string>;
  /** Wrap navigation in the auth gate (org create actions). */
  auth?: boolean;
};

export const PERSONAL_PROFILE_ACTIONS: ProfileAction[] = [
  { key: 'abfallkalender', label: 'Abfall-\nkalender', href: '/abfallkalender' },
  { key: 'governance', label: 'Bürger-\nbefragung', href: '/governance' },
  { key: 'create-org', label: 'Durchstarten', href: '/create-org' },
  { key: 'submit-event', label: 'Veranstaltung\neinsenden', href: '/submit-event' },
  { key: 'create-listing', label: 'Anzeige\nerstellen', href: '/create-listing' },
  { key: 'create-service', label: 'Dienstleistung\nanbieten', href: '/create-listing', params: { listingType: 'service' } },
];

export const ORG_PROFILE_ACTIONS: ProfileAction[] = [
  { key: 'create-product', label: 'Anzeige\nerstellen', href: '/create-listing', params: { listingType: 'product' }, auth: true },
  { key: 'create-service', label: 'Dienstleistung\nanbieten', href: '/create-listing', params: { listingType: 'service' }, auth: true },
  { key: 'submit-event', label: 'Veranstaltung\nerstellen', href: '/submit-event', auth: true },
  { key: 'org-ads', label: 'Anzeigen', href: '/org/ads' },
  { key: 'org-dashboard', label: 'Dashboard', href: '/org/dashboard' },
];
