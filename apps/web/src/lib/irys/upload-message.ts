// Signed-request grammar for POST /api/irys/upload. Isomorphic (browser client + server), so the
// digest uses @noble/hashes, never node:crypto (see org-membership/message.ts for why).
//
// Message: `roebel-irys-v1:upload:<wallet lower>:<timestampSec>:<hashPayload({contentSha256, tagsSha256})>`
// Binding the content and tag hashes means a captured signature cannot upload anything else.
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { buildSignedMessage } from "../signed-request/message";

export const IRYS_SCOPE = "roebel-irys-v1" as const;
export const IRYS_UPLOAD_ACTION = "upload" as const;

export type IrysTag = { name: string; value: string };

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

export function irysUploadPayload(content: string, tags: IrysTag[] | undefined): Record<string, unknown> {
  return { contentSha256: sha256Hex(content), tagsSha256: sha256Hex(JSON.stringify(tags ?? [])) };
}

export function buildIrysUploadMessage(wallet: string, timestampSec: number, content: string, tags: IrysTag[] | undefined): string {
  return buildSignedMessage(IRYS_SCOPE, IRYS_UPLOAD_ACTION, wallet, timestampSec, irysUploadPayload(content, tags));
}
