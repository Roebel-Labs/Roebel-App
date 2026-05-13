export type ListingCategory = { key: string; icon: string; label: string };

export const PRODUCT_CATEGORIES: ListingCategory[] = [
  { key: 'moebel', icon: 'package', label: 'Möbel' },
  { key: 'elektronik', icon: 'laptop-phone-sync', label: 'Elektronik' },
  { key: 'kleidung', icon: 't-shirt', label: 'Kleidung' },
  { key: 'fahrzeuge', icon: 'car-03', label: 'Fahrzeuge' },
  { key: 'sport', icon: 'football', label: 'Sport' },
  { key: 'garten', icon: 'leaf-01', label: 'Garten' },
  { key: 'haushalt', icon: 'lamp-04', label: 'Haushalt' },
  { key: 'spielzeug', icon: 'gameboy', label: 'Spielzeug' },
  { key: 'buecher', icon: 'book-03', label: 'Bücher' },
  { key: 'immobilien', icon: 'house-05', label: 'Immobilien' },
  { key: 'sonstiges', icon: 'note', label: 'Sonstiges' },
];

export const SERVICE_CATEGORIES: ListingCategory[] = [
  { key: 'handwerk', icon: 'tools', label: 'Handwerk' },
  { key: 'transport', icon: 'car-03', label: 'Transport' },
  { key: 'garten', icon: 'leaf-01', label: 'Garten' },
  { key: 'reinigung', icon: 'home-12', label: 'Reinigung' },
  { key: 'betreuung', icon: 'hand-coins', label: 'Betreuung' },
  { key: 'nachhilfe', icon: 'book-03', label: 'Nachhilfe' },
  { key: 'sport', icon: 'running-shoes', label: 'Sport & Fitness' },
  { key: 'sonstiges', icon: 'note', label: 'Sonstiges' },
];
