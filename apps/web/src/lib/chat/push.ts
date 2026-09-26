// Push for proactive chat messages via the app's existing hub, the
// `send-notification` Supabase edge function (same call as lib/tickets/settle.ts).
// Tapping opens the thread: data {type:'chat_thread', threadId}.

export interface ChatPushInput {
  wallet: string;
  threadId: string;
  title: string;
  body: string;
}

export function chatPushPayload(input: ChatPushInput) {
  const body = input.body.trim() || "Neue Nachricht";
  return {
    type: "chat_thread",
    walletAddresses: [input.wallet.toLowerCase()],
    title: input.title.slice(0, 60),
    body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
    data: { type: "chat_thread", threadId: input.threadId },
  };
}

/** Best effort: never throws (a failed push must not fail the routine run). */
export async function sendChatPush(input: ChatPushInput): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(chatPushPayload(input)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[chat/push] send-notification", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("[chat/push] failed (non-fatal)", err);
    return false;
  }
}
