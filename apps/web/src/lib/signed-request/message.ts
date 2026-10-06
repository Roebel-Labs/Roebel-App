// Canonical message spec for wallet-signed ticket requests. Reuses hashPayload
// from org-membership/message so the digest stays byte-identical across the
// org-membership grammar and this ticket-scoped one (same noble/hashes impl).
// Relative import (not the @/ alias) because this file is also loaded via
// `npx tsx --test`, where the tsconfig `paths` alias may not resolve.
import { hashPayload } from "../org-membership/message";

export const SIGNED_SCOPE = "roebel-tickets-v1" as const;
export const MAX_SIGNED_AGE_SECONDS = 300;
/** Proposal-task actions get their own scope so a ticket signature never replays as a task action. */
export const VORHABEN_SCOPE = "roebel-vorhaben-v1" as const;

export type VorhabenAction =
  | "task_create" | "task_apply" | "task_withdraw" | "task_assign" | "task_start" | "task_comment"
  | "task_proof" | "task_submit" | "task_approve" | "task_request_changes" | "task_cancel" | "payout_record_manual"
  | "payout_record_card";

export type TicketAction =
  | "connect_onboard" | "connect_session" | "connect_status" | "ticket_types_upsert" | "ticket_types_list" | "checkout"
  | "order_status" | "tickets_list" | "orders_list" | "checkin" | "refund_order";

export function buildSignedMessage(
  scope: string, action: string, wallet: string, timestampSec: number, payload: Record<string, unknown>,
): string {
  return `${scope}:${action}:${wallet.toLowerCase()}:${timestampSec}:${hashPayload(payload)}`;
}
