/**
 * NSP-14 attester inbox — pure selection of the open org registration requests an
 * attester can still act on, plus the orgId → app org lookup (no I/O).
 */
import type { Address, Hex } from 'viem';
import { orgIdFromUuid } from './ops';

/** OrgRegistry.Request as returned by getRequest (enums as numbers). */
export type RawOrgRequest = {
  requestType: number; // 0 Registration, 1 Revocation
  status: number; // 0 Pending, 1 Rejected, 2 Executed
  orgId: Hex;
  safe: Address;
  approvals: number;
  rejections: number;
  requiredApprovals: number;
  requiredRejections: number;
  expiresAt: number;
};

export type OrgRef = { id: string; name: string; avatar_url?: string | null };

export type OrgRequestItem = {
  requestId: number;
  orgId: Hex;
  safe: Address;
  approvals: number;
  required: number;
  rejections: number;
  requiredRejections: number;
  expiresAt: number;
  /** The app org this id belongs to; null = an id no app org hashes to (never approve blindly). */
  org: OrgRef | null;
  /** The attester already voted on this request. */
  voted: boolean;
  /** The attester co-owns the requesting Safe: the contract refuses their approval (SelfVote). */
  selfOwned: boolean;
};

/** orgId (lowercase) → app org, for every org whose uuid is valid. */
export function orgDirectory(orgs: readonly OrgRef[]): Map<string, OrgRef> {
  const map = new Map<string, OrgRef>();
  for (const o of orgs) {
    try {
      map.set(orgIdFromUuid(o.id).toLowerCase(), o);
    } catch {
      // not a uuid: cannot be an NSP-14 org
    }
  }
  return map;
}

/**
 * Pending, unexpired REGISTRATION requests, newest first. `requests[i]` has id
 * `firstId + i`. Votes and Safe ownership are per attester and come from the chain.
 */
export function selectOpenOrgRequests(p: {
  requests: readonly RawOrgRequest[];
  firstId: number;
  now: number;
  directory: Map<string, OrgRef>;
  voted: ReadonlySet<number>;
  selfOwned: ReadonlySet<number>;
}): OrgRequestItem[] {
  const out: OrgRequestItem[] = [];
  p.requests.forEach((r, i) => {
    if (r.requestType !== 0 || r.status !== 0 || r.expiresAt <= p.now) return;
    const requestId = p.firstId + i;
    out.push({
      requestId,
      orgId: r.orgId,
      safe: r.safe,
      approvals: r.approvals,
      required: r.requiredApprovals,
      rejections: r.rejections,
      requiredRejections: r.requiredRejections,
      expiresAt: r.expiresAt,
      org: p.directory.get(r.orgId.toLowerCase()) ?? null,
      voted: p.voted.has(requestId),
      selfOwned: p.selfOwned.has(requestId),
    });
  });
  return out.sort((a, b) => b.requestId - a.requestId);
}

/** Requests this attester can still decide: not voted yet. */
export function actionableCount(items: readonly OrgRequestItem[]): number {
  return items.filter((i) => !i.voted).length;
}
