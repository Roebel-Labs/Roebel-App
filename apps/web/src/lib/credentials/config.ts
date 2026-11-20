// Credential register configuration (server). Relative imports only: loaded by `npx tsx --test`.
import { isAddress, type Address } from "viem";

/** A prepared action waits this long for the phone, then expires (owner default: 7 days). */
export const ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_PUBLIC_BASE_URL = "https://www.roebel.app";

/** The register this node mirrors, or null when the node is not configured for credentials. */
export function registryConfig(
  env: Record<string, string | undefined> = process.env,
): { address: Address; deployBlock: bigint; chainId: 100 } | null {
  const address = env.CREDENTIAL_REGISTRY_ADDRESS?.trim();
  const block = env.CREDENTIAL_REGISTRY_DEPLOY_BLOCK?.trim();
  if (!address || !isAddress(address, { strict: false }) || !block || !/^\d+$/.test(block)) return null;
  return { address: address.toLowerCase() as Address, deployBlock: BigInt(block), chainId: 100 };
}

/** Public origin used in metadata URIs and invitation links (no trailing slash). */
export function publicBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  return (raw || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}
