/**
 * The EIP-191 texts every signature endpoint verifies (docs/PASSKEY_SIGNIN_NOTES.md section 2a plus the
 * three passkey routes), built with the real builders. Shared by the expert-Safe offline and live tests.
 */
import type { Address } from "viem";
import { buildOrgMessage } from "../../org-membership/message";
import { buildSignedMessage } from "../../signed-request/message";
import { buildPasskeySessionMessage } from "../../passkey/session-token-core";
import { buildKeyBackupProofMessage, keyBackupContentHash } from "../../passkey/key-backup-proof";
import { buildEmailProofMessage } from "../../passkey/email-proof";
import sessionVector from "../../passkey/__tests__/session-message-vector.json";

const TS = 1790000000;

export function buildExpertTexts(safe: Address): Record<string, string> {
  const wallet = safe.toLowerCase();
  return {
    "org-membership (roebel-org-v1)": buildOrgMessage("create_account", wallet, TS, { name: "Test" }),
    "merchant-registry (roebel-merchant-v1)": buildSignedMessage("roebel-merchant-v1", "register", wallet, TS, { shop: "x" }),
    "delete-user-account (delete-account)": `delete-account:${wallet}:${TS}`,
    "connect/* (roebel-tickets-v1)": buildSignedMessage("roebel-tickets-v1", "connect_status", wallet, TS, {}),
    "chat/session (roebel-chat-v1)": buildSignedMessage("roebel-chat-v1", "session", wallet, TS, {}),
    "nostr-identity-register (Nostr-Binding v1)": `Netizen Nostr-Binding v1\naccount=${wallet}\nnpub=npub1testtesttesttesttesttesttesttesttesttesttesttesttesttest`,
    "key-backup read": buildKeyBackupProofMessage({ action: "read", identity: safe, timestamp: TS }),
    "key-backup write": buildKeyBackupProofMessage({
      action: "write",
      identity: safe,
      timestamp: TS,
      contentHash: keyBackupContentHash({ maci: "pkv1:" + "A".repeat(40) }, false),
    }),
    "session start (passkey API session)": buildPasskeySessionMessage({
      identity: safe,
      deviceId: sessionVector.deviceId,
      nonce: sessionVector.nonce,
      issuedAt: sessionVector.issuedAt,
      expiresAt: sessionVector.expiresAt,
    }),
    "warning-email proof add": buildEmailProofMessage({ action: "add", safe, email: "a@example.org", timestamp: TS }),
    "warning-email proof remove": buildEmailProofMessage({ action: "remove", safe, timestamp: TS }),
  };
}
