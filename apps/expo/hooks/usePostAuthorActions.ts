import { useCallback, useMemo } from 'react';
import { useUser } from '@/context/UserContext';
import { useRelations } from '@/context/RelationsContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { resolvePostAuthor } from '@/lib/post-author';
import { fetchPersonalAccountId } from '@/lib/supabase-follows';
import type { PostRecord } from '@/lib/types/feed';

/** Props for the follow / mute rows of PostOptionsDrawer. `author` is null for guests. */
export function usePostAuthorActions(post: PostRecord | null | undefined) {
  const { user } = useUser();
  const { isFollowing, follow, unfollow, mute } = useRelations();
  const { showSnackbar } = useSnackbar();

  const resolved = useMemo(() => (post ? resolvePostAuthor(post) : null), [post]);

  // Legacy posts carry no account_id: look up the person's personal account at tap time.
  const resolveId = useCallback(async (): Promise<string | null> => {
    if (!resolved) return null;
    if (resolved.accountId) return resolved.accountId;
    return resolved.wallet ? fetchPersonalAccountId(resolved.wallet) : null;
  }, [resolved]);

  const onToggleFollow = useCallback(async () => {
    const id = await resolveId();
    if (!id) return;
    await (isFollowing(id) ? unfollow([id]) : follow([id], 'manual'));
  }, [resolveId, isFollowing, follow, unfollow]);

  const onMute = useCallback(async () => {
    const id = await resolveId();
    if (!id || !resolved) return;
    const ok = await mute(id, resolved.wallet);
    if (ok) showSnackbar({ message: 'Stummgeschaltet. Aufheben unter Einstellungen → Folgen & Stummschalten.' });
  }, [resolveId, resolved, mute, showSnackbar]);

  return {
    author: user && resolved ? { accountId: resolved.accountId, wallet: resolved.wallet, name: resolved.name } : null,
    isFollowing: !!resolved?.accountId && isFollowing(resolved.accountId),
    onToggleFollow: () => void onToggleFollow(),
    onMute: () => void onMute(),
  };
}
