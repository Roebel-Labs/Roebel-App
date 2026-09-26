import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { gnosis } from "viem/chains";
import { PASSKEY_SAFE } from "./safe-address";
import type { ChainReader, SignerPermissionRequest } from "./sponsor-policy";

const DEFAULT_GNOSIS_RPC = "https://gnosis-rpc.publicnode.com";
const RPC_TIMEOUT_MS = 8_000;

const legacyAbi = parseAbi([
  "struct SignerPermissionRequest { address signer; uint8 isAdmin; address[] approvedTargets; uint256 nativeTokenLimitPerTransaction; uint128 permissionStartTimestamp; uint128 permissionEndTimestamp; uint128 reqValidityStartTimestamp; uint128 reqValidityEndTimestamp; bytes32 uid; }",
  "function isAdmin(address account) view returns (bool)",
  "function verifySignerPermissionRequest(SignerPermissionRequest req, bytes signature) view returns (bool success, address signer)",
]);
const safeAbi = parseAbi([
  "function isModuleEnabled(address module) view returns (bool)",
  "function getOwners() view returns (address[])",
]);
const sharedSignerAbi = parseAbi([
  "struct Signer { uint256 x; uint256 y; uint176 verifiers; }",
  "function getConfiguration(address account) view returns (Signer signer)",
]);
const signerFactoryAbi = parseAbi([
  "function getSigner(uint256 x, uint256 y, uint176 verifiers) view returns (address signer)",
]);
const erc721Abi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

/** The node answered and the call reverted (as opposed to a transport failure). */
function isRevert(err: unknown): boolean {
  return err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError) !== null;
}

/** Gnosis (chain 100) reader for the sponsor policy. Errors propagate (never
 * defaulted), so the policy fails closed. RPC from `GNOSIS_RPC_URL`. */
export function createGnosisChainReader(rpcUrl = process.env.GNOSIS_RPC_URL || DEFAULT_GNOSIS_RPC): ChainReader {
  const client = createPublicClient({
    chain: gnosis,
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }),
  });
  return {
    getCode: (address) => client.getCode({ address }),
    getStorageAt: (address, slot) => client.getStorageAt({ address, slot }),
    isAdmin: (account, signer) =>
      client.readContract({ address: account, abi: legacyAbi, functionName: "isAdmin", args: [signer] }),
    isModuleEnabled: (safe, module) =>
      client.readContract({ address: safe, abi: safeAbi, functionName: "isModuleEnabled", args: [module] }),
    getOwners: (safe) => client.readContract({ address: safe, abi: safeAbi, functionName: "getOwners" }),
    getSharedSignerConfiguration: (safe) =>
      client.readContract({
        address: PASSKEY_SAFE.sharedSigner,
        abi: sharedSignerAbi,
        functionName: "getConfiguration",
        args: [safe],
      }),
    getWebAuthnSigner: (x, y, verifiers) =>
      client.readContract({
        address: PASSKEY_SAFE.signerFactory,
        abi: signerFactoryAbi,
        functionName: "getSigner",
        args: [x, y, verifiers],
      }),
    balanceOf: (token, owner) =>
      client.readContract({ address: token, abi: erc721Abi, functionName: "balanceOf", args: [owner] }),
    async verifySignerPermissionRequest(account: Hex, req: SignerPermissionRequest, signature: Hex) {
      try {
        const [success, signer] = await client.readContract({
          address: account,
          abi: legacyAbi,
          functionName: "verifySignerPermissionRequest",
          args: [req, signature],
        });
        return { success, signer };
      } catch (err) {
        if (isRevert(err)) return null; // e.g. ECDSA.recover on a malformed signature
        throw err;
      }
    },
  };
}
