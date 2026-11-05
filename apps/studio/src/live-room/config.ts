// Fixed endpoints of the Röbel App live room. The Supabase key below is the PUBLIC anon key
// (role "anon", row-level security applies) — never put a service-role key here.

export const SUPABASE_URL = 'https://wwbeqhkslxdxhktqzqti.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3YmVxaGtzbHhkeGhrdHF6cXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTUyMTIsImV4cCI6MjA2ODY5MTIxMn0.ETISOumSNns3OVO-FC10FDQAZQVdJnubx3Qu_iHGHGI';

export const API_BASE = 'https://www.roebel.app';

/** Own persistence; never part of ShowState (which is autosaved and broadcast to the overlay page). */
export const LIVE_ROOM_STORAGE_KEY = 'roebel-studio-liveroom-v1';

/** Chat columns anon may read (`*` fails: wallet is not readable). */
export const CHAT_COLUMNS = 'id,show_id,display_name,avatar_url,body,kind,amount_cents,created_at,hidden_at,featured_at';
