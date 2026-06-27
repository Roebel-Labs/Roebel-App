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
 * Set this to a Gnosis ERC-4337 bundler that allows up to the chain block-gas
 * limit (~17M) — e.g. a Pimlico endpoint:
 *   NEXT_PUBLIC_GNOSIS_BUNDLER_URL=https://api.pimlico.io/v2/100/rpc?apikey=YOUR_KEY
 *
 * When unset, callers fall back to the default thirdweb path (which fails for
 * proposal creation). Only proposal creation uses this; every other tx in the
 * app keeps the default gasless/sponsored bundler.
 */
export const GNOSIS_HIGH_GAS_BUNDLER_URL =
  process.env.NEXT_PUBLIC_GNOSIS_BUNDLER_URL ?? "";

export function hasHighGasBundler(): boolean {
  return GNOSIS_HIGH_GAS_BUNDLER_URL.length > 0;
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
    overrides: { bundlerUrl: GNOSIS_HIGH_GAS_BUNDLER_URL },
  });

  const account = await highGasWallet.connect({
    client,
    personalAccount: adminAccount,
  });

  const result = await sendTransaction({ account, transaction });
  return { transactionHash: result.transactionHash };
}
