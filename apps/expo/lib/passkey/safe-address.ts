/**
 * Counterfactual passkey Safe (Safe 1.4.1 L2 + Safe4337Module v0.3.0).
 *
 * Owner: SafeWebAuthnSharedSigner configured with the passkey's P-256 key.
 * Modules: Safe4337Module + Candide SocialRecoveryModule, enabled at setup.
 * Fallback handler: Safe4337Module. Mirrors PasskeySafeBase._passkeySafeInitializer.
 */
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getContractAddress,
  keccak256,
  numberToHex,
  size,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  MULTI_SEND,
  SAFE_4337_MODULE,
  SAFE_L2_SINGLETON,
  SAFE_MODULE_SETUP,
  SAFE_PROXY_CREATION_CODE,
  SAFE_PROXY_FACTORY,
  SAFE_SALT_NONCE,
  SAFE_WEBAUTHN_SHARED_SIGNER,
  SOCIAL_RECOVERY_MODULE,
  WEBAUTHN_VERIFIERS,
} from './constants';

export type PasskeyPublicKey = { x: Hex; y: Hex };

const safeSetupAbi = [
  {
    type: 'function',
    name: 'setup',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_owners', type: 'address[]' },
      { name: '_threshold', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'fallbackHandler', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint256' },
      { name: 'paymentReceiver', type: 'address' },
    ],
    outputs: [],
  },
] as const;

const multiSendAbi = [
  {
    type: 'function',
    name: 'multiSend',
    stateMutability: 'payable',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
  },
] as const;

const enableModulesAbi = [
  {
    type: 'function',
    name: 'enableModules',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'modules', type: 'address[]' }],
    outputs: [],
  },
] as const;

const sharedSignerConfigureAbi = [
  {
    type: 'function',
    name: 'configure',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'signer',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'y', type: 'uint256' },
          { name: 'verifiers', type: 'uint176' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const createProxyWithNonceAbi = [
  {
    type: 'function',
    name: 'createProxyWithNonce',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_singleton', type: 'address' },
      { name: 'initializer', type: 'bytes' },
      { name: 'saltNonce', type: 'uint256' },
    ],
    outputs: [{ name: 'proxy', type: 'address' }],
  },
] as const;

/** MultiSend tx packing: uint8 operation ++ address to ++ uint256 value ++ uint256 dataLength ++ data. */
export function encodeMultiSendTx(operation: 0 | 1, to: Address, value: bigint, data: Hex): Hex {
  return encodePacked(
    ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
    [operation, to, value, BigInt(size(data)), data],
  );
}

export function buildSafeSetup(p: PasskeyPublicKey): { initializer: Hex; saltNonce: bigint } {
  const enableModules = encodeFunctionData({
    abi: enableModulesAbi,
    functionName: 'enableModules',
    args: [[SAFE_4337_MODULE, SOCIAL_RECOVERY_MODULE]],
  });
  const configure = encodeFunctionData({
    abi: sharedSignerConfigureAbi,
    functionName: 'configure',
    args: [{ x: BigInt(p.x), y: BigInt(p.y), verifiers: WEBAUTHN_VERIFIERS }],
  });
  const txs = concatHex([
    encodeMultiSendTx(1, SAFE_MODULE_SETUP, 0n, enableModules),
    encodeMultiSendTx(1, SAFE_WEBAUTHN_SHARED_SIGNER, 0n, configure),
  ]);
  const initializer = encodeFunctionData({
    abi: safeSetupAbi,
    functionName: 'setup',
    args: [
      [SAFE_WEBAUTHN_SHARED_SIGNER],
      1n,
      MULTI_SEND,
      encodeFunctionData({ abi: multiSendAbi, functionName: 'multiSend', args: [txs] }),
      SAFE_4337_MODULE,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
  return { initializer, saltNonce: SAFE_SALT_NONCE };
}

/**
 * CREATE2 per SafeProxyFactory 1.4.1:
 * salt = keccak256(keccak256(initializer) ++ saltNonce), initCodeHash = keccak256(proxyCreationCode ++ uint256(singleton)).
 */
export function predictSafeAddress(p: PasskeyPublicKey): Address {
  const { initializer, saltNonce } = buildSafeSetup(p);
  const salt = keccak256(concatHex([keccak256(initializer), numberToHex(saltNonce, { size: 32 })]));
  const bytecode = concatHex([
    SAFE_PROXY_CREATION_CODE,
    encodeAbiParameters([{ type: 'address' }], [SAFE_L2_SINGLETON]),
  ]);
  return getContractAddress({ opcode: 'CREATE2', from: SAFE_PROXY_FACTORY, salt, bytecode });
}

/** factoryData for the v0.7 userOp (`factory` = SAFE_PROXY_FACTORY). */
export function safeFactoryData(p: PasskeyPublicKey): Hex {
  const { initializer, saltNonce } = buildSafeSetup(p);
  return encodeFunctionData({
    abi: createProxyWithNonceAbi,
    functionName: 'createProxyWithNonce',
    args: [SAFE_L2_SINGLETON, initializer, saltNonce],
  });
}

/** Packed initCode = factory ++ factoryData (what the Safe op hash covers). */
export function safeInitCode(p: PasskeyPublicKey): Hex {
  return concatHex([SAFE_PROXY_FACTORY, safeFactoryData(p)]).toLowerCase() as Hex;
}
