/**
 * Process-wide singletons shared by POST /api/passkey/sponsor and POST /api/passkey/sponsor/settle:
 * the settle route must adjust the SAME budget the sponsor route reserved in (matters for the
 * in-memory store; the Supabase store is shared anyway). Server-only.
 */
import { createGnosisUserOpEventReader } from "./chain-reader";
import { budgetFromEnv, type SponsorBudget } from "./sponsor-budget";
import type { UserOpEventReader } from "./sponsor-settle";
import { createAdminClient } from "@/lib/supabase/admin";

let budget: SponsorBudget | null = null;
let events: UserOpEventReader | null = null;

export const makeAdminClient = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;

export function sponsorBudget(): SponsorBudget {
  budget ??= budgetFromEnv(process.env, undefined, makeAdminClient);
  return budget;
}

export function userOpEvents(): UserOpEventReader {
  events ??= createGnosisUserOpEventReader();
  return events;
}
