/**
 * Mini App detail — store listing styled like the reference flow: dark chrome
 * with ✕ + "Mini-Apps" on top, a rounded sheet with circular back/share
 * buttons, identity + Öffnen, a divided stats row, screenshot carousel,
 * Überblick, Links chips, and a sticky "App öffnen" CTA.
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
  StatusBar,
  Share,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import {
  CloseIcon,
  ArrowLeft,
  ShareIcon,
  GlobeIcon,
  GridIcon,
  PersonIcon,
  EyeIcon,
  UsersIcon,
} from '@/components/miniapp/hostIcons';
import { useGoBack } from '@/hooks/useGoBack';
import {
  fetchMiniAppBySlug,
  fetchMiniAppStats,
  type MiniApp,
  type MiniAppStats,
} from '@/lib/miniapps';
import { CATEGORY_LABELS } from '@/lib/miniapp-categories';
import MiniAppHost from '@/components/miniapp/MiniAppHost';
import type { MiniAppPermission } from '@netizen-labs/miniapp-sdk';

const PERMISSION_LABELS: Record<MiniAppPermission, string> = {
  wallet: 'Wallet & Signaturen',
  rewards: 'Röbel-Münzen-Belohnungen',
  notifications: 'Benachrichtigungen',
  circles: 'Röbel-Münzen-Guthaben',
  share: 'Teilen',
};

/** Dark stage behind the sheet — same chrome as the MiniAppHost. */
const CHROME_BG = '#0F1013';
const CHROME_TEXT = '#FFFFFF';
const SHEET_RADIUS = 24;
const BTN_RADIUS = 10;

