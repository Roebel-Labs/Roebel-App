import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAppMode } from '@/context/AppModeContext';
import type { AppMode } from '@/lib/types';

interface ModeCardProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  highlight?: boolean;
}

function ModeCard({ emoji, title, subtitle, onPress, highlight }: ModeCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.borderSecondary },
        highlight && { borderColor: colors.primary, borderWidth: 2 },
      ]}
    >
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
    </Pressable>
  );
}

interface CTABannerProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function CTABanner({ emoji, title, subtitle, onPress }: CTABannerProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.ctaBanner, { backgroundColor: colors.primary }]}
    >
      <Text style={styles.ctaEmoji}>{emoji}</Text>
      <View style={styles.ctaTextContainer}>
        <Text style={styles.ctaTitle}>{title}</Text>
        <Text style={styles.ctaSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function ProfileModeCards() {
  const router = useRouter();
  const { activeMode } = useAppMode();

  return (
    <View style={styles.container}>
      {activeMode === 'tourist' && <TouristCards router={router} />}
      {activeMode === 'citizen' && <CitizenCards router={router} />}
      {activeMode === 'org' && <OrgCards router={router} />}
    </View>
  );
}

function TouristCards({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <>
      <View style={styles.cardsRow}>
        <ModeCard
          emoji="🎴"
          title="Röbel Card"
          subtitle="Punkte & Stempel"
          onPress={() => router.push('/wallet' as any)}
        />
        <ModeCard
          emoji="🧭"
          title="Entdeckungen"
          subtitle="Erkunde Röbel"
          onPress={() => router.push('/(tabs)/explore' as any)}
        />
      </View>
      <CTABanner
        emoji="🏛️"
        title="Bürger werden"
        subtitle="Werde Teil der Röbel Community"
        onPress={() => router.push('/verification/request-citizen' as any)}
      />
    </>
  );
}

function CitizenCards({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={styles.cardsRow}>
      <ModeCard
        emoji="🎴"
        title="Röbel Card"
        subtitle="Punkte & Badges"
        onPress={() => router.push('/wallet' as any)}
      />
      <ModeCard
        emoji="🗳️"
        title="Rathaus"
        subtitle="Abstimmungen"
        onPress={() => router.push('/governance' as any)}
        highlight
      />
    </View>
  );
}

function OrgCards({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={styles.cardsRow}>
      <ModeCard
        emoji="📊"
        title="Dashboard"
        subtitle="Statistiken"
        onPress={() => router.push('/business/dashboard' as any)}
      />
      <ModeCard
        emoji="⚙️"
        title="Verwalten"
        subtitle="Deals & Events"
        onPress={() => router.push('/business/dashboard' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  cardEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  ctaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  ctaEmoji: {
    fontSize: 28,
  },
  ctaTextContainer: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  ctaSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
});
