import { supabase } from './supabase';

/** Record a unique view for an event. Deduplicates per user. */
export async function recordView(
  eventId: string,
  walletAddress: string
): Promise<void> {
  await supabase.from('event_views').upsert(
    { event_id: eventId, wallet_address: walletAddress },
    { onConflict: 'event_id,wallet_address', ignoreDuplicates: true }
  );
}

/** Get total unique view count for an event. */
export async function getViewCount(eventId: string): Promise<number> {
  const { count } = await supabase
    .from('event_views')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  return count ?? 0;
}
