/**
 * Blockscout Helper Functions
 *
 * Blockscout provides better UX for ERC-4337 smart account transactions
 * compared to BaseScan, which primarily focuses on EOA transactions.
 *
 * Smart account transactions appear as:
 * - User Operations (not regular transactions)
 * - Internal Transactions (contract-to-contract calls)
 * - Contract Events (event logs)
 */

/**
 * Get Blockscout transaction URL
 * Shows UserOperation details for smart account transactions
 */
export function getBlockscoutTxUrl(txHash: string): string {
  return `https://gnosis.blockscout.com/tx/${txHash}`;
}

/**
 * Get Blockscout address URL
 * Shows smart account details including user operations
 */
export function getBlockscoutAddressUrl(address: string): string {
  return `https://gnosis.blockscout.com/address/${address}`;
}

/**
 * Get Blockscout contract events URL
 * Direct link to the Logs/Events tab for a contract
 */
export function getBlockscoutContractEventsUrl(address: string): string {
  return `https://gnosis.blockscout.com/address/${address}?tab=logs`;
}

/**
 * Get BaseScan contract events URL
 * Alternative explorer for viewing contract events
 */
export function getBaseScanContractEventsUrl(address: string): string {
  return `https://gnosisscan.io/address/${address}#events`;
}

/**
 * Get BaseScan transaction URL
 * Traditional explorer link (may not show all smart account details)
 */
export function getBaseScanTxUrl(txHash: string): string {
  return `https://gnosisscan.io/tx/${txHash}`;
}

/**
 * Get BaseScan address URL
 * Traditional explorer link to a contract / address page
 */
export function getBaseScanAddressUrl(address: string): string {
  return `https://gnosisscan.io/address/${address}`;
}
