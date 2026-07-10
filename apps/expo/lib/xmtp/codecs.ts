/**
 * App-level XMTP content codecs.
 *
 * Pure JS (JSContentCodec) — no native calls, so this file is safe to import
 * statically. Only `import type` from the SDK here; value imports of
 * @xmtp/react-native-sdk must go through lib/xmtp/native.ts.
 */

import type { JSContentCodec } from '@xmtp/react-native-sdk';
import type { content as protoContent } from '@xmtp/proto';

type EncodedContent = protoContent.EncodedContent;
type ContentTypeId = protoContent.ContentTypeId;

// ── Content-type ids (string form: authority/type:major.minor) ─────

export const CONTENT_TYPE_TEXT = 'xmtp.org/text:1.0';
export const CONTENT_TYPE_REACTION = 'xmtp.org/reaction:1.0';
export const CONTENT_TYPE_READ_RECEIPT = 'xmtp.org/readReceipt:1.0';
export const CONTENT_TYPE_REPLY = 'xmtp.org/reply:1.0';
export const CONTENT_TYPE_TRANSACTION_REFERENCE = 'xmtp.org/transactionReference:1.0';
export const CONTENT_TYPE_ROEBEL_STICKER = 'roebel.de/sticker:1.0';
export const CONTENT_TYPE_ATTACHMENT = 'xmtp.org/attachment:1.0';
export const CONTENT_TYPE_REMOTE_ATTACHMENT = 'xmtp.org/remoteStaticAttachment:1.0';

// ── Transaction reference (in-chat payment receipts) ───────────────
// Wire-compatible with @xmtp/content-type-transaction-reference so receipts
// interop with Base App & friends: JSON payload, UTF-8 encoded.

export interface TransactionReferenceMetadata {
  transactionType: string;
  currency: string;
  amount: number;
  decimals: number;
  fromAddress?: string;
  toAddress?: string;
}

export interface TransactionReferenceContent {
  /** Namespace of the network, e.g. 'eip155'. */
  namespace?: string;
  /** CAIP-2 network id, e.g. 'eip155:100' for Gnosis. */
  networkId: string | number;
  /** The transaction hash. */
  reference: string;
  metadata?: TransactionReferenceMetadata;
}

export const TRANSACTION_REFERENCE_TYPE: ContentTypeId = {
  authorityId: 'xmtp.org',
  typeId: 'transactionReference',
  versionMajor: 1,
  versionMinor: 0,
};

export class TransactionReferenceCodec implements JSContentCodec<TransactionReferenceContent> {
  contentType = TRANSACTION_REFERENCE_TYPE;

  encode(content: TransactionReferenceContent): EncodedContent {
    return {
      type: TRANSACTION_REFERENCE_TYPE,
      parameters: {},
      content: new TextEncoder().encode(JSON.stringify(content)),
    } as EncodedContent;
  }

  decode(encoded: EncodedContent): TransactionReferenceContent {
    return JSON.parse(new TextDecoder().decode(encoded.content));
  }

  // Fallback is what non-supporting XMTP apps render — keep it useful there.
  fallback(content: TransactionReferenceContent): string | undefined {
    if (content?.reference) {
      return `[Crypto transaction] Use a blockchain explorer to learn more using the transaction hash: ${content.reference}`;
    }
    return 'Crypto transaction';
  }

  shouldPush(): boolean {
    return true;
  }
}

// ── Röbel sticker (lootbox reward stickers in chat) ────────────────

export interface RoebelStickerContent {
  stickerRewardId: string;
}

export const ROEBEL_STICKER_TYPE: ContentTypeId = {
  authorityId: 'roebel.de',
  typeId: 'sticker',
  versionMajor: 1,
  versionMinor: 0,
};

export class RoebelStickerCodec implements JSContentCodec<RoebelStickerContent> {
  contentType = ROEBEL_STICKER_TYPE;

  encode(content: RoebelStickerContent): EncodedContent {
    return {
      type: ROEBEL_STICKER_TYPE,
      parameters: {},
      content: new TextEncoder().encode(JSON.stringify(content)),
    } as EncodedContent;
  }

  decode(encoded: EncodedContent): RoebelStickerContent {
    return JSON.parse(new TextDecoder().decode(encoded.content));
  }

  fallback(): string | undefined {
    return '🎁 Sticker';
  }

  shouldPush(): boolean {
    return true;
  }
}
