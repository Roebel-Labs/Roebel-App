/**
 * Local push for inbound XMTP DMs that the sender-triggered remote push
 * (`lib/xmtp/push.ts`) can't cover.
 *
 * XMTP is an open protocol, so a totally external wallet — Coinbase Wallet,
 * Converse, any XMTP client — can message this inbox. Those senders don't run
 * the Röbel app, so no `send-notification` call ever fires for them. The one
 * signal we DO get is our own `streamAllMessages` subscription: when the app is
 * alive (foreground or a live-background window) we surface a local
 * notification for such messages ourselves.
 *
 * Dedup: Röbel-user senders already produce a remote push from their app AND
 * appear on our stream — we skip those here so they never double-notify. Only
 * external wallets (or the rare unresolvable sender) get a local notification.
 *
 * Limitation: a killed app can't stream, so true offline delivery for external
 * senders still needs the phase-2 self-hosted XMTP notification server + iOS
 * NSE (see docs/XMTP_INTEGRATION_STATE.md).
 */

import * as Notifications from 'expo-notifications';
import type { DecodedMessage } from '@xmtp/react-native-sdk';

import type { XmtpClientHandle } from './client';
import { resolveSenderWallet } from './transport';
import {
  CONTENT_TYPE_READ_RECEIPT,
  CONTENT_TYPE_TEXT,
  CONTENT_TYPE_TRANSACTION_REFERENCE,
} from './codecs';
import { fetchPersonalAccountIdByWallet } from '@/lib/supabase-messages';

// Messages already surfaced this session — the stream can re-deliver on re-arm.
const notified = new Set<string>();

function truncate(text: string): string {
  const t = text.trim();
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

/** Notification body — never raw JSON, never a wallet address. */
function bodyForMessage(message: DecodedMessage<any>): string {
  const typeId = message.contentTypeId;
  try {
    if (typeId === CONTENT_TYPE_TEXT) {
      const text = (message.content() as string) ?? '';
      if (text.trim() && !text.trim().startsWith('{')) return truncate(text);
    }
    if (typeId === CONTENT_TYPE_TRANSACTION_REFERENCE) {
      return 'hat dir Röbel Münzen gesendet';
    }
  } catch {
    // fall through to the fallback text
  }
  const fallback = (message.fallback ?? '').trim();
  if (fallback && !fallback.startsWith('{')) return truncate(fallback);
  return 'Du hast eine neue Nachricht erhalten';
}

/**
 * Fire a local notification for one streamed message when it's an inbound DM
 * from an external (non-Röbel) wallet. Best-effort and self-guarding — safe to
 * call for every streamed message.
 */
export async function maybeNotifyInboundXmtp(
  handle: XmtpClientHandle,
  message: DecodedMessage<any>
): Promise<void> {
  // Own outbound message echoed back on the stream.
  if (message.senderInboxId === handle.inboxId) return;

  const typeId = message.contentTypeId;
  // Read receipts and reactions aren't user-visible messages.
  if (typeId === CONTENT_TYPE_READ_RECEIPT || typeId.startsWith('xmtp.org/reaction')) return;

  const id = String(message.id);
  if (notified.has(id)) return;

  // Röbel-user senders are already covered by their app's remote push — skip to
  // avoid double-notifying. Unresolvable senders are treated as external so we
  // never silently drop a real inbound message.
  const wallet = await resolveSenderWallet(handle, message.senderInboxId).catch(() => null);
  if (wallet) {
    try {
      const roebelAccountId = await fetchPersonalAccountIdByWallet(wallet);
      if (roebelAccountId) return;
    } catch {
      // couldn't check the registry — fall through and notify
    }
  }

  if (notified.has(id)) return; // re-check after the awaits
  notified.add(id);
  if (notified.size > 500) notified.clear();

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Neue Nachricht',
        body: bodyForMessage(message),
        // Distinct type: the foreground handler only suppresses 'direct_message'
        // by conversationId, and these external chats have no registry row to
        // deep-link into, so a plain informational banner is correct.
        data: { type: 'xmtp_external_dm' },
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[xmtp] inbound local notification failed', err);
  }
}
