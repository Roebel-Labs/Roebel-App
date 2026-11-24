/**
 * Org shell "Dashboard": every chart for the active org (owner/admin only — members never get
 * this tab, see shell-tabs.ts). Sections: Übersicht · Inhalte · Publikum · Interaktionen · Mini-Apps,
 * range pills 7/28/90/365 Tage + Zeitraum (default 28 Tage).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import BottomNavigation from '@/components/BottomNavigation';
import RangePills from '@/components/charts/RangePills';
import DateRangeSheet from '@/components/charts/DateRangeSheet';
import OverviewSection from '@/components/dashboard/analytics/OverviewSection';
import ContentSection from '@/components/dashboard/analytics/ContentSection';
import AudienceSection from '@/components/dashboard/analytics/AudienceSection';
import EngagementSection from '@/components/dashboard/analytics/EngagementSection';
import MiniAppsSection from '@/components/dashboard/analytics/MiniAppsSection';
import { useShellGuard } from '@/lib/navigation/useShellGuard';
import { useAccount } from '@/context/AccountContext';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { glassBarFootprint } from '@/lib/glass-tab-geometry';
import { DEFAULT_RANGE, rangeDates, shortDayLabel, type RangeKey } from '@/lib/charts/ranges';

const SECTIONS = ['Übersicht', 'Inhalte', 'Publikum', 'Interaktionen', 'Mini-Apps'] as const;
type Section = (typeof SECTIONS)[number];

export default function DashboardTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const allowed = useShellGuard('dashboard');
  const { activeAccount } = useAccount();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>('Übersicht');
  const [rangeKey, setRangeKey] = useState<RangeKey>(DEFAULT_RANGE);
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => rangeDates(rangeKey, new Date(), custom ?? undefined), [rangeKey, custom]);

  const onRange = (k: RangeKey) => {
    if (k === 'custom') setSheetOpen(true);
    else setRangeKey(k);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['org-analytics'] });
    setRefreshing(false);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.backdrop }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: glassBarFootprint(insets.bottom) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        stickyHeaderIndices={[1]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Dashboard</Text>
          {activeAccount?.name ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {activeAccount.name}
            </Text>
          ) : null}
        </View>

        <View style={{ backgroundColor: colors.backdrop }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {SECTIONS.map((s) => {
              const on = s === section;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSection(s)}
                  style={[styles.tab, on && { borderBottomColor: colors.textPrimary }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.tabText, { color: on ? colors.textPrimary : colors.textSecondary }]}>{s}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.pills}>
            <RangePills
              value={rangeKey}
              onChange={onRange}
              customLabel={custom ? `${shortDayLabel(range.from)} – ${shortDayLabel(range.to)}` : null}
            />
          </View>
        </View>

        {allowed ? (
          <View style={styles.body}>
            {section === 'Übersicht' && <OverviewSection range={range} />}
            {section === 'Inhalte' && <ContentSection range={range} />}
            {section === 'Publikum' && <AudienceSection range={range} />}
            {section === 'Interaktionen' && <EngagementSection range={range} />}
            {section === 'Mini-Apps' && <MiniAppsSection range={range} />}
          </View>
        ) : null}
      </ScrollView>

      <DateRangeSheet
        visible={sheetOpen}
        initial={custom ?? { from: new Date(Date.now() - 27 * 86_400_000), to: new Date() }}
        onClose={() => setSheetOpen(false)}
        onApply={(r) => {
          setCustom(r);
          setRangeKey('custom');
          setSheetOpen(false);
        }}
      />

      <View style={styles.nav} pointerEvents="box-none">
        <BottomNavigation activeTab="dashboard" glass />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontFamily: fontFamily.heading, fontSize: 34 },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 15, marginTop: 2 },
  tabs: { paddingHorizontal: 16, gap: 22 },
  tab: { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  divider: { height: StyleSheet.hairlineWidth },
  pills: { paddingVertical: 12 },
  body: { gap: 14, paddingTop: 4 },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
