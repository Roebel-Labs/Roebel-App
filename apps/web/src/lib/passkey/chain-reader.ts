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
import { ADDRESSES, type ChainReader, type SignerPermissionRequest } from "./sponsor-policy";
import { EVERYDAY_CONTRACTS } from "./everyday-allowlist";
import { MODULE_TYPE_VALIDATOR, SMART_SESSIONS } from "./session-keys-builders";

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
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
]);
/** Safe module linked-list sentinel: getModulesPaginated starts here. */
const MODULES_SENTINEL: Hex = "0x0000000000000000000000000000000000000001";
const sharedSignerAbi = parseAbi([
  "struct Signer { uint256 x; uint256 y; uint176 verifiers; }",
  "function getConfiguration(address account) view returns (Signer signer)",
]);
const signerFactoryAbi = parseAbi([
  "function getSigner(uint256 x, uint256 y, uint176 verifiers) view returns (address signer)",
]);
const smartSessionReadAbi = parseAbi(["function getPermissionIDs(address account) view returns (bytes32[])"]);
const safe7579ReadAbi = parseAbi([
  "function isModuleInstalled(uint256 moduleTypeId, address module, bytes additionalContext) view returns (bool)",
]);
const citizenNftAbi = parseAbi(["function hasCitizenNFT(address account) view returns (bool)"]);
const maciAbi = parseAbi(["function polls(uint256 pollId) view returns (address)"]);
const accountFactoryAbi = parseAbi(["function getAddress(address adminSigner, bytes data) view returns (address)"]);
const srmAbi = parseAbi([
  "struct RecoveryRequest { uint256 guardiansApprovalCount; uint256 newThreshold; uint64 executeAfter; address[] newOwners; }",
  "function guardiansCount(address wallet) view returns (uint256)",
  "function threshold(address wallet) view returns (uint256)",
  "function isGuardian(address wallet, address guardian) view returns (bool)",
  "function getRecoveryRequest(address wallet) view returns (RecoveryRequest request)",
]);

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
    async getModulesPaginated(safe) {
      const [modules, next] = await client.readContract({
        address: safe,
        abi: safeAbi,
        functionName: "getModulesPaginated",
        args: [MODULES_SENTINEL, 10n],
      });
      return { modules, next };
    },
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
    hasCitizenNFT: (nft, account) =>
      client.readContract({ address: nft, abi: citizenNftAbi, functionName: "hasCitizenNFT", args: [account] }),
    getLegacyAccountAddress: (admin) =>
      client.readContract({
        address: ADDRESSES.legacyAccountFactory,
        abi: accountFactoryAbi,
        functionName: "getAddress",
        args: [admin, "0x"],
      }),
    guardiansCount: (wallet) =>
      client.readContract({ address: ADDRESSES.socialRecoveryModule, abi: srmAbi, functionName: "guardiansCount", args: [wallet] }),
    srmThreshold: (wallet) =>
      client.readContract({ address: ADDRESSES.socialRecoveryModule, abi: srmAbi, functionName: "threshold", args: [wallet] }),
    isGuardian: (wallet, guardian) =>
      client.readContract({
        address: ADDRESSES.socialRecoveryModule,
        abi: srmAbi,
        functionName: "isGuardian",
        args: [wallet, guardian],
      }),
    maciPoll: (pollId) =>
      client.readContract({ address: EVERYDAY_CONTRACTS.maci, abi: maciAbi, functionName: "polls", args: [pollId] }),
    getPermissionIDs: (safe) =>
      client.readContract({ address: SMART_SESSIONS, abi: smartSessionReadAbi, functionName: "getPermissionIDs", args: [safe] }),
    // Answered by the Safe's fallback handler (Safe7579); only called for a Safe already proven to be in the 7579 layout.
    isSmartSessionInstalled: (safe) =>
      client.readContract({
        address: safe,
        abi: safe7579ReadAbi,
        functionName: "isModuleInstalled",
        args: [MODULE_TYPE_VALIDATOR, SMART_SESSIONS, "0x"],
      }),
    async getRecoveryRequest(wallet) {
      const r = await client.readContract({
        address: ADDRESSES.socialRecoveryModule,
        abi: srmAbi,
        functionName: "getRecoveryRequest",
        args: [wallet],
      });
      return { executeAfter: BigInt(r.executeAfter), newThreshold: r.newThreshold, newOwners: r.newOwners };
    },
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
