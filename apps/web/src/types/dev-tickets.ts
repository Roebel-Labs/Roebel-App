export type DevTicketType = "bug" | "feature" | "task" | "improvement"
export type DevTicketPriority = "low" | "medium" | "high" | "urgent"
export type DevTicketStatus =
  | "inbox"
  | "backlog"
  | "in_progress"
  | "in_review"
  | "done"
  | "rejected"
export type DevTicketFixStatus =
  | "none"
  | "queued"
  | "running"
  | "pr_open"
  | "failed"
  | "merged"
export type DevTicketSource = "manual" | "mecky" | "feedback_form"

export interface DevTicketAiAnalysis {
  repro_steps?: string[]
  suspected_area?: string
  severity_rationale?: string
  dedup_notes?: string
}

export interface DevTicket {
  id: string
  title: string
  description: string
  type: DevTicketType
  priority: DevTicketPriority
  status: DevTicketStatus
  position: number
  source: DevTicketSource
  source_feedback_id: string | null
  ai_analysis: DevTicketAiAnalysis | null
  github_branch: string | null
  github_pr_number: number | null
  github_pr_url: string | null
  fix_status: DevTicketFixStatus
  fix_dispatched_at: string | null
  created_at: string
  updated_at: string
}

export interface DevTicketActivity {
  id: string
  ticket_id: string
  author: "admin" | "ai" | "system"
  body: string
  created_at: string
}

/** fix_status values during which GitHub state should be polled */
export const ACTIVE_FIX_STATUSES: DevTicketFixStatus[] = [
  "queued",
  "running",
  "pr_open",
]
