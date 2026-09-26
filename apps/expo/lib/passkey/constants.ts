/**
 * Passkey accounts (tranche 1) — Gnosis chain 100 constants.
 *
 * Every address below was verified to have code on chain 100 (2026-09-26) and is
 * exercised by the fork proofs in contracts/passkey-accounts. The golden vector
 * (contracts/passkey-accounts/test/fixtures/passkey-safe-vector.json) pins the
 * encodings built from them.
 */
import { keccak256, stringToHex, type Address, type Hex } from 'viem';

export const PASSKEY_CHAIN_ID = 100;

export const ENTRY_POINT_V07: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
export const ENTRY_POINT_V06: Address = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

export const THIRDWEB_ACCOUNT_FACTORY: Address = '0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00';
export const THIRDWEB_ACCOUNT_IMPL: Address = '0xf22175c80c6e074c171811c59c6c0087e2a6a346';

export const SAFE_L2_SINGLETON: Address = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762';
export const SAFE_PROXY_FACTORY: Address = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67';
export const MULTI_SEND: Address = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
/** Batches of user calls: the sponsor route only allows DELEGATECALL into the call-only variant. */
export const MULTI_SEND_CALL_ONLY: Address = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2';

export const SAFE_4337_MODULE: Address = '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226';
export const SAFE_MODULE_SETUP: Address = '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47';

export const SAFE_WEBAUTHN_SHARED_SIGNER: Address = '0x94a4F6affBd8975951142c3999aEAB7ecee555c2';
export const SAFE_WEBAUTHN_SIGNER_FACTORY: Address = '0x1d31F259eE307358a26dFb23EB365939E8641195';
export const FCL_P256_VERIFIER: Address = '0xA86e0054C51E4894D88762a017ECc5E5235f5DBA';
export const P256_PRECOMPILE: Address = '0x0000000000000000000000000000000000000100';

export const SOCIAL_RECOVERY_MODULE: Address = '0x38275826E1933303E508433dD5f289315Da2541c';
export const SOCIAL_RECOVERY_PERIOD_SEC = 259200;

export const NETIZEN_VERIFYING_PAYMASTER: Address = '0x11ed03Db610c88b010FfE38B13142D3657f2E84f';
export const NETIZEN_SPONSOR_SIGNER: Address = '0x218B0a592f2078Aa542d7B981638595DF6bA8bF7';

/** uint176 verifiers = (0x0100 << 160) | FCLP256Verifier — precompile first, FCL fallback. */
export const WEBAUTHN_VERIFIERS: bigint = (0x0100n << 160n) | BigInt(FCL_P256_VERIFIER);

/** Safe salt nonce for the one passkey Safe per credential. */
export const SAFE_SALT_NONCE = 0n;

/**
 * SafeProxyFactory 1.4.1 `proxyCreationCode()` — read from chain 100 (2026-09-26).
 * CREATE2 initCodeHash = keccak256(proxyCreationCode ++ uint256(singleton)).
 */
export const SAFE_PROXY_CREATION_CODE: Hex =
  '0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564';

export const PASSKEY_RP_ID = 'roebel.app';
export const PASSKEY_RP_NAME = 'Röbel';
export const PASSKEY_ORIGIN = 'https://roebel.app';

/** PRF salt = keccak256("roebel.app/passkey-prf/v1") (32 bytes). */
export const PASSKEY_PRF_SALT: Hex = keccak256(stringToHex('roebel.app/passkey-prf/v1'));

/** secp256r1 group order n (for low-s normalization). */
export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** Sponsored paymasterAndData = paymaster(20) ++ uint128 ++ uint128 ++ paymasterData(320). */
export const PAYMASTER_DATA_LENGTH = 320;
export const PAYMASTER_AND_DATA_LENGTH = 20 + 16 + 16 + PAYMASTER_DATA_LENGTH; // 372

export const PASSKEY_API_URL: string = process.env.EXPO_PUBLIC_PASSKEY_API_URL ?? '';
export const PASSKEY_BUNDLER_URL: string =
  process.env.EXPO_PUBLIC_PASSKEY_BUNDLER_URL || (PASSKEY_API_URL ? `${PASSKEY_API_URL}/api/bundler` : '');
