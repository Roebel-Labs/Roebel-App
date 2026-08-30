/**
 * Photo gallery for organisation accounts.
 *
 * Owners maintain it from `app/edit-org.tsx`; the map bottom sheet and the org
 * profile render it. Ordering is explicit (`sort_order`) rather than by upload
 * time, so an owner can lead with their best shot.
 */
import { supabase } from './supabase';
import type { AccountPhoto } from './types';

export async function fetchAccountPhotos(accountId: string): Promise<AccountPhoto[]> {
  const { data, error } = await supabase
    .from('account_photos')
    .select('*')
    .eq('account_id', accountId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchAccountPhotos error:', error);
    return [];
  }
  return (data as AccountPhoto[]) ?? [];
}

/** Batch variant for screens that render several orgs at once. */
export async function fetchAccountPhotosFor(
  accountIds: string[]
): Promise<Record<string, AccountPhoto[]>> {
  if (!accountIds.length) return {};

  const { data, error } = await supabase
    .from('account_photos')
    .select('*')
    .in('account_id', accountIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchAccountPhotosFor error:', error);
    return {};
  }

  const grouped: Record<string, AccountPhoto[]> = {};
  for (const photo of (data as AccountPhoto[]) ?? []) {
    (grouped[photo.account_id] ??= []).push(photo);
  }
  return grouped;
}

/**
 * Append a photo to the end of the gallery. `url` must already be uploaded —
 * use `uploadMediaFile(uri, wallet, 'image', 'org-photos')`.
 */
export async function addAccountPhoto(input: {
  account_id: string;
  url: string;
  uploaded_by: string;
  caption?: string | null;
}): Promise<AccountPhoto | null> {
  // Read the current tail rather than counting rows: a deleted photo must not
  // make the next upload collide with an existing sort_order.
  const { data: last } = await supabase
    .from('account_photos')
    .select('sort_order')
    .eq('account_id', input.account_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('account_photos')
    .insert({
      account_id: input.account_id,
      url: input.url,
      caption: input.caption ?? null,
      uploaded_by: input.uploaded_by.toLowerCase(),
      sort_order: nextOrder,
    })
    .select('*')
    .single();

  if (error) {
    console.error('addAccountPhoto error:', error);
    return null;
  }
  return data as AccountPhoto;
}

export async function deleteAccountPhoto(photoId: string): Promise<boolean> {
  const { error } = await supabase.from('account_photos').delete().eq('id', photoId);
  if (error) {
    console.error('deleteAccountPhoto error:', error);
    return false;
  }
  return true;
}

/**
 * Persist a reordered gallery. Takes the full ordered id list and rewrites
 * `sort_order` to match, so the caller can just move an item in an array.
 */
export async function reorderAccountPhotos(orderedIds: string[]): Promise<boolean> {
  const updates = orderedIds.map((id, index) =>
    supabase.from('account_photos').update({ sort_order: index }).eq('id', id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('reorderAccountPhotos error:', failed.error);
    return false;
  }
  return true;
}
