// ============================================
// Event Experience Types
// ============================================

export interface EventExperience {
  id: string;
  event_id: string;
  wallet_address: string;
  content: string;
  media_urls: string[];
  video_url: string | null;
  emoji: string | null;
  status: "published" | "deleted";
  created_at: string;
  author_username: string | null;
  author_profile_picture_url: string | null;
}

export interface CreateExperienceInput {
  event_id: string;
  wallet_address: string;
  content: string;
  media_urls?: string[];
  video_url?: string | null;
  emoji?: string | null;
}
