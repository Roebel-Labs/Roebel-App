import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchUserPosts } from '@/lib/supabase-posts';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import PostImageGrid from '@/components/feed/PostImageGrid';
import PostLinkedEventCard from '@/components/feed/PostLinkedEventCard';
import PostYouTubePreview from '@/components/feed/PostYouTubePreview';
import { resolveYouTubeUrl, removeYouTubeUrls } from '@/lib/utils/youtube';
import type { PostRecord } from '@/lib/types/feed';

type Props = {
  walletAddress: string;
};

/**
 * Read-only list of a user's published posts — rendered on the "Beiträge" tab
 * of the public profile. Tapping any item navigates to /post/[id] where the
 * full feed interactions (like, comment, share) are available.
 */
export default function UserPostsList({ walletAddress }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await fetchUserPosts(walletAddress);
      if (!cancelled) {
        setPosts(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Noch keine Beiträge
        </Text>
      </View>
    );
  }

  return (
    <View>
      {posts.map((post) => {
        const youtubeUrl = resolveYouTubeUrl(post.content, post.links?.map((l) => l.url));
        const displayContent = youtubeUrl ? removeYouTubeUrls(post.content) : post.content;
        return (
          <Pressable
            key={post.id}
            onPress={() => router.push(`/post/${post.id}` as any)}
            style={({ pressed }) => [
              styles.post,
              { borderBottomColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Beitrag öffnen"
          >
            <PostAuthorRow
              author={post.author}
              category={post.category}
              createdAt={post.created_at}
            />
            {displayContent ? (
              <Text
                style={[styles.content, { color: colors.textPrimary }]}
                numberOfLines={6}
              >
                {displayContent}
              </Text>
            ) : null}
            {post.media_urls && post.media_urls.length > 0 && (
              <PostImageGrid imageUrls={post.media_urls as string[]} />
            )}
            {post.linked_event && <PostLinkedEventCard event={post.linked_event} />}
            {youtubeUrl && <PostYouTubePreview youtubeUrl={youtubeUrl} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
