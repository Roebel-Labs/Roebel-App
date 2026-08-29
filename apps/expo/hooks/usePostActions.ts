import { useCallback, useSyncExternalStore } from 'react';
import { Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  togglePostLike,
  reportPost as reportPostApi,
  createRepost,
  undoRepost,
} from '@/lib/supabase-posts';
import type { PostRecord } from '@/lib/types/feed';
import { useRequireAuth } from '@/context/AuthGateContext';

/**
 * MODULE-LEVEL interaction registry, shared by every usePostActions instance.
 *
 * It used to live in per-component useState, which meant the feed, the post
 * detail screen, and the profile each held an independent copy: liking a post
 * on the detail screen updated only that copy, and navigating back showed the
 * feed's stale one (2026-08-29 bug report). One registry + useSyncExternalStore
 * keeps like/repost state synchronous across all screens; the server stays the
 * source of truth via the init* merges on every fetch.
 */
type InteractionState = {
  likedPosts: Set<string>;
  likeCounts: Record<string, number>;
  repostedPosts: Set<string>;
  repostCounts: Record<string, number>;
};

let state: InteractionState = {
  likedPosts: new Set(),
  likeCounts: {},
  repostedPosts: new Set(),
  repostCounts: {},
};
let version = 0;
const listeners = new Set<() => void>();

