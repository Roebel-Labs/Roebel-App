// Ticket types for the event ticketing system

export type EventDay = "saturday" | "sunday";

export interface EventTicket {
  id: string;
  ticket_code: string;
  event_name: string;
  event_day: EventDay;
  event_date: string;
  event_location: string;
  buyer_email: string;
  buyer_name: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  amount_paid: number;
  currency: string;
  status: TicketStatus;
  redeemed_at: string | null;
  redeemed_by: string | null;
  created_at: string;
  updated_at: string;
  qr_code_url: string | null;
  pdf_url: string | null;
}

export type TicketStatus = "active" | "redeemed" | "cancelled" | "refunded";

export interface CreateTicketInput {
  ticket_code: string;
  event_day: EventDay;
  buyer_email: string;
  buyer_name?: string;
  stripe_session_id?: string;
  stripe_payment_intent?: string;
  amount_paid: number;
  currency?: string;
}

export interface TicketVerificationResult {
  success: boolean;
  ticket?: EventTicket;
  error?: string;
}

export interface TicketRedemptionResult {
  success: boolean;
  message: string;
  ticket?: EventTicket;
  error?: string;
}

// Stripe checkout metadata
export interface TicketCheckoutMetadata {
  event_name: string;
  event_day: EventDay;
  event_date: string;
  event_location: string;
}

// Email template data
export interface TicketEmailData {
  ticket_code: string;
  buyer_email: string;
  buyer_name: string | null;
  event_name: string;
  event_day: EventDay;
  event_day_label: string;
  event_date: string;
  event_location: string;
  amount_paid: number;
  currency: string;
  qr_code_url: string;
  purchase_date: string;
}
