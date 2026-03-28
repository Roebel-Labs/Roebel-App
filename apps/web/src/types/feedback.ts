export type FeedbackType = "bug_report" | "feature_request" | "general" | "improvement"

export type FeedbackStatus = "new" | "in_review" | "resolved" | "closed"

export interface DeviceInfo {
  userAgent?: string
  platform?: string
  language?: string
  screenResolution?: string
  [key: string]: any
}

export interface Feedback {
  id: string
  user_wallet_address: string | null
  feedback_type: FeedbackType
  subject: string
  message: string
  contact_email: string | null
  contact_phone: string | null
  device_info: DeviceInfo | null
  status: FeedbackStatus
  created_at: string
  updated_at: string
}

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug_report: "Bug Report",
  feature_request: "Feature Request",
  general: "Allgemein",
  improvement: "Verbesserung",
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Neu",
  in_review: "In Prüfung",
  resolved: "Gelöst",
  closed: "Geschlossen",
}

export const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  in_review: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-muted text-foreground",
}

export const FEEDBACK_TYPE_COLORS: Record<FeedbackType, string> = {
  bug_report: "bg-red-100 text-red-800",
  feature_request: "bg-purple-100 text-purple-800",
  general: "bg-muted text-foreground",
  improvement: "bg-blue-100 text-blue-800",
}
