export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "bounced" | "complained"
export type SubscriberSource = "signup" | "import" | "app_user" | "admin"
export type IssueStatus = "draft" | "sending" | "sent" | "failed"
export type SendStatus = "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed"

export interface NewsletterSubscriber {
  id: string
  email: string
  status: SubscriberStatus
  source: SubscriberSource
  wallet_address: string | null
  confirm_token: string
  confirmed_at: string | null
  unsubscribe_token: string
  unsubscribed_at: string | null
  consent_note: string | null
  created_at: string
  updated_at: string
}

export interface NewsletterIssue {
  id: string
  subject: string
  preheader: string | null
  content_html: string
  hero_image_url: string | null
  status: IssueStatus
  generated_by: "ai" | "manual"
  generation_sources: Record<string, number> | null
  recipient_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface NewsletterSend {
  id: string
  issue_id: string
  subscriber_id: string
  email: string
  resend_id: string | null
  status: SendStatus
  opened_at: string | null
  clicked_at: string | null
  created_at: string
}
