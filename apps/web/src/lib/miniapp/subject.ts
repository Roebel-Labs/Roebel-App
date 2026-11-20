// apps/web/src/lib/miniapp/subject.ts
// Per-app pseudonym: a version-2 mini app identifies a person by `nz_…`, never by the wallet.
// HMAC keyed with a node secret, so one app's pseudonym says nothing about another's.
import { createHmac } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function deriveSubject(secret: string, miniAppId: string, wallet: string): string {
  const mac = createHmac("sha256", secret).update(`${miniAppId}:${wallet.toLowerCase()}`).digest("base64url");
  return "nz_" + mac.slice(0, 27);
}

/** `MINIAPP_SUBJECT_SECRET` (at least 32 characters), else null (the identity route answers 503). */
export function subjectSecretFromEnv(): string | null {
  const s = process.env.MINIAPP_SUBJECT_SECRET;
  return typeof s === "string" && s.length >= MIN_SECRET_LENGTH ? s : null;
}
