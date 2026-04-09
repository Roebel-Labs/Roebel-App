export type HelpCollection = {
  id: string;
  title: string;
  subtitle: string | null;
  icon_url: string | null;
  cover_image_url: string | null;
  display_order: number;
  is_featured: boolean;
  is_published: boolean;
  created_at: string;
};

export type HelpItem = {
  id: string;
  collection_id: string;
  title: string;
  subtitle: string | null;
  icon_url: string | null;
  hero_media_url: string | null;
  hero_media_type: 'image' | 'video';
  body_text: string | null;
  steps: string[] | null;
  action_enabled: boolean;
  action_label: string | null;
  action_route: string | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
};

export type HelpVideo = {
  id: string;
  title: string;
  thumbnail_url: string;
  youtube_url: string;
  duration: string;
  published_date: string;
  display_order: number;
  is_published: boolean;
  created_at: string;
};
