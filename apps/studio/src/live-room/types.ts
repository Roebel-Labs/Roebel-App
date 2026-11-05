// Shapes of the Röbel App live room (docs/superpowers/specs/2026-11-05-live-room-design.md).

export type LiveShowStatus = 'scheduled' | 'live' | 'ended';

export type LiveShow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: LiveShowStatus;
  starts_at: string | null;
  hls_url: string | null;
  cf_live_input_id: string | null;
  current_item_id: string | null;
  chat_enabled: boolean;
  slow_mode_seconds: number;
  voting_open: boolean;
  is_test?: boolean;
  guests_enabled?: boolean;
  overlay: Record<string, unknown> | null;
  updated_at?: string;
};

export type RundownItem = {
  id: string;
  show_id: string;
  position: number;
  title: string;
  subtitle: string | null;
  detail: string | null;
  planned_at: string | null;
  status: 'upcoming' | 'on_stage' | 'done';
  on_stage_at: string | null;
};

export type ChatMessage = {
  id: string;
  show_id: string;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  kind: 'chat' | 'support' | 'system';
  amount_cents: number | null;
  created_at: string;
  hidden_at: string | null;
  featured_at: string | null;
};

export type RundownRowInput = { title: string; subtitle: string | null; detail: string | null; planned_at: string | null };

export type CfInputInfo = {
  rtmps_url: string | null;
  stream_key: string | null;
  srt_url: string | null;
  srt_stream_id: string | null;
  srt_passphrase: string | null;
  state: string | null;
  connected: boolean | null;
  hls_url: string | null;
};

export type CfOutput = { uid: string; url: string; enabled: boolean; state: string | null };

export type GuestRequest = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  note: string | null;
  status: 'requested' | 'accepted' | 'declined' | 'ended' | string;
  room: string | null;
  created_at: string;
};

export type GuestJoin = { request_id: string; display_name: string | null; room: string; livekit_url: string; token: string };

export type VoteResults = {
  voting_open: boolean;
  total: number;
  items: { item_id: string; title: string; subtitle: string | null; votes: number }[];
};
