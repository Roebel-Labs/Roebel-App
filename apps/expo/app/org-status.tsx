import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
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
  const dotStyles = {
    done: 'bg-primary',
    active: 'bg-amber-50 dark:bg-amber-950 border-2 border-amber-600 dark:border-amber-400',
    pending: 'border-2 border-border bg-background',
    rejected: 'bg-red-50 dark:bg-red-950 border-2 border-red-600 dark:border-red-400',
  };

  const titleStyles = {
    done: 'text-text-primary',
    active: 'text-amber-700 dark:text-amber-300',
    pending: 'text-text-tertiary',
    rejected: 'text-red-700 dark:text-red-300',
  };

  const subtitleStyles = {
    done: 'text-text-tertiary',
    active: 'text-text-secondary',
    pending: 'text-text-tertiary',
    rejected: 'text-red-600 dark:text-red-400',
  };

  return (
    <View className="flex-row gap-3.5">
      {/* Dot + Line */}
      <View className="items-center">
        <View className={`w-7 h-7 rounded-full items-center justify-center ${dotStyles[step.status]}`}>
          {step.status === 'done' && <Text className="text-on-primary text-xs">✓</Text>}
          {step.status === 'active' && <View className="w-2.5 h-2.5 rounded-full bg-amber-600 dark:bg-amber-400" />}
          {step.status === 'rejected' && <View className="w-2.5 h-2.5 rounded-full bg-red-600 dark:bg-red-400" />}
        </View>
        {!isLast && (
          <View className={`w-0.5 h-8 ${step.status === 'done' ? 'bg-primary' : 'bg-border'}`} />
        )}
      </View>

      {/* Content */}
      <View className={isLast ? '' : 'pb-4'}>
        <Text className={`text-sm font-inter-semibold ${titleStyles[step.status]}`}>{step.title}</Text>
        <Text className={`text-xs font-inter-regular mt-0.5 ${subtitleStyles[step.status]}`}>{step.subtitle}</Text>
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
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-base font-inter-regular text-text-secondary text-center">Keine Organisation gefunden.</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-base font-inter-medium text-primary">Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const emoji = ORG_TYPE_EMOJI[business.category || ''] || '🏢';
  const steps = getTimelineSteps(business);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center gap-3 px-6 pt-4 pb-6 border-b border-border">
          <Pressable onPress={() => router.back()} className="mr-1">
            <Text className="text-2xl text-text-secondary">‹</Text>
          </Pressable>
          <View className="w-11 h-11 rounded-xl bg-surface items-center justify-center">
            <Text className="text-xl">{emoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-inter-bold text-text-primary">{business.name}</Text>
            <Text className="text-xs font-inter-regular text-text-secondary">{business.category || 'Organisation'} — Registrierungsstatus</Text>
          </View>
        </View>

        {/* Timeline */}
        <View className="px-6 pt-6">
          {steps.map((step, i) => (
            <TimelineItem key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
