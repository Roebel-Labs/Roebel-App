// Block-explorer link helpers. Function names kept (`getBaseScan*`) for import
// stability, but they now point at Gnosisscan since the DAO stack lives on
// Gnosis (v2). Update here if the explorer ever changes.
export function getBaseScanTxUrl(txHash: string): string {
  return `https://gnosisscan.io/tx/${txHash}`;
}

export function getBaseScanAddressUrl(address: string): string {
  return `https://gnosisscan.io/address/${address}`;
}
