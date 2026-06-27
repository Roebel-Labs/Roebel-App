import { sendTransaction, type PreparedTransaction } from "thirdweb";
import { smartWallet, type Wallet } from "thirdweb/wallets";
import { client } from "@/app/client";
import { gnosis } from "@/lib/gnosis";

/**
 * Higher-cap ERC-4337 bundler for the ONE transaction that needs it:
 * creating a governance proposal. `Governor.propose()` deploys a fresh MACI
 * Poll (Poll + MessageProcessor + Tally) inline — ~15.7M gas — which exceeds
 * thirdweb's hosted bundler cap of 12M gas per bundle, so the default
 * sponsored path fails with:
 *   "User operation gas limits exceed the max gas per bundle: 15745022 > 12000000"
 *
 * Recommended: point this at the same-origin server proxy so the bundler API
 * key stays server-side (see app/api/bundler/route.ts):
 *   NEXT_PUBLIC_GNOSIS_BUNDLER_URL=/api/bundler
 *   GNOSIS_BUNDLER_RPC_URL=https://api.pimlico.io/v2/100/rpc?apikey=YOUR_KEY  (server-only)
 *
 * A relative value (starting with "/") is resolved against the current origin
 * at call time. An absolute http(s) value is used directly (key would then be
 * exposed in the browser — not recommended).
 *
 * When unset, callers fall back to the default thirdweb path (which fails for
 * proposal creation on Gnosis). Only proposal creation uses this; every other
 * tx in the app keeps the default gasless/sponsored bundler.
 */
const CONFIGURED_BUNDLER = process.env.NEXT_PUBLIC_GNOSIS_BUNDLER_URL ?? "";

export function hasHighGasBundler(): boolean {
  return CONFIGURED_BUNDLER.length > 0;
}

/** Resolve the configured value to an absolute URL at call time (client-side). */
function resolveBundlerUrl(): string {
  if (CONFIGURED_BUNDLER.startsWith("/")) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${CONFIGURED_BUNDLER}`;
  }
  return CONFIGURED_BUNDLER;
}

/**
 * Send `transaction` from the user's EXISTING smart account, but through the
 * higher-cap bundler and self-paying gas (no thirdweb sponsorship).
 *
 * It reconnects the same smart account via the override bundler using the
 * active wallet's admin signer. Same factory + same admin ⇒ same smart-account
 * address, so `msg.sender` stays the attester wallet and the
 * `OnlyAttestersCanPropose` check still passes.
 *
 * Self-pay: the smart account spends its own xDAI for gas (~0.03–0.05 xDAI for a
 * poll-deploy proposal at typical Gnosis gas prices). Fund the attester wallet
 * with a little xDAI first.
 */
export async function sendViaHighGasBundler(
  activeWallet: Wallet,
  transaction: PreparedTransaction,
): Promise<{ transactionHash: `0x${string}` }> {
  if (!hasHighGasBundler()) {
    throw new Error(
      "NEXT_PUBLIC_GNOSIS_BUNDLER_URL ist nicht gesetzt — kein Bundler mit erhöhtem Gas-Limit konfiguriert.",
    );
  }

  const adminAccount = activeWallet.getAdminAccount?.();
  if (!adminAccount) {
    throw new Error(
      "Admin-Signer des Smart Accounts konnte nicht ermittelt werden.",
    );
  }

  const highGasWallet = smartWallet({
    chain: gnosis,
    sponsorGas: false, // self-pay; avoids thirdweb's sponsored 12M cap
    overrides: { bundlerUrl: resolveBundlerUrl() },
  });

  const account = await highGasWallet.connect({
    client,
    personalAccount: adminAccount,
  });

  const result = await sendTransaction({ account, transaction });
  return { transactionHash: result.transactionHash };
}
