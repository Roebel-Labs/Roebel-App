// Which credentials an AI-built app uses, read from its own code — the manifest's
// `identity.credentials` is derived from this instead of trusting the model's draft.
import { parseCredentialRef } from "@netizen-labs/miniapp-sdk";

const CALL_RE = /credentials\s*\.\s*(?:has|request)\s*\(\s*(\[[^\]]*\]|["'][^"']+["'])/g;
const STR_RE = /["']([^"']+)["']/g;

/** Canonical credential references named in sdk.credentials.has(...) / request([...]) calls. */
export function credentialRefsInHtml(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(CALL_RE)) {
    for (const s of m[1].matchAll(STR_RE)) {
      const p = parseCredentialRef(s[1]);
      if (!p) continue;
      const ref = p.kind === "builtin" ? p.name : p.kind === "type" ? `type:${p.typeId}` : `org:${p.org}`;
      if (!out.includes(ref)) out.push(ref);
    }
  }
  return out.slice(0, 12);
}

const REASONS: Record<string, string> = {
  citizen: "Damit die App erkennt, dass du in Röbel verifiziert bist.",
  attester: "Damit die App erkennt, dass du Bürgen bist.",
  guest: "Damit die App Gäste erkennt.",
};

/** A version-2 identity section for the credentials the code uses; null when it uses none. */
export function identityForHtml(html: string): { profile: boolean; address: boolean; credentials: { type: string; reason: string }[] } | null {
  const refs = credentialRefsInHtml(html);
  if (refs.length === 0) return null;
  return {
    profile: false,
    address: false,
    credentials: refs.map((type) => ({
      type,
      reason: REASONS[type] ?? (type.startsWith("org:") ? "Damit die App erkennt, dass du zur Organisation gehörst." : "Damit die App deinen Nachweis berücksichtigen kann."),
    })),
  };
}
