// Canonical message spec for wallet-signed ticket requests. Reuses hashPayload
// from org-membership/message so the digest stays byte-identical across the
// org-membership grammar and this ticket-scoped one (same noble/hashes impl).
// Relative import (not the @/ alias) because this file is also loaded via
// `npx tsx --test`, where the tsconfig `paths` alias may not resolve.
import { hashPayload } from "../org-membership/message";

export const SIGNED_SCOPE = "roebel-tickets-v1" as const;
export const MAX_SIGNED_AGE_SECONDS = 300;

export type TicketAction =
  | "connect_onboard" | "connect_status" | "ticket_types_upsert" | "checkout"
  | "order_status" | "tickets_list" | "checkin" | "refund_order";

export function buildSignedMessage(
  scope: string, action: string, wallet: string, timestampSec: number, payload: Record<string, unknown>,
): string {
  return `${scope}:${action}:${wallet.toLowerCase()}:${timestampSec}:${hashPayload(payload)}`;
}
