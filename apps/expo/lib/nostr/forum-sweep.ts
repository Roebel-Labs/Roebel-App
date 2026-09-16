export type LedgerRow = { source_id: string; status: string };

/** Ids that still need a (re)publish: no ledger row, or one that is not 'published'. */
export function selectUnpublished(ownIds: string[], ledger: LedgerRow[]): string[] {
  const status = new Map(ledger.map((r) => [r.source_id, r.status]));
  return ownIds.filter((id) => status.get(id) !== 'published');
}

/** Inverse of the `${type}:${id}:${pubkeyPrefix}` key publishForumVote records. */
export function parseVoteSourceId(
  sourceId: string,
): { targetType: 'thread' | 'reply'; targetId: string } | null {
  const [type, id] = sourceId.split(':');
  if ((type === 'thread' || type === 'reply') && id) return { targetType: type, targetId: id };
  return null;
}