export default function MiniAppDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [app, setApp] = useState<MiniApp | null>(null);
  const [stats, setStats] = useState<MiniAppStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hostVisible, setHostVisible] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchMiniAppBySlug(slug);
      if (cancelled) return;
      setApp(data);
      setLoading(false);
      if (data) {
        const s = await fetchMiniAppStats(data.id);
        if (!cancelled) setStats(s);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const open = useCallback(() => setHostVisible(true), []);
  const closeHost = useCallback(() => setHostVisible(false), []);

  const handleShare = useCallback(() => {
    if (!app) return;
    const message = `${app.name} – Mini-App in der Röbel App`;
    void Share.share(
      Platform.OS === 'ios'
        ? { message, url: app.homeUrl }
        : { message: `${message}\n${app.homeUrl}` },
    );
  }, [app]);

  const openWebsite = useCallback(() => {
    if (app?.homeUrl) void Linking.openURL(app.homeUrl);
  }, [app?.homeUrl]);

  // Square (1:1) preview images: the first fills the viewport, the next one
  // peeks in from the right so swiping is discoverable.
  const shotW = width - 64;
  const shotH = shotW;

  // German thousands separator without relying on Hermes Intl.
  const formatCount = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={CHROME_BG} />

      {/* Dark chrome: ✕ — store mark — spacer */}
      <View style={styles.chromeBar}>
        <Pressable onPress={goBack} style={styles.chromeBtn} hitSlop={10} accessibilityLabel="Schließen">
          <CloseIcon size={22} color={CHROME_TEXT} />
        </Pressable>
        <View style={styles.chromeCenter} pointerEvents="none">
          <View style={[styles.chromeMark, { backgroundColor: colors.primary }]}>
            <GridIcon size={13} color="#fff" strokeWidth={2.2} />
          </View>
          <Text style={styles.chromeTitle}>Mini-Apps</Text>
        </View>
        <View style={styles.chromeBtn} />
      </View>

      {/* Rounded sheet */}
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
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
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 140 }}
            >
              {/* Floating circular actions */}
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={goBack}
                  style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}
                  hitSlop={8}
                  accessibilityLabel="Zurück"
                >
                  <ArrowLeft size={20} color={colors.textPrimary} />
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}
                  hitSlop={8}
                  accessibilityLabel="Teilen"
                >
                  <ShareIcon size={18} color={colors.textPrimary} />
                </Pressable>
              </View>

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
                  <Text style={[styles.tagline, { color: colors.textSecondary }]} numberOfLines={1}>
                    {app.description ?? CATEGORY_LABELS[app.category]}
                  </Text>
                  <Pressable
                    onPress={open}
                    style={({ pressed }) => [
                      styles.openBtn,
                      { backgroundColor: colors.primary },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.openBtnText, { color: colors.onPrimary }]}>Öffnen</Text>
                  </Pressable>
                </View>
              </View>

              {/* Stats row — left-aligned, horizontally swipeable */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.statsScroll}
                contentContainerStyle={styles.statsRow}
              >
                <View style={styles.statCell}>
                  <PersonIcon size={18} color={colors.textPrimary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Erstellt von</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {app.authorName ?? 'Netizen Labs'}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statCell}>
                  <EyeIcon size={18} color={colors.textPrimary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Aufrufe</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {stats ? formatCount(stats.views) : '–'}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statCell}>
                  <UsersIcon size={18} color={colors.textPrimary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Genutzt von</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {stats ? `${formatCount(stats.citizens)} Bürger:innen` : '–'}
                  </Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statCell}>
                  <GridIcon size={18} color={colors.textPrimary} />
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Kategorie</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
                    {CATEGORY_LABELS[app.category]}
                  </Text>
                </View>
              </ScrollView>

              {/* Screenshots — 1:1, first fills the viewport, next one peeks */}
              {app.screenshots.length > 0 && (
                <FlatList
                  horizontal
                  data={app.screenshots}
                  keyExtractor={(s, i) => `${i}-${s}`}
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={shotW + 12}
                  snapToAlignment="start"
                  decelerationRate="fast"
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

              {/* Überblick */}
              {app.description ? (
                <View style={styles.block}>
                  <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>Überblick</Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    {app.description}
                  </Text>
                </View>
              ) : null}

              {/* Berechtigungen */}
              {app.permissions.length > 0 && (
                <View style={styles.block}>
                  <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>
                    Diese App kann nutzen
                  </Text>
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

              {/* Links */}
              <View style={styles.block}>
                <Text style={[styles.blockTitle, { color: colors.textPrimary }]}>Links</Text>
                <View style={styles.linksRow}>
                  <Pressable
                    onPress={openWebsite}
                    style={({ pressed }) => [
                      styles.linkChip,
                      { backgroundColor: colors.surfaceSecondary },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <GlobeIcon size={16} color={colors.textPrimary} />
                    <Text style={[styles.linkChipText, { color: colors.textPrimary }]}>Website</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleShare}
                    style={({ pressed }) => [
                      styles.linkChip,
                      { backgroundColor: colors.surfaceSecondary },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ShareIcon size={16} color={colors.textPrimary} />
                    <Text style={[styles.linkChipText, { color: colors.textPrimary }]}>Teilen</Text>
                  </Pressable>
                </View>
              </View>

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

            {/* Sticky CTA */}
            <View
              style={[
                styles.ctaBar,
                { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) },
              ]}
            >
              <Pressable
                onPress={open}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.ctaText, { color: colors.onPrimary }]}>App öffnen</Text>
              </Pressable>
            </View>

            <MiniAppHost app={app} visible={hostVisible} onClose={closeHost} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHROME_BG },
  chromeBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  chromeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chromeMark: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chromeTitle: {
    color: CHROME_TEXT,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: 'hidden',
  },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFound: { fontFamily: fontFamily.medium, fontSize: 16, textAlign: 'center' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 18,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImg: { width: '100%', height: '100%' },
  iconLetter: { color: '#fff', fontFamily: fontFamily.heading, fontSize: 40 },
  identityBody: { flex: 1, justifyContent: 'center' },
  name: { fontFamily: fontFamily.heading, fontSize: 20 },
  tagline: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 19, marginTop: 3 },
  openBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    height: 36,
    paddingHorizontal: 24,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  statsScroll: { marginTop: 28, flexGrow: 0 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 20,
  },
  statCell: {
    alignItems: 'flex-start',
    gap: 4,
    minWidth: 104,
    paddingRight: 16,
  },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 12 },
  statValue: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 2, marginRight: 16 },
  shots: { marginTop: 28 },
  shotsRow: { paddingHorizontal: 20, gap: 12 },
  shot: { borderRadius: 20 },
  block: { paddingHorizontal: 20, marginTop: 28 },
  blockTitle: { fontFamily: fontFamily.heading, fontSize: 16, marginBottom: 10 },
  description: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 23 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  permDot: { width: 6, height: 6, borderRadius: 3 },
  permText: { fontFamily: fontFamily.regular, fontSize: 14 },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: BTN_RADIUS,
  },
  linkChipText: { fontFamily: fontFamily.medium, fontSize: 14 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BTN_RADIUS },
  tagText: { fontFamily: fontFamily.medium, fontSize: 12 },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cta: {
    height: 54,
    borderRadius: BTN_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
});
