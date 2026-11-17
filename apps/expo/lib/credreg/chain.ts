/**
 * Credential register — chain reads (Gnosis). The registry address comes only from this app's
 * own constants, never from a server response. Encodings live in @netizen-labs/credential-registry.
 */
import { CREDENTIAL_REGISTRY_ABI, createCredentialRegistryReader, type CredentialRegistryReader } from '@netizen-labs/credential-registry';
import { createPublicClient, hashMessage, hashTypedData, http, recoverTypedDataAddress, type Address, type Hex, type PublicClient } from 'viem';
import { gnosis } from 'viem/chains';
import { credentialRegistryGnosisAddress } from '@/constants/gnosis';
import { makeAccountSignatureVerifier, type AccountSignatureClient, type VerifyAccountSignature } from './account-signature-core';

const RPC = process.env.EXPO_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com';

/** The register this app talks to. Empty string until configured: check `credentialsConfigured()` first. */
export const REGISTRY = credentialRegistryGnosisAddress as Address;

let client: PublicClient | null = null;
let reader: CredentialRegistryReader | null = null;

function publicClient(): PublicClient {
  client = client ?? (createPublicClient({ chain: gnosis, transport: http(RPC) }) as PublicClient);
  return client;
}

/** One reader per app session, created on first use (no RPC client while the gate is closed). */
export function registryReader(): CredentialRegistryReader {
  if (!reader) {
    reader = createCredentialRegistryReader({ client: publicClient(), address: REGISTRY });
  }
  return reader;
}

/**
 * The account's on-chain holding of a type (`holdingOf`): which batch and leaf it came from, and
 * its validUntil (0 = no expiry). batchId 0 and a zero leaf = nothing held (or self-claimed).
 * Throws on RPC failure.
 */
export async function readHolding(typeId: Hex, account: Address): Promise<{ batchId: bigint; leaf: Hex; validUntil: bigint }> {
  const h = (await publicClient().readContract({
    address: REGISTRY,
    abi: CREDENTIAL_REGISTRY_ABI,
    functionName: 'holdingOf',
    args: [typeId, account],
  })) as { batchId: bigint; leaf: Hex; validUntil: bigint };
  return { batchId: BigInt(h.batchId), leaf: h.leaf, validUntil: BigInt(h.validUntil ?? 0) };
}

let signatureVerifier: VerifyAccountSignature | null = null;

/**
 * "Did this account sign this message?" on Gnosis, with the server's one rule
 * (./account-signature-core: EOA, ERC-1271, ERC-6492, passkey-Safe envelope, thirdweb domain).
 * Throws on RPC failure.
 */
export function verifyAccountMessage(address: string, message: string, signature: string): Promise<boolean> {
  signatureVerifier =
    signatureVerifier ??
    makeAccountSignatureVerifier({
      client: publicClient() as unknown as AccountSignatureClient,
      utils: { hashMessage, hashTypedData: hashTypedData as never, recoverTypedDataAddress: recoverTypedDataAddress as never },
    });
  return signatureVerifier({ address, message, signature });
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
