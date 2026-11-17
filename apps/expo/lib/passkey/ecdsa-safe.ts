/**
 * Counterfactual expert-path Safe (Safe 1.4.1 L2 + Safe4337Module v0.3.0) owned by ONE plain
 * ECDSA key: the account key of the 12 words (`m/44'/60'/0'/0/0`, words.ts).
 *
 *   setup(owners = [owner], threshold = 1, to = SafeModuleSetup,
 *         data = enableModules([Safe4337Module, SocialRecoveryModule]),
 *         fallbackHandler = Safe4337Module, 0, 0, 0)
 *   proxy = createProxyWithNonce(SafeL2, setup, SAFE_SALT_NONCE)
 *
 * Same modules, fallback handler, factory, singleton and salt nonce as the passkey Safe
 * (safe-address.ts); only the owner differs (no shared signer, no MultiSend). Pinned byte for
 * byte by __tests__/ecdsa-safe-vector.json (fork proof EcdsaSafe.t.sol). The web sponsor mirrors
 * this setup in its own safe-address.ts, pinned by the same vector.
 */
import { concatHex, encodeAbiParameters, encodeFunctionData, getAddress, getContractAddress, keccak256, numberToHex, parseAbi, zeroAddress, type Address, type Hex } from 'viem';
import {
  SAFE_4337_MODULE,
  SAFE_L2_SINGLETON,
  SAFE_MODULE_SETUP,
  SAFE_PROXY_CREATION_CODE,
  SAFE_PROXY_FACTORY,
  SAFE_SALT_NONCE,
  SOCIAL_RECOVERY_MODULE,
} from './constants';

const abi = parseAbi([
  'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function enableModules(address[] modules)',
  'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
]);

export function buildEcdsaSafeSetup(owner: Address): { initializer: Hex; saltNonce: bigint } {
  const enableModules = encodeFunctionData({ abi, functionName: 'enableModules', args: [[SAFE_4337_MODULE, SOCIAL_RECOVERY_MODULE]] });
  const initializer = encodeFunctionData({
    abi,
    functionName: 'setup',
    args: [[getAddress(owner)], 1n, SAFE_MODULE_SETUP, enableModules, SAFE_4337_MODULE, zeroAddress, 0n, zeroAddress],
  });
  return { initializer, saltNonce: SAFE_SALT_NONCE };
}

/** CREATE2 per SafeProxyFactory 1.4.1 (same formula as `predictSafeAddress`). */
export function predictEcdsaSafeAddress(owner: Address): Address {
  const { initializer, saltNonce } = buildEcdsaSafeSetup(owner);
  const salt = keccak256(concatHex([keccak256(initializer), numberToHex(saltNonce, { size: 32 })]));
  const bytecode = concatHex([SAFE_PROXY_CREATION_CODE, encodeAbiParameters([{ type: 'address' }], [SAFE_L2_SINGLETON])]);
  return getContractAddress({ opcode: 'CREATE2', from: SAFE_PROXY_FACTORY, salt, bytecode });
}

/** factoryData for the v0.7 userOp (`factory` = SAFE_PROXY_FACTORY). */
export function ecdsaSafeFactoryData(owner: Address): Hex {
  const { initializer, saltNonce } = buildEcdsaSafeSetup(owner);
  return encodeFunctionData({ abi, functionName: 'createProxyWithNonce', args: [SAFE_L2_SINGLETON, initializer, saltNonce] });
}

/** Packed initCode = factory ++ factoryData (what the Safe op hash covers), lowercase like `safeInitCode`. */
export function ecdsaSafeInitCode(owner: Address): Hex {
  return concatHex([SAFE_PROXY_FACTORY, ecdsaSafeFactoryData(owner)]).toLowerCase() as Hex;
}
