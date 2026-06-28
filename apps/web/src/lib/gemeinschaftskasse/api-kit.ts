import "server-only";
import SafeApiKit from "@safe-global/api-kit";
import { GK_CHAIN_ID } from "./constants";

// SafeApiKitConfig: { chainId: bigint; txServiceUrl?: string; apiKey?: string }
// apiKey is required when using the default safe.global service URL.
export function getApiKit() {
  const apiKey = process.env.SAFE_API_KEY;
  if (!apiKey) throw new Error("SAFE_API_KEY not set");
  return new SafeApiKit({ chainId: BigInt(GK_CHAIN_ID), apiKey });
}
