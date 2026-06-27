import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ArrowLeftIcon } from '@/components/Icons';
import ChevronRight from '@/assets/icons/chevron-right.svg';
import { useTheme } from '@/context/ThemeContext';
import { listPostLikers, type PostLiker } from '@/lib/supabase-posts';

const AVATAR_COLORS = ['#e8d5f5', '#d5e8f5', '#f5e8d5', '#d5f5e8', '#f5d5d5'];

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.slice(0, 2).toUpperCase();
}

export default function PostLikesList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [users, setUsers] = useState<PostLiker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    listPostLikers(id).then((data) => {
      setUsers(data);
      setLoading(false);
    });
  }, [id]);

  const handleOpenProfile = (user: PostLiker) => {
    if (!user.username) return;
    router.push({ pathname: '/user/[username]', params: { username: user.username } });
  };

  const renderUser = ({ item, index }: { item: PostLiker; index: number }) => {
    const canOpen = !!item.username;
    const displayName = item.display_name || 'Jemand';
    return (
      <Pressable
        onPress={() => handleOpenProfile(item)}
        disabled={!canOpen}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border },
          pressed && canOpen && { backgroundColor: colors.surfaceSecondary },
        ]}
      >
        {item.profile_picture_url ? (
          <Image
            source={{ uri: item.profile_picture_url }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              styles.avatarFallback,
              { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] },
            ]}
          >
            <Text style={styles.avatarInitials}>{getInitials(item.display_name)}</Text>
          </View>
        )}
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
        {canOpen && <ChevronRight width={20} height={20} color={colors.textTertiary} />}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButtonCircle, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Gefällt das</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.wallet_address}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Noch keine Likes
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#333',
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
