/**
 * The one rule for matching a call against a version-2 manifest's declared
 * contracts, shared by the node (sponsor policy), the Expo host and the web host
 * (confirm sheet). The SDK has no dependencies, so the function that turns a
 * signature into its 4-byte selector is injected (viem `toFunctionSelector`).
 */
import type { DeclaredContract } from '../types';

export interface CallRule {
  /** Lowercased contract address. */
  address: string;
  label: string;
  /** Lowercased 4-byte selector (`0x12345678`) → canonical signature. */
  selectors: Record<string, string>;
}

export interface DeclaredCallMatch {
  label: string;
  signature: string;
  /** The signature up to the first `(`. */
  name: string;
}

export function callRules(
  contracts: DeclaredContract[],
  toSelector: (signature: string) => string,
): CallRule[] {
  return contracts.map((c) => {
    const selectors: Record<string, string> = {};
    for (const sig of c.functions) selectors[toSelector(sig).toLowerCase()] = sig;
    return { address: c.address.toLowerCase(), label: c.label, selectors };
  });
}

export function findDeclaredCall(
  rules: CallRule[],
  to: string | undefined,
  data: string | undefined,
): DeclaredCallMatch | null {
  if (typeof to !== 'string' || typeof data !== 'string') return null;
  // "0x" + 8 hex characters = 4 bytes.
  if (!/^0x[0-9a-fA-F]{8}/.test(data)) return null;
  const addr = to.toLowerCase();
  const selector = data.slice(0, 10).toLowerCase();
  for (const rule of rules) {
    if (rule.address !== addr) continue;
    const signature = Object.prototype.hasOwnProperty.call(rule.selectors, selector)
      ? rule.selectors[selector]
      : undefined;
    if (!signature) continue;
    const paren = signature.indexOf('(');
    return { label: rule.label, signature, name: paren === -1 ? signature : signature.slice(0, paren) };
  }
  return null;
}
