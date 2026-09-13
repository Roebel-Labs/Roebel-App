import { useEffect, useState } from 'react';
import { fetchMembersWithProfiles } from '@/lib/supabase-member-management';

export type MemberPreviewUser = { avatar_url: string | null; username: string | null };

/** Member avatars + count for the org "Mitglieder" pill. One fetch per account id. */
export function useOrgMemberPreview(accountId: string | undefined) {
  const [users, setUsers] = useState<MemberPreviewUser[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!accountId) {
      setUsers([]);
      setCount(0);
      return;
    }
    let cancelled = false;
    fetchMembersWithProfiles(accountId)
      .then((members) => {
        if (cancelled) return;
        setUsers(
          members.map((m) => ({
            avatar_url: m.user?.profile_picture_url ?? null,
            username: m.user?.username ?? null,
          })),
        );
        setCount(members.length);
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
          setCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return { users, count };
}
