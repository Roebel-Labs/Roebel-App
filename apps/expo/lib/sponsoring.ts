// Livestream sponsoring (DanceCup 2026 first): orgs book ad slots from their profile.
// Campaign + packages + slot counts are public reads; booking and "my bookings" go through
// the signed web route /api/sponsoring (owner/admin check on the server).
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { postSigned, SPONSORING_SCOPE, type ApiResult, type SigningAccount } from './signed-request';
import { uploadVideoToStream } from './stream-upload';

export const DANCECUP_SLUG = 'dancecup-2026';

export type MediaKind = 'image' | 'video';
export type BookingStatus = 'requested' | 'paid' | 'approved' | 'rejected' | 'cancelled';

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
  note: string | null; amount_cents: number; review_note: string | null; created_at: string;
}
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

export function bookPackage(
  account: SigningAccount,
  input: { orgAccountId: string; packageId: string; mediaKind: MediaKind | null; mediaUrl: string | null; note: string },
): Promise<ApiResult<{ booking: SponsoringBooking; payment_link_url: string | null }>> {
  return postSigned('/api/sponsoring', account, 'sponsoring_book', {
    org_account_id: input.orgAccountId,
    package_id: input.packageId,
    media_kind: input.mediaKind,
    media_url: input.mediaUrl,
    note: input.note.trim() || null,
  }, SPONSORING_SCOPE);
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
    case 'paid': return 'Bezahlt';
    case 'approved': return 'Freigegeben';
    case 'rejected': return 'Abgelehnt';
    case 'cancelled': return 'Storniert';
  }
}

/** "Do., 6. Nov., 12:00 Uhr" */
export function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return `${day}, ${time} Uhr`;
}
