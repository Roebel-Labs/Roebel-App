/**
 * Credential register — chain reads (Gnosis). The registry address comes only from this app's
 * own constants, never from a server response. Encodings live in @netizen-labs/credential-registry.
 */
import { createCredentialRegistryReader, type CredentialRegistryReader } from '@netizen-labs/credential-registry';
import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { gnosis } from 'viem/chains';
import { credentialRegistryGnosisAddress } from '@/constants/gnosis';

const RPC = process.env.EXPO_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com';

/** The register this app talks to. Empty string until configured: check `credentialsConfigured()` first. */
export const REGISTRY = credentialRegistryGnosisAddress as Address;

let client: PublicClient | null = null;
let reader: CredentialRegistryReader | null = null;

/** One reader per app session, created on first use (no RPC client while the gate is closed). */
export function registryReader(): CredentialRegistryReader {
  if (!reader) {
    client = client ?? (createPublicClient({ chain: gnosis, transport: http(RPC) }) as PublicClient);
    reader = createCredentialRegistryReader({ client, address: REGISTRY });
  }
  return reader;
}

export type TypeMetadata = {
  name: string;
  description: string;
  image: string | null;
  properties: { kind: string; organisation: string | null; recognised: boolean; benefits: string[] };
};

export const METADATA_TIMEOUT_MS = 10_000;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * The type's metadata JSON (served by the web app). null on any failure, a malformed document or
 * after 10 s: React Native's fetch never times out on its own.
 */
export async function fetchTypeMetadata(uri: string): Promise<TypeMetadata | null> {
  if (typeof uri !== 'string' || !/^https?:\/\//.test(uri)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(uri, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown> | null;
    if (!json || typeof json !== 'object') return null;
    const name = str(json.name);
    if (!name) return null;
    const props = (json.properties && typeof json.properties === 'object' ? json.properties : {}) as Record<string, unknown>;
    return {
      name,
      description: str(json.description) ?? '',
      image: str(json.image),
      properties: {
        kind: str(props.kind) ?? '',
        organisation: str(props.organisation),
        recognised: props.recognised === true,
        benefits: Array.isArray(props.benefits) ? props.benefits.filter((b): b is string => typeof b === 'string') : [],
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
