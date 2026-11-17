/**
 * Push channel of the recovery alerts. Server-only.
 *
 * Devices are found in `push_tokens` by `wallet_address` (the app writes it lowercase). For a
 * passkey-only account that is the Safe the SRM event names. A migrated account registers its
 * device under the old account, so the Safe address finds no device: those people keep the
 * email and the in-app banner (plan open question 3).
 *
 * Sends through the Expo push API in chunks of 100, as app/actions/push-notifications.ts does.
 * A push counts as DELIVERED when at least one device accepted it: the person is warned, and one
 * persistently failing token (a broken device, a rate limit) must not hold every later alert
 * hostage. The rest is logged (counts only). `send` throws only when no device accepted it (HTTP
 * error, network error, error tickets everywhere); the caller then releases its claim and retries
 * a few times (recovery-alerts.ts caps it per nonce). DeviceNotRegistered tokens are deactivated.
 * No log line carries a token or an address.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDeadline } from "./email-mailer";

export type AlertPushMessage = { title: string; body: string; data: Record<string, string> };

export type AlertPush = {
  tokensFor(wallet: string): Promise<string[]>;
  send(tokens: string[], message: AlertPushMessage): Promise<void>;
};

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export class AlertPushError extends Error {
  constructor(op: string) {
    super(`passkey alert push: ${op} failed`);
    this.name = "AlertPushError";
  }
}

export function recoveryAlertPush(executeAfter: bigint): AlertPushMessage {
  const date = `${formatDeadline(executeAfter)} Uhr`;
  return {
    title: "Jemand stellt dein Konto wieder her",
    body: `Warst du das nicht? Öffne die App und brich es ab. Du hast bis ${date} Zeit.`,
    data: { type: "passkey_recovery" },
  };
}

type Ticket = { status?: string; details?: { error?: string } };

export function createSupabaseAlertPush(db: SupabaseClient, fetchImpl: typeof fetch = fetch): AlertPush {
  return {
    async tokensFor(wallet) {
      // The app writes wallet_address lowercase (lib/supabase-notifications.ts registerPushToken).
      const r = await db
        .from("push_tokens")
        .select("expo_push_token")
        .eq("wallet_address", wallet.toLowerCase())
        .eq("is_active", true);
      if (r.error) throw new AlertPushError("tokensFor");
      const rows = (r.data ?? []) as { expo_push_token: string | null }[];
      return [...new Set(rows.map((x) => x.expo_push_token).filter((t): t is string => !!t))];
    },

    async send(tokens, message) {
      let accepted = 0;
      let failed = false;
      const dead: string[] = [];
      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE).map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default" as const,
          channelId: "default",
          priority: "high" as const,
        }));
        try {
          const res = await fetchImpl(EXPO_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(batch),
          });
          if (!res.ok) {
            failed = true;
            continue;
          }
          const tickets = (((await res.json()) as { data?: Ticket[] }).data ?? []) as Ticket[];
          if (tickets.length < batch.length) failed = true;
          tickets.forEach((t, j) => {
            if (t.status === "ok") accepted++;
            else if (t.details?.error === "DeviceNotRegistered" && batch[j]) dead.push(batch[j].to);
            else failed = true;
          });
        } catch {
          failed = true;
        }
      }
      if (dead.length > 0) {
        // Best effort: the next run then sees no device instead of retrying a dead token.
        await Promise.resolve(db.from("push_tokens").update({ is_active: false }).in("expo_push_token", dead)).catch(() => undefined);
      }
      if (accepted === 0) throw new AlertPushError("send");
      if (failed) console.warn(`[passkey-recovery-alerts] push partly failed: ${accepted} of ${tokens.length - dead.length} devices accepted`);
    },
  };
}
