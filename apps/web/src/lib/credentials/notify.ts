// Push for the credential register through the app's existing hub, the `send-notification`
// Supabase edge function (same call as lib/chat/push.ts). Best effort: never throws.
// Relative imports only: loaded by `npx tsx --test`.

export type CredentialPushType = "credential_action" | "credential_invite" | "credential_visibility" | "credential_letters";

export interface Notifier {
  push(p: { wallets: string[]; type: CredentialPushType; title: string; body: string; data: Record<string, string> }): Promise<void>;
}

export function credentialPushPayload(p: Parameters<Notifier["push"]>[0]) {
  const body = p.body.trim();
  return {
    type: p.type,
    walletAddresses: [...new Set(p.wallets.map((w) => w.toLowerCase()))],
    title: p.title.slice(0, 60),
    body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
    data: p.data,
  };
}

export function sendNotificationNotifier(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Notifier {
  return {
    async push(p) {
      const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey || p.wallets.length === 0) return;
      try {
        const res = await fetchImpl(`${supabaseUrl}/functions/v1/send-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify(credentialPushPayload(p)),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) console.error("[credentials/notify] send-notification", res.status);
      } catch (err) {
        console.error("[credentials/notify] failed (non-fatal)", err instanceof Error ? err.message : err);
      }
    },
  };
}
