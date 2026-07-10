/**
 * Sender-triggered DM push for the XMTP rail.
 *
 * XMTP messages never hit the `direct_messages` table, so the DB trigger that
 * pushes Supabase-rail DMs can't fire. Instead the SENDER's client invokes
 * the same `send-notification` edge function with the exact payload shape the
 * trigger uses — deep links, foreground suppression and the per-device
 * `dms_enabled` preference all behave identically. (A self-hosted XMTP
 * notification server can replace this in phase 2 for offline-sender pushes.)
 */

import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/supabase-messages';

/** Mirrors the trigger's body building (excerpt, sticker/payment fallbacks). */
export function pushBodyForMessage(msg: {
  content?: string;
  sticker_reward_id?: string | null;
  payment?: Message['payment'];
}): string {
  if (msg.payment) return 'hat dir Röbel Münzen gesendet';
  if (msg.sticker_reward_id) return 'hat dir eine Nachricht gesendet';
  const text = (msg.content ?? '').trim();
  if (!text || text.startsWith('{')) return 'Neue Nachricht';
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export async function notifyDmPush(opts: {
  senderName: string;
  body: string;
  recipientWallets: string[];
  conversationId: string;
}): Promise<void> {
  if (opts.recipientWallets.length === 0) return;
  try {
    await supabase.functions.invoke('send-notification', {
      body: {
        type: 'direct_message',
        title: opts.senderName || 'Neue Nachricht',
        body: opts.body,
        walletAddresses: opts.recipientWallets.map((w) => w.toLowerCase()),
        data: { type: 'direct_message', conversationId: opts.conversationId },
      },
    });
  } catch (err) {
    // Push is best-effort; the message itself is already delivered via XMTP.
    console.warn('[xmtp] dm push failed', err);
  }
}
