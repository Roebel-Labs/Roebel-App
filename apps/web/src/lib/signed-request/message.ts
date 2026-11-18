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

/** Livestream sponsoring bookings (orgs book ad slots); own scope like the task actions. */
export const SPONSORING_SCOPE = "roebel-sponsoring-v1" as const;
export type SponsoringAction = "sponsoring_checkout" | "sponsoring_mine" | "sponsoring_set_creative" | "sponsoring_set_dishes";

/** Livestream live room (chat/vote/remind session); own scope like sponsoring. */
export const LIVE_SCOPE = "roebel-live-v1" as const;
export type LiveAction = "live_session";

/** Mini-app user tokens (host asks the server for a short-lived token); own scope like the others. */
export const MINIAPP_SCOPE = "roebel-miniapp-v1" as const;
export type MiniAppAction = "user_token" | "identity_get" | "identity_set" | "org_binding_list" | "org_binding_decide";
/** Credential register (apps/web/src/lib/credentials); own scope like sponsoring. Mirrored in
 *  apps/expo/lib/signed-request.ts. `people_preview` and the event/badge actions arrive in plan 4,
 *  the two `zk_*` actions in plan 6. */
export const CREDENTIALS_SCOPE = "roebel-credentials-v1" as const;
export type CredentialAction =
  | "types_list" | "type_prepare" | "people_list" | "people_search" | "batch_prepare" | "revoke_prepare"
  | "delegate_prepare" | "members_public_prepare" | "orgs_list" | "actions_list" | "action_get" | "action_submitted"
  | "action_cancel" | "letters" | "mine" | "redeem" | "respond" | "holdings" | "present_create" | "present_resolve"
  | "people_preview" | "event_badges_list" | "event_badge_setup" | "event_badge_get" | "event_badge_prepare"
  | "event_badge_auto" | "badge_nudge" | "zk_join" | "zk_status";

export type TicketAction =
  | "connect_onboard" | "connect_session" | "connect_status" | "ticket_types_upsert" | "ticket_types_list" | "checkout"
  | "order_status" | "tickets_list" | "orders_list" | "checkin" | "refund_order";

export function buildSignedMessage(
  scope: string, action: string, wallet: string, timestampSec: number, payload: Record<string, unknown>,
): string {
  return `${scope}:${action}:${wallet.toLowerCase()}:${timestampSec}:${hashPayload(payload)}`;
}
