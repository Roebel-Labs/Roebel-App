/**
 * The one rule for which EIP-1193 wallet methods a mini app may call, shared by
 * every host (Expo and web). Nothing else decides what needs a confirmation:
 * a method that is in neither list is `unsupported` and must never reach the
 * user's real wallet.
 */
export type WalletMethodClass = 'read' | 'sign' | 'unsupported';

/** Answered without asking the user. */
export const WALLET_READ_METHODS: readonly string[] = [
  'eth_chainId',
  'net_version',
  'eth_accounts',
  'eth_requestAccounts',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  // Proxied to the community's RPC by the host, with limits (plan 3).
  'eth_call',
  'eth_getBalance',
  'eth_getLogs',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_blockNumber',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
  // EIP-5792: answered by the host itself.
  'wallet_getCapabilities',
  'wallet_getCallsStatus',
];

/** Each call needs an explicit confirmation from the user. */
export const WALLET_SIGN_METHODS: readonly string[] = [
  'eth_sendTransaction',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  // EIP-5792: several calls, one confirmation.
  'wallet_sendCalls',
];

export function classifyWalletMethod(method: string): WalletMethodClass {
  if (WALLET_SIGN_METHODS.includes(method)) return 'sign';
  if (WALLET_READ_METHODS.includes(method)) return 'read';
  return 'unsupported';
}
