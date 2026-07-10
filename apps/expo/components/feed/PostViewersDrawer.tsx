import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import BottomDrawer from '@/components/BottomDrawer';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { useTheme } from '@/context/ThemeContext';
import { getPostViewers, type PostViewer } from '@/lib/supabase-posts';

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
};

/** Creator-only list of who viewed a post and how often. Never shows wallets. */
export default function PostViewersDrawer({ visible, onClose, postId }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [viewers, setViewers] = useState<PostViewer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !postId) return;
    let cancelled = false;
    setLoading(true);
    getPostViewers(postId).then((rows) => {
      if (cancelled) return;
      setViewers(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  const displayName = (v: PostViewer) => v.display_name || v.username || 'Jemand';

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Aufrufe</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : viewers.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>Noch keine Aufrufe</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {viewers.map((v) => {
            const openProfile = v.username
              ? () => {
                  onClose();
                  router.push(`/user/${v.username}` as any);
                }
              : undefined;
            return (
              <Pressable
                key={v.wallet_address}
                onPress={openProfile}
                disabled={!openProfile}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.pressedOverlay },
                ]}
              >
                <UserAvatarWithFrame
                  size={36}
                  uri={v.profile_picture_url}
                  fallbackInitial={displayName(v).charAt(0).toUpperCase()}
                  frameAssetUrl={null}
                />
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                  {displayName(v)}
                </Text>
                <Text style={[styles.count, { color: colors.textTertiary }]}>{v.view_count}×</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 8,
  },
  loader: {
    paddingVertical: 24,
  },
  empty: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    paddingVertical: 24,
    textAlign: 'center',
  },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  count: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
