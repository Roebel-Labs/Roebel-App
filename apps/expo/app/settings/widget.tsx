/**
 * Profil → Einstellungen → Widget: which mini apps the home-screen widget shows, and in
 * what order (max 15 — the widget’s last tile is always the store tile "Mini-Apps entdecken"). Every change is saved
 * and pushed to the widget at once. Also the landing page of the empty widget
 * (roebel://settings/widget).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ArrowUpIcon from '@/assets/icons/circle-arrow-up-02.svg';
import ArrowDownIcon from '@/assets/icons/circle-arrow-down-02.svg';
import { AppIcon } from '@/components/miniapp/MiniAppCard';
import { fetchLiveMiniApps, type MiniApp } from '@/lib/miniapps';
import { getRecentMiniAppSlugs } from '@/lib/miniapp-installs';
import { getWidgetSelection, setWidgetSelection } from '@/lib/widget-sync';
import { resolveSelection, WIDGET_MAX_APPS } from '@/lib/widget-payload';

type Colors = ReturnType<typeof useTheme>['colors'];

const HOW_TO_ADD =
  Platform.OS === 'ios'
    ? 'Halte eine freie Stelle auf deinem Homescreen gedrückt, tippe auf „Bearbeiten“ → „Widget hinzufügen“ und wähle „Röbel“.'
    : 'Halte eine freie Stelle auf deinem Homescreen gedrückt, tippe auf „Widgets“ und wähle „Röbel“ → „Mini Apps“.';

function Section({ title, hint, colors, children }: { title: string; hint?: string; colors: Colors; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {hint ? <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>{hint}</Text> : null}
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

export default function WidgetSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const wallet = account?.address?.toLowerCase() ?? null;

  const { data: live } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });

  // null until loaded; then the explicit choice, or what the widget shows by default.
  const [selected, setSelected] = useState<string[] | null>(null);
  useEffect(() => {
    if (!live || selected) return;
    let cancelled = false;
    void Promise.all([getWidgetSelection(), getRecentMiniAppSlugs()]).then(([stored, recent]) => {
      if (!cancelled) setSelected(resolveSelection(stored, recent, live).map((a) => a.slug));
    });
    return () => {
      cancelled = true;
    };
  }, [live, selected]);

  const bySlug = useMemo(() => new Map((live ?? []).map((a) => [a.slug, a])), [live]);
  const chosen = (selected ?? []).map((s) => bySlug.get(s)).filter((a): a is MiniApp => !!a);
  const others = (live ?? []).filter((a) => !(selected ?? []).includes(a.slug));
  const full = chosen.length >= WIDGET_MAX_APPS;

  const update = (next: string[]) => {
    setSelected(next);
    void setWidgetSelection(next, wallet);
  };
  const ids = chosen.map((a) => a.slug);
  const move = (slug: string, dir: -1 | 1) => {
    const i = ids.indexOf(slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const remove = (slug: string) => update(ids.filter((s) => s !== slug));
  const add = (slug: string) => {
    if (!full) update([...ids, slug]);
  };

  const divider = (i: number, n: number) =>
    i < n - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Widget</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Wähle, welche Mini Apps im Röbel-Widget auf deinem Homescreen erscheinen. {HOW_TO_ADD}
        </Text>

        <Section
          title="Im Widget"
          hint={`${chosen.length} von ${WIDGET_MAX_APPS} · Ohne Auswahl zeigt das Widget deine zuletzt geöffneten Mini Apps. Die letzte Kachel „Mini-Apps entdecken“ öffnet immer den Mini-App-Store.`}
          colors={colors}
        >
          {chosen.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Noch keine Mini Apps ausgewählt. Füge unten welche hinzu.
            </Text>
          ) : (
            chosen.map((app, i) => (
              <View key={app.slug} style={[styles.row, divider(i, chosen.length)]}>
                <View style={styles.moveButtons}>
                  <Pressable
                    onPress={() => move(app.slug, -1)}
                    disabled={i === 0}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${app.name} nach oben`}
                    style={i === 0 && styles.disabled}
                  >
                    <ArrowUpIcon width={22} height={22} color={colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => move(app.slug, 1)}
                    disabled={i === chosen.length - 1}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${app.name} nach unten`}
                    style={i === chosen.length - 1 && styles.disabled}
                  >
                    <ArrowDownIcon width={22} height={22} color={colors.textPrimary} />
                  </Pressable>
                </View>
                <AppIcon app={app} size={36} />
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                  {app.name}
                </Text>
                <Pressable onPress={() => remove(app.slug)} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.action, { color: colors.primary }]}>Entfernen</Text>
                </Pressable>
              </View>
            ))
          )}
        </Section>

        {others.length > 0 && (
          <Section
            title="Weitere Mini Apps"
            hint={full ? `Maximal ${WIDGET_MAX_APPS} Mini Apps. Entferne zuerst eine.` : undefined}
            colors={colors}
          >
            {others.map((app, i) => (
              <Pressable
                key={app.slug}
                onPress={() => add(app.slug)}
                disabled={full}
                style={[styles.row, divider(i, others.length), full && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel={`${app.name} hinzufügen`}
              >
                <AppIcon app={app} size={36} />
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                  {app.name}
                </Text>
                <Text style={[styles.action, { color: colors.primary }]}>Hinzufügen</Text>
              </Pressable>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  headerSpacer: { width: 24 },
  scroll: { paddingBottom: 48 },
  intro: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingTop: 8 },
  section: { paddingHorizontal: 16, paddingTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionHint: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: -6, marginBottom: 12 },
  sectionContent: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowLabel: { flex: 1, fontFamily: fontFamily.medium, fontSize: 15 },
  moveButtons: { gap: 6 },
  disabled: { opacity: 0.3 },
  action: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  empty: { fontFamily: fontFamily.regular, fontSize: 14, padding: 16 },
});
