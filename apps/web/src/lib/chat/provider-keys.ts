// Own model API keys (BYOK). A user who brings an Anthropic key pays Anthropic directly: the
// platform routes their model calls through that key, records the run as billed_to='own_key'
// with cost 0 and skips the token quota. Keys are AES-GCM encrypted at rest (CHAT_CONNECTOR_KEY).
import { db } from "./store";
import { decryptSecret, encryptSecret } from "./harness/connectors/crypto";

export type KeyProvider = "anthropic" | "openai";
export const KEY_PROVIDERS: readonly KeyProvider[] = ["anthropic", "openai"];

export interface PublicProviderKey {
  provider: KeyProvider;
  last4: string;
  status: "active" | "error";
  lastError: string | null;
  createdAt: string;
}

const aad = (wallet: string, provider: KeyProvider) => `provider-key:${wallet}:${provider}`;

export function isKeyProvider(v: unknown): v is KeyProvider {
  return typeof v === "string" && (KEY_PROVIDERS as readonly string[]).includes(v);
}

/** Shape check only; the live check below is what proves the key works. */
export function looksLikeKey(provider: KeyProvider, key: string): boolean {
  if (!/^[A-Za-z0-9_\-]{20,300}$/.test(key)) return false;
  return provider === "anthropic" ? key.startsWith("sk-ant-") : key.startsWith("sk-");
}

/** One cheap authenticated request against the provider. Throws a German message on failure. */
export async function verifyProviderKey(provider: KeyProvider, key: string): Promise<void> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(
      provider === "anthropic" ? "https://api.anthropic.com/v1/models?limit=1" : "https://api.openai.com/v1/models",
      {
        signal: ctl.signal,
        headers:
          provider === "anthropic"
            ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
            : { Authorization: `Bearer ${key}` },
      },
    );
    if (res.status === 401 || res.status === 403) throw new Error("Der Schlüssel wurde vom Anbieter abgelehnt.");
    if (!res.ok) throw new Error(`Der Anbieter antwortet gerade nicht (${res.status}). Bitte später erneut.`);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Der Anbieter antwortet nicht. Bitte später erneut.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function listProviderKeys(wallet: string): Promise<PublicProviderKey[]> {
  const res = await db().from("chat_provider_keys").select("provider, last4, status, last_error, created_at").eq("wallet", wallet);
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map((r) => ({
    provider: r.provider as KeyProvider,
    last4: r.last4,
    status: r.status as "active" | "error",
    lastError: r.last_error,
    createdAt: r.created_at,
  }));
}

/** Decrypted key or null. Never log the result. */
export async function getProviderKey(wallet: string, provider: KeyProvider): Promise<string | null> {
  const res = await db().from("chat_provider_keys").select("key_enc").eq("wallet", wallet).eq("provider", provider).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  if (!res.data) return null;
  try {
    return decryptSecret<string>(res.data.key_enc, { aad: aad(wallet, provider) });
  } catch {
    return null;
  }
}

export async function saveProviderKey(wallet: string, provider: KeyProvider, key: string): Promise<PublicProviderKey> {
  const row = {
    wallet,
    provider,
    key_enc: encryptSecret(key, { aad: aad(wallet, provider) }),
    last4: key.slice(-4),
    status: "active",
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const res = await db().from("chat_provider_keys").upsert(row, { onConflict: "wallet,provider" }).select("provider, last4, status, last_error, created_at").single();
  if (res.error) throw new Error(res.error.message);
  return { provider, last4: res.data.last4, status: "active", lastError: null, createdAt: res.data.created_at };
}

export async function deleteProviderKey(wallet: string, provider: KeyProvider): Promise<void> {
  const res = await db().from("chat_provider_keys").delete().eq("wallet", wallet).eq("provider", provider);
  if (res.error) throw new Error(res.error.message);
}
