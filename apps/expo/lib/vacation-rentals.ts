/**
 * Ferienwohnungen (vacation rentals): published rows of `vacation_rentals`,
 * each owned by a host org account. Booking is a request, not a payment:
 * the guest sends a structured message into the host's org chat and the
 * host confirms there (same as the hosts' own websites: no prepayment).
 */
import { supabase } from './supabase';

export interface VacationRentalHighlight {
  title: string;
  text: string;
  /** Ionicons name. */
  icon?: string;
}

export interface VacationRentalHost {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface VacationRental {
  id: string;
  slug: string;
  account_id: string;
  title: string;
  kind_label: string;
  description: string | null;
  highlights: VacationRentalHighlight[];
  amenities: string[];
  max_guests: number;
  bedrooms: number | null;
  beds_label: string | null;
  bathrooms: number | null;
  size_sqm: number | null;
  price_per_night: number;
  cleaning_fee: number | null;
  min_nights: number;
  check_in_from: string | null;
  check_out_until: string | null;
  house_rules: string[];
  cancellation_policy: string | null;
  payment_note: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  badge: string | null;
  host: VacationRentalHost | null;
}

// FK pinned: accounts is referenced once, but keep it explicit like restaurants.
const COLUMNS = '*, host:accounts!vacation_rentals_account_id_fkey(id, name, avatar_url)';

export const VACATION_RENTALS_QUERY_KEY = ['explore', 'vacation-rentals'] as const;

function normalize(row: any): VacationRental {
  return {
    ...row,
    price_per_night: Number(row.price_per_night),
    cleaning_fee: row.cleaning_fee == null ? null : Number(row.cleaning_fee),
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    amenities: row.amenities ?? [],
    house_rules: row.house_rules ?? [],
    images: row.images ?? [],
  };
}

export async function fetchVacationRentals(): Promise<VacationRental[]> {
  const { data, error } = await supabase
    .from('vacation_rentals' as any)
    .select(COLUMNS)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
    .limit(50); // LIMIT
  // Table missing (migration not applied yet) or any error: hide the rail.
  if (error) return [];
  return ((data as any[] | null) ?? []).map(normalize);
}

export async function fetchVacationRental(slug: string): Promise<VacationRental | null> {
  const { data, error } = await supabase
    .from('vacation_rentals' as any)
    .select(COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !data) return null;
  return normalize(data);
}

// ── Formatting ───────────────────────────────────────────────────────

export function formatEuro(value: number): string {
  const whole = Number.isInteger(value);
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function guestsLabel(n: number): string {
  return `${n} ${n === 1 ? 'Gast' : 'Gäste'}`;
}

export function nightsLabel(n: number): string {
  return `${n} ${n === 1 ? 'Nacht' : 'Nächte'}`;
}

/** "2 Gäste · 1 Schlafzimmer · 1 Bad" */
export function rentalFactsLine(r: Pick<VacationRental, 'max_guests' | 'bedrooms' | 'bathrooms' | 'size_sqm'>): string {
  return [
    `bis ${guestsLabel(r.max_guests)}`,
    r.bedrooms != null ? `${r.bedrooms} Schlafzimmer` : null,
    r.bathrooms != null ? `${r.bathrooms} ${r.bathrooms === 1 ? 'Bad' : 'Bäder'}` : null,
    r.size_sqm ? `${r.size_sqm} m²` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── Dates (local calendar days as YYYY-MM-DD) ────────────────────────

export function toIsoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseIsoDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseIsoDay(checkOut).getTime() - parseIsoDay(checkIn).getTime()) / 86_400_000);
}

/** "5.–7. Sep. 2026" / "30. Sep. – 2. Okt. 2026" */
export function formatStayRange(checkIn: string, checkOut: string): string {
  const a = parseIsoDay(checkIn);
  const b = parseIsoDay(checkOut);
  const month = (d: Date) => d.toLocaleDateString('de-DE', { month: 'short' });
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}.–${b.getDate()}. ${month(b)} ${b.getFullYear()}`;
  }
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${a.getDate()}. ${month(a)}${sameYear ? '' : ` ${a.getFullYear()}`} – ${b.getDate()}. ${month(b)} ${b.getFullYear()}`;
}

export interface StayQuote {
  nights: number;
  nightsTotal: number;
  cleaningFee: number;
  total: number;
}

export function quoteStay(r: Pick<VacationRental, 'price_per_night' | 'cleaning_fee'>, nights: number): StayQuote {
  const nightsTotal = r.price_per_night * nights;
  const cleaningFee = r.cleaning_fee ?? 0;
  return { nights, nightsTotal, cleaningFee, total: nightsTotal + cleaningFee };
}

export interface StayRequest {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  message: string;
}

/** Plain-text chat message the host receives; readable on every chat rail. */
export function buildStayRequestMessage(r: VacationRental, req: StayRequest): string {
  const nights = nightsBetween(req.checkIn, req.checkOut);
  const quote = quoteStay(r, nights);
  const guests = [
    `${req.adults} ${req.adults === 1 ? 'Erwachsene/r' : 'Erwachsene'}`,
    req.children ? `${req.children} ${req.children === 1 ? 'Kind' : 'Kinder'}` : null,
    req.infants ? `${req.infants} ${req.infants === 1 ? 'Kleinkind' : 'Kleinkinder'}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    `Buchungsanfrage: ${r.title}`,
    `${formatStayRange(req.checkIn, req.checkOut)} (${nightsLabel(nights)})`,
    guests,
    `Preis laut App: ${formatEuro(quote.total)}`,
    req.message.trim() ? `\n${req.message.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
