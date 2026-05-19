import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchAccountPosts } from '@/lib/supabase-posts';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import PostImageGrid from '@/components/feed/PostImageGrid';
import PostLinkedEventCard from '@/components/feed/PostLinkedEventCard';
import type { PostRecord } from '@/lib/types/feed';

type Props = {
  accountId: string;
};

/**
 * Read-only list of an organisation account's published posts — rendered on
 * the "Beiträge" tab of the public org profile. Mirrors UserPostsList but
 * fetches by account_id instead of wallet_address.
 */
export default function AccountPostsList({ accountId }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrored(false);
      try {
        const { data } = await fetchAccountPosts(accountId, { pageSize: 50 });
        if (!cancelled) setPosts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[AccountPostsList] fetch failed:', err);
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const safePosts = useMemo(
    () =>
      posts.filter(
        (p) => p && typeof p.id === 'string' && typeof p.created_at === 'string'
      ),
    [posts]
  );

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (errored) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Beiträge konnten nicht geladen werden
        </Text>
      </View>
    );
  }

  if (safePosts.length === 0) {
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
      {safePosts.map((post) => {
        const mediaUrls = Array.isArray(post.media_urls)
          ? (post.media_urls.filter((u) => typeof u === 'string' && u.length > 0) as string[])
          : [];
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
            {post.content ? (
              <Text
                style={[styles.content, { color: colors.textPrimary }]}
                numberOfLines={6}
              >
                {post.content}
              </Text>
            ) : null}
            {mediaUrls.length > 0 && <PostImageGrid imageUrls={mediaUrls} />}
            {post.linked_event && <PostLinkedEventCard event={post.linked_event} />}
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
