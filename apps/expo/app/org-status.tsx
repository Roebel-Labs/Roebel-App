import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useActiveAccount } from 'thirdweb/react';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import type { BusinessRecord } from '@/lib/types';

const ORG_TYPE_EMOJI: Record<string, string> = {
  gastronomie: '🍽️',
  einzelhandel: '🏪',
  handwerk: '🔧',
  dienstleistung: '💼',
  gesundheit: '🏥',
  bildung: '📚',
  kultur: '🎭',
  sport: '⚽',
  tourismus: '🏖️',
  immobilien: '🏠',
  sonstiges: '🏢',
};

type TimelineStep = {
  title: string;
  subtitle: string;
  status: 'done' | 'active' | 'pending' | 'rejected';
};

function getTimelineSteps(business: BusinessRecord): TimelineStep[] {
  const createdDate = new Date(business.created_at).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  if (business.status === 'rejected') {
    return [
      { title: 'Antrag eingereicht', subtitle: createdDate, status: 'done' },
      { title: 'Abgelehnt', subtitle: business.admin_notes || 'Bitte kontaktiere die Verwaltung für Details.', status: 'rejected' },
      { title: 'Freigegeben', subtitle: 'Sichtbar in der App', status: 'pending' },
    ];
  }

  if (business.status === 'approved') {
    return [
      { title: 'Antrag eingereicht', subtitle: createdDate, status: 'done' },
      { title: 'Geprüft', subtitle: 'Von der Gemeinde genehmigt', status: 'done' },
      { title: 'Freigegeben', subtitle: 'Sichtbar in der App', status: 'done' },
    ];
  }

  // pending
  return [
    { title: 'Antrag eingereicht', subtitle: createdDate, status: 'done' },
    { title: 'In Prüfung', subtitle: 'Wird von der Gemeinde geprüft', status: 'active' },
    { title: 'Freigegeben', subtitle: 'Sichtbar in der App', status: 'pending' },
  ];
}

function TimelineItem({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const { colors } = useTheme();

  const dotStyle = (() => {
    switch (step.status) {
      case 'done':
        return { backgroundColor: colors.primary };
      case 'active':
        return { backgroundColor: colors.warningBackground, borderWidth: 2, borderColor: colors.warning };
      case 'rejected':
        return { backgroundColor: colors.errorBackground, borderWidth: 2, borderColor: colors.error };
      case 'pending':
      default:
        return { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.border };
    }
  })();

  const titleColor = (() => {
    switch (step.status) {
      case 'done': return colors.textPrimary;
      case 'active': return colors.warning;
      case 'rejected': return colors.error;
      case 'pending':
      default: return colors.textTertiary;
    }
  })();

  const subtitleColor = (() => {
    switch (step.status) {
      case 'done': return colors.textTertiary;
      case 'active': return colors.textSecondary;
      case 'rejected': return colors.error;
      case 'pending':
      default: return colors.textTertiary;
    }
  })();

  const innerDotColor = (() => {
    if (step.status === 'active') return colors.warning;
    if (step.status === 'rejected') return colors.error;
    return undefined;
  })();

  const lineColor = step.status === 'done' ? colors.primary : colors.border;

  return (
    <View style={styles.timelineRow}>
      {/* Dot + Line */}
      <View style={styles.dotCol}>
        <View style={[styles.dot, dotStyle]}>
          {step.status === 'done' && (
            <Text style={[styles.checkmark, { color: colors.onPrimary }]}>✓</Text>
          )}
          {(step.status === 'active' || step.status === 'rejected') && innerDotColor && (
            <View style={[styles.innerDot, { backgroundColor: innerDotColor }]} />
          )}
        </View>
        {!isLast && (
          <View style={[styles.line, { backgroundColor: lineColor }]} />
        )}
      </View>

      {/* Content */}
      <View style={isLast ? styles.contentLast : styles.content}>
        <Text style={[styles.stepTitle, { color: titleColor }]}>{step.title}</Text>
        <Text style={[styles.stepSubtitle, { color: subtitleColor }]}>{step.subtitle}</Text>
      </View>
    </View>
  );
}

export default function OrgStatusScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { businessId } = useLocalSearchParams<{ businessId: string }>();

  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!account?.address) { setLoading(false); return; }
      const businesses = await fetchBusinessesByOwner(account.address);
      const found = businessId
        ? businesses.find(b => b.id === businessId)
        : businesses[0];
      setBusiness(found || null);
      setLoading(false);
    }
    load();
  }, [account?.address, businessId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={[styles.centeredPadded, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Keine Organisation gefunden.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.primary }]}>Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const emoji = ORG_TYPE_EMOJI[business.category || ''] || '🏢';
  const steps = getTimelineSteps(business);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backChevronWrapper}>
            <Text style={[styles.backChevron, { color: colors.textSecondary }]}>‹</Text>
          </Pressable>
          <View style={[styles.iconBox, { backgroundColor: colors.surface }]}>
            <Text style={styles.emoji}>{emoji}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.orgName, { color: colors.textPrimary }]}>{business.name}</Text>
            <Text style={[styles.orgMeta, { color: colors.textSecondary }]}>{business.category || 'Organisation'} — Registrierungsstatus</Text>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          {steps.map((step, i) => (
            <TimelineItem key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredPadded: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 16,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
  },
  backChevronWrapper: {
    marginRight: 4,
  },
  backChevron: {
    fontSize: 24,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 18,
  },
  headerText: {
    flex: 1,
  },
  orgName: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  orgMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  timeline: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 14,
  },
  dotCol: {
    alignItems: 'center',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 12,
  },
  innerDot: {
    width: 10,
    height: 10,
    borderRadius: 9999,
  },
  line: {
    width: 2,
    height: 32,
  },
  content: {
    paddingBottom: 16,
  },
  contentLast: {},
  stepTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  stepSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
});
