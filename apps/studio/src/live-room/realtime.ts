// Supabase Realtime (anon): table changes of one show, viewer presence and on-air reactions.
// The studio never tracks presence itself, so it does not count as a viewer.

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { ChatMessage, LiveShow, RundownItem } from './types';

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  return (client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

export type RealtimeState = 'off' | 'connecting' | 'connected' | 'error';

export type RealtimeHandlers = {
  onState(s: RealtimeState): void;
  onShow(show: Partial<LiveShow> & { id: string }): void;
  onRundownChange(): void;
  onChat(m: Partial<ChatMessage> & { id: string }, event: 'INSERT' | 'UPDATE' | 'DELETE'): void;
  onViewers(n: number): void;
  onReaction(emoji: string): void;
};

export function subscribeShow(showId: string, h: RealtimeHandlers): () => void {
  const s = sb();
  let dbOk = false;
  let roomOk = false;
  const report = (status: string, which: 'db' | 'room') => {
    if (status === 'SUBSCRIBED') {
      if (which === 'db') dbOk = true;
      else roomOk = true;
      h.onState(dbOk && roomOk ? 'connected' : 'connecting');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (which === 'db') dbOk = false;
      else roomOk = false;
      h.onState('error');
    } else if (status === 'CLOSED') {
      h.onState('off');
    }
  };
  h.onState('connecting');

  const db: RealtimeChannel = s
    .channel(`studio-db:${showId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_shows', filter: `id=eq.${showId}` }, (p) => {
      if (p.new && (p.new as { id?: string }).id) h.onShow(p.new as LiveShow);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_rundown_items', filter: `show_id=eq.${showId}` }, () =>
      h.onRundownChange(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_messages', filter: `show_id=eq.${showId}` }, (p) => {
      const row = (p.eventType === 'DELETE' ? p.old : p.new) as Partial<ChatMessage> & { id?: string };
      if (row?.id) h.onChat(row as Partial<ChatMessage> & { id: string }, p.eventType);
    })
    .subscribe((status) => report(status, 'db'));

  const room: RealtimeChannel = s
    .channel(`live:${showId}`, { config: { broadcast: { self: false } } })
    .on('presence', { event: 'sync' }, () => h.onViewers(Object.keys(room.presenceState()).length))
    .on('broadcast', { event: 'react' }, (p) => {
      const e = (p.payload as { e?: unknown } | undefined)?.e;
      if (typeof e === 'string' && e.length <= 8) h.onReaction(e);
    })
    .subscribe((status) => report(status, 'room'));

  return () => {
    void s.removeChannel(db);
    void s.removeChannel(room);
  };
}
