import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import AnalyticsCard from '@/components/AnalyticsCard';
import { listForAccount } from '@/lib/supabase-blog-articles';
import type { BlogArticle } from '@/lib/types';
import { canPublishBlog } from '@/lib/types';

export default function JournalistDashboardContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (activeAccount) {
      listForAccount(activeAccount.id).then((data) => {
        if (!mounted) return;
        setArticles(data);
        setLoading(false);
      });
    }
    return () => {
      mounted = false;
    };
  }, [activeAccount]);

  const drafts = articles.filter((a) => a.status === 'draft').length;
  const published = articles.filter((a) => a.status === 'published').length;
  const totalViews = articles.reduce((sum, a) => sum + (a.view_count || 0), 0);
  const canWrite = canPublishBlog(activeAccount);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Übersicht</Text>
      <View style={styles.statsGrid}>
        <AnalyticsCard label="Veröffentlicht" value={published} />
        <AnalyticsCard label="Entwürfe" value={drafts} />
        <AnalyticsCard label="Aufrufe" value={totalViews} />
        <AnalyticsCard label="Artikel gesamt" value={articles.length} />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/org/blog' as any)}
          style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Blog verwalten</Text>
            <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
              Artikel anzeigen, veröffentlichen, archivieren
            </Text>
          </View>
        </Pressable>
        <Pressable
          disabled={!canWrite}
          onPress={() => router.push('/org/blog/new' as any)}
          style={[
            styles.action,
            {
              backgroundColor: canWrite ? colors.primary : colors.surface,
              borderColor: canWrite ? colors.primary : colors.border,
              opacity: canWrite ? 1 : 0.6,
            },
          ]}
        >
          <Ionicons
            name="add-circle-outline"
            size={20}
            color={canWrite ? colors.onPrimary : colors.textTertiary}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.actionTitle,
                { color: canWrite ? colors.onPrimary : colors.textTertiary },
              ]}
            >
              Neuer Artikel
            </Text>
            <Text
              style={[
                styles.actionSub,
                { color: canWrite ? colors.onPrimary : colors.textTertiary, opacity: 0.85 },
              ]}
            >
              {canWrite ? 'Mit einfachem Editor' : 'Nach Freigabe verfügbar'}
            </Text>
          </View>
        </Pressable>
      </View>

      {loading ? (
        <View
          style={[
            styles.emptyState,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Lade Artikel…</Text>
        </View>
      ) : articles.length === 0 ? (
        <View
          style={[
            styles.emptyState,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Noch keine Artikel.
          </Text>
        </View>
      ) : (
        <View style={styles.recentList}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Zuletzt</Text>
          {articles.slice(0, 5).map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push(`/org/blog/${a.id}` as any)}
              style={[
                styles.row,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.rowTitle, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {a.title}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>
                  {a.status === 'published'
                    ? 'Veröffentlicht'
                    : a.status === 'archived'
                    ? 'Archiviert'
                    : 'Entwurf'}{' '}
                  · {new Date(a.created_at).toLocaleDateString('de-DE')}
                </Text>
              </View>
              <Text style={[styles.rowViews, { color: colors.textTertiary }]}>
                {a.view_count} 👁
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 20 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  actions: { paddingHorizontal: 16, marginTop: 16, gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionTitle: { fontSize: 14, fontFamily: 'Inter-Medium' },
  actionSub: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular' },
  recentList: { marginTop: 24 },
  row: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowTitle: { fontSize: 14, fontFamily: 'Inter-Medium' },
  rowMeta: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  rowViews: { fontSize: 12, fontFamily: 'Inter-Regular' },
});
