// Livestream sponsoring (DanceCup 2026 first): orgs book ad slots from their profile.
// Campaign + packages + slot counts are public reads; booking and "my bookings" go through
// the signed web route /api/sponsoring (owner/admin check on the server).
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { getApiBaseUrl, postSigned, SPONSORING_SCOPE, type ApiResult, type SigningAccount } from './signed-request';
import { uploadVideoToStream } from './stream-upload';

export const DANCECUP_SLUG = 'dancecup-2026';

export type MediaKind = 'image' | 'video';
export type BookingStatus = 'requested' | 'pending_payment' | 'paid' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'refunded';

export interface SponsoringCampaign {
  id: string; slug: string; title: string; subtitle: string | null; description: string | null;
  highlights: string[]; hero_image_url: string | null; event_starts_at: string | null; venue: string | null;
  booking_deadline: string;
}
export interface SponsoringPackage {
  id: string; campaign_id: string; name: string; description: string | null; includes: string[];
  price_cents: number; capacity: number | null; accepts: MediaKind[]; max_video_seconds: number | null;
  payment_link_url: string | null; sort_order: number;
}
export interface SponsoringBooking {
  id: string; package_id: string; status: BookingStatus; media_kind: MediaKind | null; media_url: string | null;
  creative_id: string | null; amount_cents: number; review_note: string | null; created_at: string; paid_at: string | null;
}
export interface SponsoringCreative { id: string; image_url: string; variant: number; source: 'ai_logo' | 'ai_wordmark' | 'upload' }
export interface Supporter { org_account_id: string; name: string; avatar_url: string | null; package_id: string; paid_at: string | null }
export interface CampaignView {
  campaign: SponsoringCampaign;
  packages: (SponsoringPackage & { taken: number })[];
}

// Tables are newer than the generated Supabase types: untyped client, rows cast below.
const db = supabase as any;

export async function fetchCampaign(slug: string): Promise<CampaignView | null> {
  const { data: campaign, error } = await db
    .from('sponsoring_campaigns')
    .select('id, slug, title, subtitle, description, highlights, hero_image_url, event_starts_at, venue, booking_deadline')
    .eq('slug', slug)
    .maybeSingle();
  // Table missing (migration not applied yet) or campaign inactive → nothing to show.
  if (error || !campaign) return null;
  const [{ data: packages }, { data: avail }] = await Promise.all([
    db.from('sponsoring_packages')
      .select('id, campaign_id, name, description, includes, price_cents, capacity, accepts, max_video_seconds, payment_link_url, sort_order')
      .eq('campaign_id', campaign.id)
      .order('sort_order'),
    db.rpc('sponsoring_availability', { p_campaign_id: campaign.id }),
  ]);
  const taken = new Map<string, number>(((avail ?? []) as { package_id: string; taken: number }[]).map((r) => [r.package_id, r.taken]));
  return {
    campaign: campaign as SponsoringCampaign,
    packages: ((packages ?? []) as SponsoringPackage[]).map((p) => ({ ...p, taken: taken.get(p.id) ?? 0 })),
  };
}

export function isBookingOpen(campaign: Pick<SponsoringCampaign, 'booking_deadline'>, now: number = Date.now()): boolean {
  return now <= Date.parse(campaign.booking_deadline);
}

/** The entry tier ("Unterstützer": name in the credits) works without an upload; every other package needs one. */
export function isMediaOptional(pkg: Pick<SponsoringPackage, 'name' | 'includes'>): boolean {
  return pkg.name === 'Unterstützer' || pkg.includes.some((i) => /optional/i.test(i));
}

export function slotsLeft(pkg: { capacity: number | null; taken: number }): number | null {
  return pkg.capacity == null ? null : Math.max(0, pkg.capacity - pkg.taken);
}

export function fetchMyBookings(account: SigningAccount, orgAccountId: string, slug: string) {
  return postSigned<{ bookings: SponsoringBooking[] }>(
    '/api/sponsoring', account, 'sponsoring_mine', { org_account_id: orgAccountId, campaign_slug: slug }, SPONSORING_SCOPE,
  );
}

/** The org's personal AI ad cards for this campaign (pre-generated, public). */
export async function fetchCreatives(campaignId: string, orgAccountId: string): Promise<SponsoringCreative[]> {
  const { data } = await db.from('sponsoring_creatives')
    .select('id, image_url, variant, source')
    .eq('campaign_id', campaignId).eq('org_account_id', orgAccountId)
    .order('created_at', { ascending: false });
  return (data ?? []) as SponsoringCreative[];
}

/** Orgs that already paid (name, logo, package). Also tells the app, without a signature, what the own org bought. */
export async function fetchSupporters(campaignId: string): Promise<Supporter[]> {
  const { data } = await db.rpc('sponsoring_supporters', { p_campaign_id: campaignId });
  return (data ?? []) as Supporter[];
}

export type AdMaterial =
  | { creativeId: string }
  | { mediaKind: MediaKind; mediaUrl: string }
  | null;

function materialPayload(m: AdMaterial): Record<string, unknown> {
  if (!m) return {};
  return 'creativeId' in m ? { creative_id: m.creativeId } : { media_kind: m.mediaKind, media_url: m.mediaUrl };
}

