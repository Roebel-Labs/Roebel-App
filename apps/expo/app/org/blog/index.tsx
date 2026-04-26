import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useUser } from '@/context/UserContext';
import {
  listForAccount,
  setBlogArticleStatus,
  deleteBlogArticle,
} from '@/lib/supabase-blog-articles';
import type { BlogArticle } from '@/lib/types';
import { canPublishBlog } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function OrgBlogListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const { user } = useUser();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');

  const canWrite = canPublishBlog(activeAccount);
  const wallet = user?.wallet_address;

  const load = useCallback(async () => {
    if (!activeAccount) return;
    const data = await listForAccount(activeAccount.id);
    setArticles(data);
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePublish = async (a: BlogArticle) => {
    if (!activeAccount || !wallet) return;
    const res = await setBlogArticleStatus(a.id, activeAccount.id, wallet, 'published');
    if (res.success) {
      load();
    } else {
      Alert.alert('Fehler', res.error);
    }
  };

  const handleArchive = async (a: BlogArticle) => {
    if (!activeAccount || !wallet) return;
    const res = await setBlogArticleStatus(a.id, activeAccount.id, wallet, 'archived');
    if (res.success) {
      load();
    } else {
      Alert.alert('Fehler', res.error);
    }
  };

  const handleDelete = (a: BlogArticle) => {
    if (!activeAccount || !wallet) return;
    Alert.alert(
      'Artikel löschen?',
      'Diese Aktion kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteBlogArticle(a.id, activeAccount.id, wallet);
            if (res.success) load();
            else Alert.alert('Fehler', res.error);
          },
        },
      ]
    );
  };

  const filtered = articles.filter((a) => filter === 'all' || a.status === filter);

  if (!activeAccount) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingWrap}>
          <Text style={{ color: colors.textTertiary }}>Kein Organisationskonto aktiv.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Blog</Text>
        <Pressable
          disabled={!canWrite}
          onPress={() => router.push('/org/blog/new' as any)}
          style={styles.addButton}
        >
          <Ionicons
            name="add"
            size={26}
            color={canWrite ? colors.primary : colors.textTertiary}
          />
        </Pressable>
      </View>

      {!canWrite && (
        <View
          style={[
            styles.banner,
            { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
          ]}
        >
          <Text style={styles.bannerText}>
            Veröffentlichen ist erst nach Freigabe deines externen Kontos möglich. Entwürfe kannst du speichern.
          </Text>
        </View>
      )}

      <View style={styles.filterRow}>
        {(['all', 'draft', 'published', 'archived'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterChip,
              filter === f
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={{
                color: filter === f ? colors.onPrimary : colors.textPrimary,
                fontSize: 12,
                fontFamily: 'Inter-Medium',
              }}
            >
              {f === 'all'
                ? 'Alle'
                : f === 'draft'
                ? 'Entwürfe'
                : f === 'published'
                ? 'Veröffentlicht'
                : 'Archiviert'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.textTertiary }}>Lade Artikel…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.textTertiary }}>
              {articles.length === 0 ? 'Noch keine Artikel.' : 'Keine Artikel in dieser Kategorie.'}
            </Text>
          </View>
        ) : (
          filtered.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push(`/org/blog/${a.id}` as any)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {a.cover_image_url ? (
                <Image
                  source={{ uri: a.cover_image_url }}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.coverPlaceholder,
                    { backgroundColor: colors.surfaceSecondary },
                  ]}
                >
                  <Text style={{ fontSize: 22 }}>📝</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.cardTitle, { color: colors.textPrimary }]}
                  numberOfLines={2}
                >
                  {a.title}
                </Text>
                <View style={styles.cardMetaRow}>
                  <StatusBadge status={a.status} />
                  <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                    {new Date(a.created_at).toLocaleDateString('de-DE')} · {a.view_count} 👁
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  {a.status === 'draft' && canWrite && (
                    <ActionLink
                      label="Veröffentlichen"
                      color={colors.primary}
                      onPress={() => handlePublish(a)}
                    />
                  )}
                  {a.status === 'published' && (
                    <ActionLink
                      label="Archivieren"
                      color={colors.textSecondary}
                      onPress={() => handleArchive(a)}
                    />
                  )}
                  <ActionLink
                    label="Löschen"
                    color="#DC2626"
                    onPress={() => handleDelete(a)}
                  />
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: BlogArticle['status'] }) {
  const config =
    status === 'published'
      ? { bg: '#DCFCE7', fg: '#166534', label: 'Veröffentlicht' }
      : status === 'archived'
      ? { bg: '#E5E7EB', fg: '#374151', label: 'Archiviert' }
      : { bg: '#FEF3C7', fg: '#92400E', label: 'Entwurf' };
  return (
    <View
      style={{
        backgroundColor: config.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: config.fg, fontSize: 11, fontFamily: 'Inter-Medium' }}>
        {config.label}
      </Text>
    </View>
  );
}

function ActionLink({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ marginRight: 12 }}>
      <Text style={{ color, fontSize: 12, fontFamily: 'Inter-Medium' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  addButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-Medium' },
  banner: {
    margin: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerText: { color: '#92400E', fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  empty: { padding: 40, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  cover: { width: 64, height: 64, borderRadius: 8 },
  coverPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontFamily: 'Inter-Medium' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  cardMeta: { fontSize: 11, fontFamily: 'Inter-Regular' },
  cardActions: { flexDirection: 'row', marginTop: 8 },
});
