/**
 * Profil → Darstellung (also reached from the "Erkunden anpassen" button at
 * the bottom of Erkunden).
 * Theme, layout presets, the Erkunden block list (move up/down, show/hide),
 * pinned mini apps, and a hand-off to Mecky for "describe what you want".
 * Every change applies immediately; the layout lives on this device only.
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { THEME_OPTIONS } from '@/constants/theme-options';
import { CustomToggle } from '@/components/consent/CustomToggle';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CheckIcon from '@/assets/icons/check.svg';
import ArrowUpIcon from '@/assets/icons/circle-arrow-up-02.svg';
import ArrowDownIcon from '@/assets/icons/circle-arrow-down-02.svg';
import LockIcon from '@/assets/icons/square-lock-02.svg';
import SparklesIcon from '@/assets/icons/sparkles.svg';
import { fetchLiveMiniApps } from '@/lib/miniapps';
import {
  getExploreBlock,
  miniAppBlockId,
  miniAppSlugOf,
  useExploreLayout,
  type ExploreLayout,
} from '@/lib/explore-layout';

type Colors = ReturnType<typeof useTheme>['colors'];

function Section({ title, hint, colors, children }: { title: string; hint?: string; colors: Colors; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {hint ? <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>{hint}</Text> : null}
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function OptionRow({ label, description, selected, onPress, colors, last }: {
  label: string; description?: string; selected: boolean; onPress: () => void; colors: Colors; last: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        {description ? <Text style={[styles.rowHint, { color: colors.textSecondary }]}>{description}</Text> : null}
      </View>
      {selected && <CheckIcon width={20} height={20} color={colors.primary} />}
    </Pressable>
  );
}

export default function DarstellungScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const { layout, presets, presetId, isCustom, save, applyPreset, reset } = useExploreLayout();

  const { data: miniApps } = useQuery({
    queryKey: ['explore', 'mini-apps'],
    queryFn: fetchLiveMiniApps,
    meta: { persist: true },
  });
  const appBySlug = useMemo(() => new Map((miniApps ?? []).map((a) => [a.slug, a])), [miniApps]);

  const hidden = new Set(layout.hidden);
  // Pins whose app went offline are skipped in the list (and render nothing on Erkunden).
  const rows = layout.order.filter((id) => {
    const slug = miniAppSlugOf(id);
    return slug ? appBySlug.has(slug) : true;
  });
  const pinnable = (miniApps ?? []).filter((a) => !layout.order.includes(miniAppBlockId(a.slug)));

  const update = (next: ExploreLayout) => void save(next);

  const move = (id: string, dir: -1 | 1) => {
    // Step over pins that are not listed, so one tap always moves one visible row.
    const at = rows.indexOf(id);
    const target = rows[at + dir];
    if (target === undefined) return;
    const order = [...layout.order];
    const i = order.indexOf(id);
    const j = order.indexOf(target);
    [order[i], order[j]] = [order[j], order[i]];
    update({ ...layout, order });
  };

  const setVisible = (id: string, visible: boolean) =>
    update({ ...layout, hidden: visible ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] });

  const unpin = (id: string) => update({ ...layout, order: layout.order.filter((o) => o !== id) });
  const pin = (slug: string) => update({ ...layout, order: [miniAppBlockId(slug), ...layout.order] });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Darstellung</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Section title="Erscheinungsbild" colors={colors}>
          {THEME_OPTIONS.map((o, i) => (
            <OptionRow
              key={o.value}
              label={o.label}
              description={o.description}
              selected={preference === o.value}
              onPress={() => setPreference(o.value)}
              colors={colors}
              last={i === THEME_OPTIONS.length - 1}
            />
          ))}
        </Section>

        <Pressable
          onPress={() => router.push({ pathname: '/messages/mecky', params: { intent: 'layout' } } as any)}
          style={({ pressed }) => [styles.mecky, { backgroundColor: colors.surface }, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <SparklesIcon width={22} height={22} color={colors.primary} />
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Mit Mecky anpassen</Text>
            <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
              Beschreibe, was du sehen möchtest. Mecky macht einen Vorschlag, du entscheidest.
            </Text>
          </View>
        </Pressable>

        <Section title="Vorlagen" colors={colors}>
          {presets.map((p, i) => (
            <OptionRow
              key={p.id}
              label={p.label}
              description={p.description}
              selected={presetId === p.id}
              onPress={() => void applyPreset(p)}
              colors={colors}
              last={i === presets.length - 1}
            />
          ))}
        </Section>

        <Section title="Erkunden" hint="Reihenfolge und sichtbare Bereiche der Startseite." colors={colors}>
          {rows.map((id, i) => {
            const slug = miniAppSlugOf(id);
            const def = getExploreBlock(id);
            const app = slug ? appBySlug.get(slug) : undefined;
            const label = app?.name ?? def?.label ?? id;
            const isHidden = hidden.has(id);
            return (
              <View
                key={id}
                style={[styles.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              >
                <View style={styles.moveButtons}>
                  <Pressable
                    onPress={() => move(id, -1)}
                    disabled={i === 0}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} nach oben`}
                    style={i === 0 && styles.disabled}
                  >
                    <ArrowUpIcon width={22} height={22} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => move(id, 1)}
                    disabled={i === rows.length - 1}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} nach unten`}
                    style={i === rows.length - 1 && styles.disabled}
                  >
                    <ArrowDownIcon width={22} height={22} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: isHidden ? colors.textSecondary : colors.textPrimary }]}>{label}</Text>
                  <Text style={[styles.rowHint, { color: colors.textSecondary }]} numberOfLines={1}>
                    {slug ? 'Angeheftete Mini-App' : def?.locked ? 'Immer sichtbar' : def?.description}
                  </Text>
                </View>
                {slug ? (
                  <Pressable onPress={() => unpin(id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${label} lösen`}>
                    <Text style={[styles.action, { color: colors.primary }]}>Lösen</Text>
                  </Pressable>
                ) : def?.locked ? (
                  <LockIcon width={20} height={20} color={colors.textSecondary} />
                ) : (
                  <CustomToggle value={!isHidden} onChange={(v) => setVisible(id, v)} />
                )}
              </View>
            );
          })}
        </Section>

        {pinnable.length > 0 && (
          <Section title="Mini-Apps anheften" hint="Erscheinen als eigene Karte oben auf Erkunden." colors={colors}>
            {pinnable.map((a, i) => (
              <View
                key={a.id}
                style={[styles.row, i < pinnable.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{a.name}</Text>
                  {a.description ? (
                    <Text style={[styles.rowHint, { color: colors.textSecondary }]} numberOfLines={1}>{a.description}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => pin(a.slug)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${a.name} anheften`}>
                  <Text style={[styles.action, { color: colors.primary }]}>Anheften</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        )}

        {isCustom && (
          <Pressable onPress={() => void reset()} style={styles.reset} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.action, { color: colors.primary }]}>Erkunden auf Standard zurücksetzen</Text>
          </Pressable>
        )}

        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          Deine Darstellung wird nur auf diesem Gerät gespeichert.
        </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fontFamily.medium, fontSize: 15 },
  rowHint: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 2 },
  moveButtons: { gap: 6 },
  disabled: { opacity: 0.3 },
  action: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  mecky: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  reset: { alignSelf: 'center', marginTop: 24 },
  footnote: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', marginTop: 16, paddingHorizontal: 16 },
});