export function startCheckout(
  account: SigningAccount,
  input: { orgAccountId: string; packageId: string; material: AdMaterial; upgradeBookingId?: string | null },
): Promise<ApiResult<{ booking_id: string; url: string; amount_cents: number; expires_at: string }>> {
  return postSigned('/api/sponsoring', account, 'sponsoring_checkout', {
    org_account_id: input.orgAccountId,
    package_id: input.packageId,
    ...materialPayload(input.material),
    ...(input.upgradeBookingId ? { upgrade_booking_id: input.upgradeBookingId } : {}),
  }, SPONSORING_SCOPE);
}

/** Stripe Checkout in the in-app browser; it closes itself on the roebel://org/sponsoring/<slug> return. */
export async function openSponsoringCheckout(url: string, slug: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, `roebel://org/sponsoring/${slug}`, { showInRecents: true });
}

export function setBookingCreative(account: SigningAccount, orgAccountId: string, bookingId: string, material: Exclude<AdMaterial, null>) {
  return postSigned<{ booking: SponsoringBooking }>('/api/sponsoring', account, 'sponsoring_set_creative', {
    org_account_id: orgAccountId, booking_id: bookingId, ...materialPayload(material),
  }, SPONSORING_SCOPE);
}

/** The produced 15 s spot ("Werbespot nach Maß"); every other package is the automatic logo spot. */
export function isCustomSpot(pkg: Pick<SponsoringPackage, 'name'>): boolean {
  return /nach ma(ß|ss)/i.test(pkg.name);
}

/** Pre-selection: the produced spot for orgs with dish photos (restaurants), else the cheapest package. */
export function recommendedPackageId(packages: { id: string; name: string; price_cents: number }[], hasDishes: boolean): string | null {
  const custom = packages.find((p) => isCustomSpot(p));
  if (hasDishes && custom) return custom.id;
  return [...packages].sort((a, b) => a.price_cents - b.price_cents)[0]?.id ?? null;
}

export interface DishPhoto { name: string; price: number | null; image_url: string }

/** Up to `limit` menu photos of the org's restaurant(s): the material of its personal spot preview. */
export async function fetchDishPhotos(orgAccountId: string, limit = 4): Promise<DishPhoto[]> {
  const { data: restaurants } = await db.from('restaurants').select('id').eq('account_id', orgAccountId);
  const ids = ((restaurants ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return [];
  const { data } = await db.from('menu_items')
    .select('name, price, image_url')
    .in('restaurant_id', ids)
    .not('image_url', 'is', null)
    .order('sort_order', { ascending: true })
    .limit(40);
  const rows = (data ?? []) as DishPhoto[];
  // Spread the picks over the menu instead of four starters in a row.
  const step = Math.max(1, Math.floor(rows.length / limit));
  return rows.filter((_, i) => i % step === 0).slice(0, limit);
}

let logoColors: Promise<Record<string, string | null>> | null = null;

/**
 * Background colour of an org logo for the Logo-Spot, precomputed on the website
 * (apps/web/scripts/sponsoring-logo-colors.ts → /sponsoring/logo-colors.json). Unknown logo,
 * transparent logo or no network → null (white).
 */
export async function fetchLogoColor(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (!logoColors) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    logoColors = fetch(`${getApiBaseUrl()}/sponsoring/logo-colors.json`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => { logoColors = null; return {}; })
      .finally(() => clearTimeout(timer));
  }
  const map = await logoColors;
  const c = map[logoUrl];
  return typeof c === 'string' && /^#[0-9A-F]{6}$/i.test(c) ? c : null;
}

export const IMAGE_MIMES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Logos are uploaded UNCOMPRESSED (the generic post uploader turns everything into JPEG, which
 * would kill a transparent PNG). Videos go to Cloudflare Stream like post videos.
 */
export async function uploadSponsoringMedia(
  asset: { uri: string; mimeType?: string | null },
  kind: MediaKind,
  wallet: string,
  onProgress?: (fraction: number) => void,
): Promise<string | null> {
  if (kind === 'video') return uploadVideoToStream(asset.uri, wallet, onProgress);
  const mime = asset.mimeType && IMAGE_MIMES[asset.mimeType] ? asset.mimeType : 'image/png';
  try {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64) return null;
    const path = `sponsoring/${Date.now()}-${Math.random().toString(36).slice(2)}.${IMAGE_MIMES[mime]}`;
    const { error } = await supabase.storage.from('images').upload(path, decode(base64), {
      contentType: mime, cacheControl: '31536000', upsert: false,
    });
    if (error) { console.error('[sponsoring] upload', error); return null; }
    onProgress?.(1);
    return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.error('[sponsoring] upload failed', err);
    return null;
  }
}

export function formatEuro(cents: number): string {
  return `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: cents % 100 ? 2 : 0 })} €`;
}

export function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case 'requested': return 'Angefragt';
    case 'pending_payment': return 'Zahlung offen';
    case 'paid': return 'Bezahlt';
    case 'approved': return 'Freigegeben';
    case 'rejected': return 'Abgelehnt';
    case 'cancelled': return 'Storniert';
    case 'expired': return 'Abgelaufen';
    case 'refunded': return 'Erstattet';
  }
}

/** "Do., 6. Nov., 12:00 Uhr" */
export function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return `${day}, ${time} Uhr`;
}
