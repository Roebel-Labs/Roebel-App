/**
 * Server-side derivation of the counterfactual passkey Safe, ported from
 * apps/expo/lib/passkey/safe-address.ts and pinned by the same golden vector
 * (contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json).
 *
 * Safe L2 1.4.1 proxy; owner SafeWebAuthnSharedSigner configured with the
 * passkey's P-256 key; modules Safe4337Module + Candide SocialRecoveryModule;
 * fallback handler Safe4337Module. The sponsor policy uses this to prove that
 * a userOp sender is a genuine passkey Safe for the (x, y) the client names.
 */
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getContractAddress,
  keccak256,
  numberToHex,
  parseAbi,
  size,
  zeroAddress,
  type Hex,
} from "viem";

/** All verified to have code on Gnosis (chain 100), 2026-09-26. */
export const PASSKEY_SAFE = {
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  multiSend: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
  safe4337Module: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
  safeModuleSetup: "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47",
  sharedSigner: "0x94a4F6affBd8975951142c3999aEAB7ecee555c2",
  signerFactory: "0x1d31F259eE307358a26dFb23EB365939E8641195",
  fclP256Verifier: "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA",
  socialRecoveryModule: "0x38275826E1933303E508433dD5f289315Da2541c",
} as const satisfies Record<string, Hex>;

/** uint176 verifiers = (0x0100 << 160) | FCLP256Verifier: RIP-7212 precompile first, FCL fallback. */
export const WEBAUTHN_VERIFIERS: bigint = (0x0100n << 160n) | BigInt(PASSKEY_SAFE.fclP256Verifier);

export const SAFE_SALT_NONCE = 0n;

/** Safe FallbackManager storage slot: keccak256("fallback_manager.handler.address"). */
export const FALLBACK_HANDLER_SLOT: Hex = "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";

/** SafeProxyFactory 1.4.1 `proxyCreationCode()`, read from chain 100 (2026-09-26). */
export const SAFE_PROXY_CREATION_CODE: Hex =
  "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";

/** Deployed SafeProxy 1.4.1 runtime (171 bytes). Identical to `cast code` of a live Safe 1.4.1
 * proxy on Gnosis (2026-09-26) and to the runtime embedded in the creation code above. */
export const SAFE_PROXY_RUNTIME_CODE: Hex =
  "0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033";

export type PasskeyPublicKey = { x: Hex; y: Hex };

const safeSetupAbi = parseAbi([
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);
const enableModulesAbi = parseAbi(["function enableModules(address[] modules)"]);
const sharedSignerConfigureAbi = parseAbi([
  "struct Signer { uint256 x; uint256 y; uint176 verifiers; }",
  "function configure(Signer signer)",
]);
const createProxyWithNonceAbi = parseAbi([
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
]);

function encodeMultiSendTx(operation: 0 | 1, to: Hex, value: bigint, data: Hex): Hex {
  return encodePacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [operation, to, value, BigInt(size(data)), data],
  );
}

export function buildSafeSetup(p: PasskeyPublicKey): { initializer: Hex; saltNonce: bigint } {
  const enableModules = encodeFunctionData({
    abi: enableModulesAbi,
    functionName: "enableModules",
    args: [[PASSKEY_SAFE.safe4337Module, PASSKEY_SAFE.socialRecoveryModule]],
  });
  const configure = encodeFunctionData({
    abi: sharedSignerConfigureAbi,
    functionName: "configure",
    args: [{ x: BigInt(p.x), y: BigInt(p.y), verifiers: WEBAUTHN_VERIFIERS }],
  });
  const txs = concatHex([
    encodeMultiSendTx(1, PASSKEY_SAFE.safeModuleSetup, 0n, enableModules),
    encodeMultiSendTx(1, PASSKEY_SAFE.sharedSigner, 0n, configure),
  ]);
  const initializer = encodeFunctionData({
    abi: safeSetupAbi,
    functionName: "setup",
    args: [
      [PASSKEY_SAFE.sharedSigner],
      1n,
      PASSKEY_SAFE.multiSend,
      encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [txs] }),
      PASSKEY_SAFE.safe4337Module,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
  return { initializer, saltNonce: SAFE_SALT_NONCE };
}

/** CREATE2 per SafeProxyFactory 1.4.1: salt = keccak256(keccak256(initializer) ++ saltNonce). */
export function predictSafeAddress(p: PasskeyPublicKey): Hex {
  const { initializer, saltNonce } = buildSafeSetup(p);
  const salt = keccak256(concatHex([keccak256(initializer), numberToHex(saltNonce, { size: 32 })]));
  const bytecode = concatHex([
    SAFE_PROXY_CREATION_CODE,
    encodeAbiParameters([{ type: "address" }], [PASSKEY_SAFE.singletonL2]),
  ]);
  return getContractAddress({ opcode: "CREATE2", from: PASSKEY_SAFE.proxyFactory, salt, bytecode });
}

/** v0.7 userOp `factoryData` (factory = SafeProxyFactory 1.4.1). */
export function safeFactoryData(p: PasskeyPublicKey): Hex {
  const { initializer, saltNonce } = buildSafeSetup(p);
  return encodeFunctionData({
    abi: createProxyWithNonceAbi,
    functionName: "createProxyWithNonce",
    args: [PASSKEY_SAFE.singletonL2, initializer, saltNonce],
  });
}
