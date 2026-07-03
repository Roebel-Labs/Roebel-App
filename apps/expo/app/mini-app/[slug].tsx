/**
 * Mini App detail screen — icon, name, author, screenshots, description,
 * permissions, and an "Öffnen" button that launches the MiniAppHost.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ChevronLeft } from '@/components/miniapp/hostIcons';
import { useGoBack } from '@/hooks/useGoBack';
import { fetchMiniAppBySlug, type MiniApp } from '@/lib/miniapps';
import { CATEGORY_LABELS } from '@/lib/miniapp-categories';
import MiniAppHost from '@/components/miniapp/MiniAppHost';
import type { MiniAppPermission } from '@netizen/miniapp-sdk';

const PERMISSION_LABELS: Record<MiniAppPermission, string> = {
  wallet: 'Wallet & Signaturen',
  rewards: 'Röbel-Münzen-Belohnungen',
  notifications: 'Benachrichtigungen',
  circles: 'Röbel-Münzen-Guthaben',
  share: 'Teilen',
};

export default function MiniAppDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const goBack = useGoBack();
  const { width } = useWindowDimensions();

  const [app, setApp] = useState<MiniApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [hostVisible, setHostVisible] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchMiniAppBySlug(slug);
      if (!cancelled) {
        setApp(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const open = useCallback(() => setHostVisible(true), []);
  const closeHost = useCallback(() => setHostVisible(false), []);

  const shotW = Math.min(width * 0.62, 260);
  const shotH = shotW * (16 / 9);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.headerBtn} hitSlop={10} accessibilityLabel="Zurück">
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !app ? (
        <View style={styles.loadingBox}>
          <Text style={[styles.notFound, { color: colors.textPrimary }]}>
            Diese Mini-App ist nicht verfügbar.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
            {/* Identity */}
            <View style={styles.identity}>
              <View
                style={[
                  styles.icon,
                  { backgroundColor: app.primaryColor || colors.surfaceSecondary },
                ]}
              >
                {app.iconUrl ? (
                  <Image source={{ uri: app.iconUrl }} style={styles.iconImg} contentFit="cover" />
                ) : (
                  <Text style={styles.iconLetter}>{app.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.identityBody}>
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
                  {app.name}
                </Text>
                <Text style={[styles.author, { color: colors.textSecondary }]} numberOfLines={1}>
                  {app.authorName ?? 'Netizen Mini App'}
                </Text>
                <View style={[styles.categoryPill, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.categoryText, { color: colors.textSecondary }]}>
                    {CATEGORY_LABELS[app.category]}
                  </Text>
                </View>
              </View>
            </View>

            {/* Screenshots */}
            {app.screenshots.length > 0 && (
              <FlatList
                horizontal
                data={app.screenshots}
                keyExtractor={(s, i) => `${i}-${s}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.shotsRow}
                style={styles.shots}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item }}
                    style={[
                      styles.shot,
                      { width: shotW, height: shotH, backgroundColor: colors.surfaceSecondary },
                    ]}
                    contentFit="cover"
                  />
                )}
              />
            )}

            {/* Description */}
            {app.description ? (
              <View style={styles.block}>
                <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>Beschreibung</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  {app.description}
                </Text>
              </View>
            ) : null}

            {/* Permissions */}
            {app.permissions.length > 0 && (
              <View style={styles.block}>
                <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>Berechtigungen</Text>
                {app.permissions.map((p) => (
                  <View key={p} style={styles.permRow}>
                    <View style={[styles.permDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.permText, { color: colors.textSecondary }]}>
                      {PERMISSION_LABELS[p] ?? p}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Tags */}
            {app.tags.length > 0 && (
              <View style={[styles.block, styles.tagsWrap]}>
                {app.tags.map((t) => (
                  <View key={t} style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Open CTA */}
          <View style={[styles.ctaBar, { backgroundColor: colors.background, borderTopColor: colors.borderSecondary }]}>
            <Pressable
              onPress={open}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Öffnen</Text>
            </Pressable>
          </View>

          <MiniAppHost app={app} visible={hostVisible} onClose={closeHost} />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFound: { fontFamily: fontFamily.medium, fontSize: 16, textAlign: 'center' },
  identity: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 16,
    alignItems: 'center',
  },
  icon: {
    width: 84,
    height: 84,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImg: { width: '100%', height: '100%' },
  iconLetter: { color: '#fff', fontFamily: fontFamily.heading, fontSize: 36 },
  identityBody: { flex: 1 },
  name: { fontFamily: fontFamily.heading, fontSize: 24 },
  author: { fontFamily: fontFamily.regular, fontSize: 14, marginTop: 2 },
  categoryPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryText: { fontFamily: fontFamily.medium, fontSize: 12 },
  shots: { marginTop: 24 },
  shotsRow: { paddingHorizontal: 16, gap: 12 },
  shot: { borderRadius: 16 },
  block: { paddingHorizontal: 16, marginTop: 24 },
  blockTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, marginBottom: 8 },
  description: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 23 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  permDot: { width: 6, height: 6, borderRadius: 3 },
  permText: { fontFamily: fontFamily.regular, fontSize: 14 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tagText: { fontFamily: fontFamily.medium, fontSize: 12 },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
});
