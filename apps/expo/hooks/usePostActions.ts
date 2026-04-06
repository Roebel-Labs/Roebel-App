import { useState, useCallback } from 'react';
import { Share } from 'react-native';
import { togglePostLike, reportPost as reportPostApi } from '@/lib/supabase-posts';

/**
 * Hook for post interactions: like, share, report
 */
export function usePostActions(walletAddress: string | undefined) {
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});

  /**
   * Initialize like state from batch-checked data
   */
  const initLikes = useCallback(
    (likedIds: Set<string>, counts: Record<string, number>) => {
      setLikedPosts(likedIds);
      setLikeCounts(counts);
    },
    []
  );

  /**
   * Toggle like with optimistic update
   */
  const toggleLike = useCallback(
    async (postId: string, currentCount: number) => {
      if (!walletAddress) return;

      const wasLiked = likedPosts.has(postId);
      const newCount = wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1;

      // Optimistic update
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (wasLiked) {
          next.delete(postId);
        } else {
          next.add(postId);
        }
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [postId]: newCount }));

      try {
        await togglePostLike(postId, walletAddress);
      } catch (err) {
        // Revert on error
        console.error('Error toggling like:', err);
        setLikedPosts((prev) => {
          const next = new Set(prev);
          if (wasLiked) {
            next.add(postId);
          } else {
            next.delete(postId);
          }
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: currentCount }));
      }
    },
    [walletAddress, likedPosts]
  );

  /**
   * Check if a post is liked
   */
  const isLiked = useCallback(
    (postId: string) => likedPosts.has(postId),
    [likedPosts]
  );

  /**
   * Get current like count (with optimistic updates applied)
   */
  const getLikeCount = useCallback(
    (postId: string, originalCount: number) => {
      return likeCounts[postId] ?? originalCount;
    },
    [likeCounts]
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
      if (!walletAddress) return;
      try {
        await reportPostApi(postId, walletAddress, reason);
      } catch (err) {
        console.error('Error reporting post:', err);
        throw err;
      }
    },
    [walletAddress]
  );

  return {
    likedPosts,
    initLikes,
    toggleLike,
    isLiked,
    getLikeCount,
    sharePost,
    reportPost,
  };
}
