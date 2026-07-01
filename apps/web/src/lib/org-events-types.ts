// Shared types for the org-events dashboard. Kept out of the "use server" action
// module so that module only exports async functions (a Next.js requirement).

export interface OrgEventFields {
  title: string
  description: string | null
  date: string
  time: string | null
  end_time: string | null
  location: string
  category: string | null
  organizer_name: string
  organizer_email: string
  organizer_phone: string | null
  website_url: string | null
  ticket_price: number | null
  max_attendees: number | null
  is_cancelled: boolean
  image_url: string | null
  audio_url: string | null
  livestream_url: string | null
  livestream_active: boolean
}

export interface OrgEventRow {
  id: string
  title: string | null
  date: string | null
  time: string | null
  status: string | null
  is_cancelled: boolean
  image_url: string | null
  location: string | null
  max_attendees: number | null
  interestCount: number
  viewCount: number
  experienceCount: number
}

export interface OrgEventsOverview {
  total: number
  upcoming: number
  drafts: number
  published: number
  totalInterests: number
  totalViews: number
  thisMonth: number
}

export interface EventInterest {
  wallet: string
  name: string
  created_at: string | null
}

export interface OrgEventStats {
  views: number
  interests: number
  experiences: number
  maxAttendees: number | null
}

export interface EventQrStatus {
  linked: boolean
  rewardEventId: string | null
  url: string | null
  attendanceCount: number
  canCreate: boolean
  reason: string | null
}
