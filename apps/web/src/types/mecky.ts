export interface MeckyDraft {
  id: string
  content: string
  source_url: string | null
  source_title: string | null
  source_site: string | null
  source_published_at: string | null
  rss_item_guid: string | null
  og_title: string | null
  og_description: string | null
  og_image: string | null
  og_site_name: string | null
  ai_model: string
  status: "pending" | "approved" | "rejected"
  approved_post_id: string | null
  reviewed_at: string | null
  created_at: string
}
