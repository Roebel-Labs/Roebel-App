import { useEffect, useState } from 'react';
import { fetchMembersWithProfiles } from '@/lib/supabase-member-management';

export type MemberPreviewUser = { avatar_url: string | null; username: string | null };

type Preview = { accountId: string; users: MemberPreviewUser[]; count: number };
const EMPTY: MemberPreviewUser[] = [];

/** Member avatars + count for the org "Mitglieder" pill. One fetch per account id. */
export function useOrgMemberPreview(accountId: string | undefined) {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    fetchMembersWithProfiles(accountId)
      .then((members) => {
        if (cancelled) return;
        setPreview({
          accountId,
          users: members.map((m) => ({
            avatar_url: m.user?.profile_picture_url ?? null,
            username: m.user?.username ?? null,
          })),
          count: members.length,
        });
      })
      .catch(() => {
        if (!cancelled) setPreview({ accountId, users: EMPTY, count: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // A preview for another account (or none yet) reads as empty.
  const current = accountId && preview?.accountId === accountId ? preview : null;
  return { users: current?.users ?? EMPTY, count: current?.count ?? 0 };
}
