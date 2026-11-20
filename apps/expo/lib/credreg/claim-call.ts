/**
 * The claim call for an invitation (leaf + proof, plus the server's claim signature for a
 * claim-key leaf), encoded against the app's own REGISTRY. Shared by accepting (accept.ts) and the
 * waiting badges that ride along with another operation (pending.ts).
 */
import { claimCall, type Leaf } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import { REGISTRY } from './chain';
import type { InvitationView } from './types';

export function chainLeaf(inv: InvitationView): Leaf | null {
  const c = inv.claim;
  if (!c || !c.leaf) return null;
  try {
    return { kind: c.leaf.kind, typeId: c.leaf.typeId, subject: c.leaf.subject, validUntil: BigInt(c.leaf.validUntil), salt: c.leaf.salt };
  } catch {
    return null;
  }
}

/** The claim call for an invitation, encoded against the app's own REGISTRY. null = malformed. */
export function claimFor(inv: InvitationView): { to: `0x${string}`; data: Hex } | null {
  const c = inv.claim;
  const leaf = chainLeaf(inv);
  if (!leaf) return null;
  try {
    // A claim-key leaf needs the server's signature bound to this account; an account leaf none.
    const claimSignature = c.leaf.kind === 'claimKey' ? c.claimSignature ?? undefined : undefined;
    if (c.leaf.kind === 'claimKey' && !claimSignature) return null;
    return claimCall(REGISTRY, { batchId: BigInt(c.batchId), leaf, proof: c.proof, claimSignature });
  } catch {
    return null;
  }
}
