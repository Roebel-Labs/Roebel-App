import { createPublicClient, http, type PublicClient } from "viem";
import { gnosis } from "viem/chains";

export const DEFAULT_RPC_URL = "https://rpc.gnosischain.com";

export interface ClientOpts {
  rpcUrl?: string;
  client?: PublicClient;
}

const clients = new Map<string, PublicClient>();

/** The given client, or a cached viem public client on Gnosis for `rpcUrl`. */
export function clientFor(opts?: ClientOpts): PublicClient {
  if (opts?.client) return opts.client;
  const url = opts?.rpcUrl ?? DEFAULT_RPC_URL;
  let c = clients.get(url);
  if (!c) {
    c = createPublicClient({ chain: gnosis, transport: http(url) }) as PublicClient;
    clients.set(url, c);
  }
  return c;
}
