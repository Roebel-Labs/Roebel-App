export function getBaseScanTxUrl(txHash: string): string {
  return `https://basescan.org/tx/${txHash}`;
}

export function getBaseScanAddressUrl(address: string): string {
  return `https://basescan.org/address/${address}`;
}
