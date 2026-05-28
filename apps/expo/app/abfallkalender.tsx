import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import {
  AbfallFraction,
  FRACTION_LABEL,
  enableReminder,
  disableReminder,
  getReminderEnabled,
  refreshAllReminders,
} from '@/lib/abfallkalender-reminders';

const NODE_ID = 12236;

interface PickupRow {
  pickup_date: string;
  fraction: AbfallFraction;
  summary: string;
  starts_at: string | null;
}

const FRACTION_COLOR: Record<AbfallFraction, string> = {
  restmuell: '#3c4043',
  bio: '#8B5A2B',
  papier: '#1f6feb',
  gelbe_tonne: '#E8B100',
  schadstoff: '#C0392B',
  weihnachtsbaum: '#2E7D32',
};

export default function AbfallkalenderScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [pickups, setPickups] = useState<PickupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<Record<AbfallFraction, boolean>>({
    restmuell: false,
    bio: false,
    papier: false,
    gelbe_tonne: false,
    schadstoff: false,
    weihnachtsbaum: false,
  });

  useEffect(() => {
    async function load() {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('waste_collection')
        .select('pickup_date, fraction, summary, starts_at')
        .eq('node_id', NODE_ID)
        .gte('pickup_date', today)
        .order('pickup_date', { ascending: true })
        .limit(60);

      if (error) {
        console.error('Abfallkalender load error:', error);
        setPickups([]);
      } else {
        setPickups((data ?? []) as PickupRow[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadReminderState() {
      const fractions: AbfallFraction[] = [
        'restmuell',
        'bio',
        'papier',
        'gelbe_tonne',
        'schadstoff',
        'weihnachtsbaum',
      ];
      const next: Record<AbfallFraction, boolean> = { ...reminders };
      for (const f of fractions) {
        next[f] = await getReminderEnabled(f);
      }
      setReminders(next);
      refreshAllReminders().catch((err) =>
        console.warn('Abfallkalender refreshAllReminders failed:', err),
      );
    }
    loadReminderState();
  }, []);

  const availableFractions = useMemo(() => {
    const set = new Set<AbfallFraction>();
    pickups.forEach((p) => set.add(p.fraction));
    return Array.from(set);
  }, [pickups]);

  const next = pickups[0];

  const handleToggle = async (fraction: AbfallFraction, value: boolean) => {
    setReminders((prev) => ({ ...prev, [fraction]: value }));
    try {
      if (value) {
        await enableReminder(fraction);
      } else {
        await disableReminder(fraction);
      }
    } catch (err) {
      console.warn('Abfallkalender toggle failed:', err);
      setReminders((prev) => ({ ...prev, [fraction]: !value }));
    }
  };

  const grouped = useMemo(() => {
    const out: { month: string; items: PickupRow[] }[] = [];
    let currentKey = '';
    for (const p of pickups) {
      const monthKey = p.pickup_date.slice(0, 7);
      if (monthKey !== currentKey) {
        currentKey = monthKey;
        out.push({ month: monthKey, items: [p] });
      } else {
        out[out.length - 1].items.push(p);
      }
    }
    return out;
  }, [pickups]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Abfallkalender</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Röbel an der Müritz</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : next ? (
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={[styles.heroChip, { backgroundColor: FRACTION_COLOR[next.fraction] }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>Nächste Abholung</Text>
              <Text style={[styles.heroFraction, { color: colors.textPrimary }]}>
                {FRACTION_LABEL[next.fraction]}
              </Text>
              <Text style={[styles.heroDate, { color: colors.textPrimary }]}>
                {format(parseISO(next.pickup_date), 'EEEE, d. MMMM', { locale: de })}
              </Text>
              <Text style={[styles.heroRelative, { color: colors.textSecondary }]}>
                {relativeLabel(next.pickup_date)}
                {next.starts_at ? ` · ${format(parseISO(next.starts_at), 'HH:mm', { locale: de })} Uhr` : ''}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Keine bevorstehenden Abholtermine.
            </Text>
          </View>
        )}

        {grouped.map((group) => (
          <View key={group.month} style={styles.groupBlock}>
            <Text style={[styles.groupHeader, { color: colors.textSecondary }]}>
              {format(parseISO(`${group.month}-01`), 'LLLL yyyy', { locale: de })}
            </Text>
            {group.items.map((row) => (
              <View
                key={`${row.pickup_date}_${row.fraction}`}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.dot, { backgroundColor: FRACTION_COLOR[row.fraction] }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowFraction, { color: colors.textPrimary }]}>
                    {FRACTION_LABEL[row.fraction]}
                  </Text>
                  <Text style={[styles.rowDate, { color: colors.textSecondary }]}>
                    {format(parseISO(row.pickup_date), 'EEE, d. MMMM', { locale: de })}
                    {row.starts_at ? ` · ${format(parseISO(row.starts_at), 'HH:mm', { locale: de })} Uhr` : ''}
                  </Text>
                </View>
                <Text style={[styles.rowRelative, { color: colors.textSecondary }]}>
                  {relativeLabel(row.pickup_date)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {availableFractions.length > 0 && (
          <View style={styles.remindersSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Erinnerungen</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
              Wir erinnern dich am Vorabend um 19 Uhr daran, die Tonne rauszustellen.
            </Text>
            {availableFractions.map((fraction) => (
              <View
                key={fraction}
                style={[styles.toggleRow, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.dot, { backgroundColor: FRACTION_COLOR[fraction] }]} />
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                  {FRACTION_LABEL[fraction]}
                </Text>
                <Switch
                  value={reminders[fraction]}
                  onValueChange={(v) => handleToggle(fraction, v)}
                  trackColor={{ true: colors.primary, false: isDark ? '#5f6368' : '#d1d5db' }}
                />
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={() =>
            Linking.openURL(
              'https://www.lk-mecklenburgische-seenplatte.de/Angebote/Abfall-M%C3%BCll/Abfuhrkalender/',
            )
          }
          style={styles.sourceLink}
        >
          <Text style={[styles.sourceText, { color: colors.textSecondary }]}>
            Quelle: Landkreis Mecklenburgische Seenplatte
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function relativeLabel(isoDate: string): string {
  const days = differenceInCalendarDays(parseISO(isoDate), new Date());
  if (days < 0) return 'vorbei';
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days < 7) return `in ${days} Tagen`;
  if (days < 14) return 'nächste Woche';
  return `in ${Math.round(days / 7)} Wochen`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  scrollContent: { paddingBottom: 48, paddingHorizontal: 20 },
  subtitle: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 16 },
  loadingBox: { paddingVertical: 48, alignItems: 'center' },
  heroCard: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  heroChip: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  heroLabel: { fontSize: 12, fontFamily: 'Inter-Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroFraction: { fontSize: 22, fontFamily: 'Inter-Bold', marginTop: 4 },
  heroDate: { fontSize: 15, fontFamily: 'Inter-Medium', marginTop: 4 },
  heroRelative: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular' },
  groupBlock: { marginBottom: 16 },
  groupHeader: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1 },
  rowFraction: { fontSize: 15, fontFamily: 'Inter-Medium' },
  rowDate: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  rowRelative: { fontSize: 12, fontFamily: 'Inter-Regular' },
  remindersSection: { marginTop: 16 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  sectionDesc: { fontSize: 13, fontFamily: 'Inter-Regular', marginBottom: 12, lineHeight: 18 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter-Medium' },
  sourceLink: { marginTop: 24, alignItems: 'center' },
  sourceText: { fontSize: 12, fontFamily: 'Inter-Regular', textDecorationLine: 'underline' },
});