function mutate(update: (prev: InteractionState) => InteractionState) {
  state = update(state);
  version++;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getVersion = () => version;

/**
 * Hook for post interactions: like, repost, share, report
 */
export function usePostActions(walletAddress: string | undefined) {
  const requireAuth = useRequireAuth();
  // Subscribes this component to the shared registry — any mutation
  // re-renders every mounted consumer, which is the whole point.
  useSyncExternalStore(subscribe, getVersion, getVersion);

  /**
   * Merge batch-checked like state into the shared registry. The keys of
   * `counts` define the CHECKED scope: membership is set for exactly those
   * posts (present in `likedIds` = liked), everything outside the scope is
   * left untouched so one screen's init can never wipe another's state.
   */
  const initLikes = useCallback(
    (likedIds: Set<string>, counts: Record<string, number>) => {
      // No-op guard: FeedList re-inits whenever its data settles, and an
      // unconditional version bump here re-renders every subscriber, which
      // re-runs the init effect… (visible as the action row flickering,
      // 2026-08-29 bug report). Only notify when the scope actually changes.
      const changed = Object.keys(counts).some(
        (id) =>
          state.likeCounts[id] !== counts[id] ||
          state.likedPosts.has(id) !== likedIds.has(id)
      );
      if (!changed) return;
      mutate((prev) => {
        const likedPosts = new Set(prev.likedPosts);
        for (const id of Object.keys(counts)) {
          if (likedIds.has(id)) likedPosts.add(id);
          else likedPosts.delete(id);
        }
        return { ...prev, likedPosts, likeCounts: { ...prev.likeCounts, ...counts } };
      });
    },
    []
  );

  /**
   * Toggle like with optimistic update
   */
  const toggleLike = useCallback(
    async (postId: string, currentCount: number) => {
      if (!walletAddress) {
        requireAuth(() => {});
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Read from the live registry, not a render closure — no stale toggles.
      const wasLiked = state.likedPosts.has(postId);
      const baseCount = state.likeCounts[postId] ?? currentCount;
      const newCount = wasLiked ? Math.max(0, baseCount - 1) : baseCount + 1;

      // Optimistic update
      mutate((prev) => {
        const likedPosts = new Set(prev.likedPosts);
        if (wasLiked) likedPosts.delete(postId);
        else likedPosts.add(postId);
        return { ...prev, likedPosts, likeCounts: { ...prev.likeCounts, [postId]: newCount } };
      });

      try {
        await togglePostLike(postId, walletAddress);
      } catch (err) {
        // Revert on error
        console.error('Error toggling like:', err);
        mutate((prev) => {
          const likedPosts = new Set(prev.likedPosts);
          if (wasLiked) likedPosts.add(postId);
          else likedPosts.delete(postId);
          return { ...prev, likedPosts, likeCounts: { ...prev.likeCounts, [postId]: baseCount } };
        });
      }
    },
    [walletAddress, requireAuth]
  );

  /**
   * Check if a post is liked
   */
  const isLiked = useCallback((postId: string) => state.likedPosts.has(postId), []);

  /**
   * Get current like count (with optimistic updates applied)
   */
  const getLikeCount = useCallback(
    (postId: string, originalCount: number) => state.likeCounts[postId] ?? originalCount,
    []
  );

  /**
   * Merge batch-checked repost state (ORIGINAL post ids) — same scope
   * semantics as initLikes.
   */
  const initReposts = useCallback(
    (ids: Set<string>, counts: Record<string, number>) => {
      const changed = Object.keys(counts).some(
        (id) =>
          state.repostCounts[id] !== counts[id] ||
          state.repostedPosts.has(id) !== ids.has(id)
      );
      if (!changed) return;
      mutate((prev) => {
        const repostedPosts = new Set(prev.repostedPosts);
        for (const id of Object.keys(counts)) {
          if (ids.has(id)) repostedPosts.add(id);
          else repostedPosts.delete(id);
        }
        return { ...prev, repostedPosts, repostCounts: { ...prev.repostCounts, ...counts } };
      });
    },
    []
  );

  const isReposted = useCallback((postId: string) => state.repostedPosts.has(postId), []);

  const getRepostCount = useCallback(
    (postId: string, originalCount: number) => state.repostCounts[postId] ?? originalCount,
    []
  );

  /**
   * Plain repost with optimistic update. Throws on failure (caller shows UI).
   */
  const repost = useCallback(
    async (post: PostRecord, accountId?: string) => {
      if (!walletAddress) {
        requireAuth(() => {});
        return;
      }
      if (state.repostedPosts.has(post.id)) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      mutate((prev) => ({
        ...prev,
        repostedPosts: new Set(prev.repostedPosts).add(post.id),
        repostCounts: {
          ...prev.repostCounts,
          [post.id]: (prev.repostCounts[post.id] ?? post.reposts_count ?? 0) + 1,
        },
      }));
      try {
        const created = await createRepost(post.id, walletAddress, accountId);
        if (!created) throw new Error('repost failed');
      } catch (err) {
        mutate((prev) => {
          const repostedPosts = new Set(prev.repostedPosts);
          repostedPosts.delete(post.id);
          return {
            ...prev,
            repostedPosts,
            repostCounts: { ...prev.repostCounts, [post.id]: post.reposts_count ?? 0 },
          };
        });
        throw err;
      }
    },
    [walletAddress, requireAuth]
  );

  /**
   * Undo the caller's repost with optimistic update. Throws on failure.
   */
  const unrepost = useCallback(
    async (post: PostRecord) => {
      if (!walletAddress) {
        requireAuth(() => {});
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      mutate((prev) => {
        const repostedPosts = new Set(prev.repostedPosts);
        repostedPosts.delete(post.id);
        return {
          ...prev,
          repostedPosts,
          repostCounts: {
            ...prev.repostCounts,
            [post.id]: Math.max(0, (prev.repostCounts[post.id] ?? post.reposts_count ?? 0) - 1),
          },
        };
      });
      try {
        await undoRepost(post.id, walletAddress);
      } catch (err) {
        mutate((prev) => ({
          ...prev,
          repostedPosts: new Set(prev.repostedPosts).add(post.id),
          repostCounts: { ...prev.repostCounts, [post.id]: post.reposts_count ?? 0 },
        }));
        throw err;
      }
    },
    [walletAddress, requireAuth]
  );

  /**
   * Share a post via native share sheet
   */
  const sharePost = useCallback(async (postId: string, content: string) => {
    try {
      await Share.share({
        message: `${content}\nhttps://www.roebel.app/app/posts/${postId}`,
      });
    } catch (err) {
      console.error('Error sharing post:', err);
    }
  }, []);

  /**
   * Report a post
   */
  const reportPost = useCallback(
    async (postId: string, reason: string) => {
      if (!walletAddress) {
        requireAuth(() => {});
        return;
      }
      try {
        await reportPostApi(postId, walletAddress, reason);
      } catch (err) {
        console.error('Error reporting post:', err);
        throw err;
      }
    },
    [walletAddress, requireAuth]
  );

  return {
    likedPosts: state.likedPosts,
    initLikes,
    toggleLike,
    isLiked,
    getLikeCount,
    initReposts,
    isReposted,
    getRepostCount,
    repost,
    unrepost,
    sharePost,
    reportPost,
  };
}
