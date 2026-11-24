// Attester tasks: tell attesters about org registration requests waiting for their vote (NSP-14).
// The chain is the truth (OrgRegistry requests + AttesterNFT holders); the `notifications` table is
// both the in-app inbox entry and the "already told" marker, so every attester hears about a
// request exactly once. Later attester tasks (event submissions, transfers) add their own kind.
// Relative imports only: loaded by `npx tsx --test`.

export const ORG_REQUEST_NOTIFICATION_TYPE = "attester_task";
export const ORG_REQUEST_KIND = "org_request";

/** OrgRegistry request status 0 = pending (see OrgRegistry.sol). */
const PENDING = 0;

export type ChainOrgRequest = {
  id: number;
  status: number;
  orgId: string;
  safe: string;
  expiresAt: number;
};

export type PlannedNotice = { wallet: string; requestId: number; orgName: string | null };

/**
 * Who should hear about which request: pending and not expired, every attester who has not voted
 * yet, is not an owner of the org's Safe (they may not vote on their own org) and was not told
 * before. Wallets are compared lowercased.
 */
export function planOrgRequestNotices(p: {
  requests: ChainOrgRequest[];
  attesters: string[];
  /** `${requestId}:${wallet}` lowercased for attesters who already voted. */
  voted: Set<string>;
  /** Safe owners per request id (lowercased). */
  owners: Map<number, Set<string>>;
  /** `${requestId}:${wallet}` lowercased for attesters already notified. */
  notified: Set<string>;
  names: Map<string, string>;
  now: number;
}): PlannedNotice[] {
  const out: PlannedNotice[] = [];
  const attesters = [...new Set(p.attesters.map((a) => a.toLowerCase()))];
  for (const r of p.requests) {
    if (r.status !== PENDING || r.expiresAt <= p.now) continue;
    const owners = p.owners.get(r.id) ?? new Set<string>();
    for (const wallet of attesters) {
      const key = `${r.id}:${wallet}`;
      if (owners.has(wallet) || p.voted.has(key) || p.notified.has(key)) continue;
      out.push({ wallet, requestId: r.id, orgName: p.names.get(r.orgId.toLowerCase()) ?? null });
    }
  }
  return out;
}

export function orgRequestCopy(orgName: string | null): { title: string; body: string } {
  const who = orgName ? `„${orgName}“` : "Eine Organisation";
  return {
    title: "Organisation bestätigen",
    body: `${who} möchte ins öffentliche Register. Als Bescheiniger:in kannst du die Anfrage jetzt prüfen und bestätigen.`,
  };
}
