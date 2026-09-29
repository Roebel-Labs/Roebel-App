/**
 * Re-derive the MACI voting key a citizen registered in JULY 2026.
 *
 * The voting key is keccak256(smartAccount.signMessage(KEY_DERIVATION_MESSAGE)).
 * Until 2026-07-28 (commit 0987bca4) the app's primary smart account ran on
 * BASE (8453); since then it runs on Gnosis (100). thirdweb's smart-account
 * signMessage signs an EIP-712 "AccountMessage" whose domain carries the chain
 * id, so the same login now derives a different key. Everyone who signed up
 * in July (all 19 SignUps are from 07-18..07-20) and lost the local key since
 * cannot vote with the re-derived Gnosis key.
 *
 * This file reproduces thirdweb 5.119.3's
 * `src/wallets/smart/lib/signing.ts#smartAccountSignMessage` byte-for-byte for
 * chain 8453 (the version pinned in pnpm-lock both in July and today):
 *
 *   hash    = hashMessage(message)                       // EIP-191
 *   wrapped = abi.encode(bytes32 hash)
 *   sig     = admin.signTypedData({
 *               domain: { chainId: 8453, name: "Account",
 *                         verifyingContract: smartAccount, version: "1" },
 *               primaryType: "AccountMessage",
 *               types: { AccountMessage: [{ name: "message", type: "bytes" }] },
 *               message: { message: wrapped } })
 *   deployed on Base  → return sig                          (ERC-1271)
 *   not deployed      → return ERC-6492(factory, createAccount(admin, "0x"), sig)
 *
 * Whether the Base account was deployed in July is unknown per user, so BOTH
 * variants are returned as candidates; the caller checks which pubkey has a
 * SignUp on chain. Only ONE signature is requested from the wallet.
 *
 * The Base admin account comes from a SEPARATE in-app wallet instance that is
 * only `autoConnect`ed (reuses the stored login session). It is never passed to
 * setActiveWallet, so the active wallet / login stay untouched.
 */
import { encode, getContract, prepareContractCall, type ThirdwebClient } from "thirdweb";
import { base } from "thirdweb/chains";
import { encodeAbiParameters, hashMessage, keccak256 } from "thirdweb/utils";
import { serializeErc6492Signature } from "thirdweb/auth";
import type { Account, Wallet } from "thirdweb/wallets";
import { DEFAULT_ACCOUNT_FACTORY_V0_6 } from "thirdweb/wallets/smart";

export const LEGACY_SIGNING_CHAIN_ID = 8453;

/** The admin (personal) account of a thirdweb smart account. */
export type AdminSigner = Pick<Account, "address" | "signTypedData">;

/** Both July signature variants (raw ERC-1271 + ERC-6492-wrapped). */
export async function buildLegacySignatureCandidates(args: {
  client: ThirdwebClient;
  admin: AdminSigner;
  smartAccountAddress: string;
  message: string;
}): Promise<`0x${string}`[]> {
  const originalMsgHash = hashMessage(args.message);
  const wrappedMessageHash = encodeAbiParameters([{ type: "bytes32" }], [originalMsgHash]);

  const sig = (await args.admin.signTypedData({
    domain: {
      chainId: LEGACY_SIGNING_CHAIN_ID,
      name: "Account",
      verifyingContract: args.smartAccountAddress as `0x${string}`,
      version: "1",
    },
    message: { message: wrappedMessageHash },
    primaryType: "AccountMessage",
    types: { AccountMessage: [{ name: "message", type: "bytes" }] },
  })) as `0x${string}`;

  // Same init code thirdweb's prepareCreateAccount builds for the default
  // (v0.6) factory with no accountSalt: createAccount(admin, stringToHex("")).
  const factoryContract = getContract({
    client: args.client,
    chain: base,
    address: DEFAULT_ACCOUNT_FACTORY_V0_6,
  });
  const initCode = await encode(
    prepareContractCall({
      contract: factoryContract,
      method: "function createAccount(address, bytes) returns (address)",
      params: [args.admin.address, "0x"],
    }),
  );
  const erc6492 = serializeErc6492Signature({
    address: factoryContract.address,
    data: initCode,
    signature: sig,
  });

  return [sig, erc6492];
}

/** Seed derivation identical to MaciContext.generateAndStoreKeypair. */
export function seedFromSignature(signature: `0x${string}`): bigint {
  return BigInt(keccak256(signature));
}

/**
 * Connect the Base in-app smart account WITHOUT making it active and return
 * its admin signer + smart-account address.
 */
export async function connectLegacyBaseSigner(args: {
  client: ThirdwebClient;
  createWallet: () => Wallet;
}): Promise<{ admin: AdminSigner; smartAccountAddress: string }> {
  const wallet = args.createWallet();
  // autoConnect only — never connect()/setActiveWallet(): no new login, no
  // change to the active wallet.
  const account = await wallet.autoConnect({ client: args.client });
  const admin = (wallet as Wallet & { getAdminAccount?: () => Account | undefined }).getAdminAccount?.();
  if (!account?.address || !admin) {
    throw new Error("legacy Base signer unavailable");
  }
  return { admin, smartAccountAddress: account.address };
}
