import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { getOrgFeatures } from '@/lib/org-features';
import type { OrgSubType } from '@/lib/types';

interface ModeCardProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  highlight?: boolean;
}

function ModeCard({ emoji, title, subtitle, onPress, highlight }: ModeCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.surface },
        Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 6,
          },
          android: { elevation: 3 },
        }),
        highlight && { borderColor: colors.primary, borderWidth: 2 },
      ]}
    >
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
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
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.ctaBanner,
        { backgroundColor: colors.surface },
        Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 6,
          },
          android: { elevation: 3 },
        }),
      ]}
    >
      <Text style={styles.ctaEmoji}>{emoji}</Text>
      <View style={styles.ctaTextContainer}>
        <Text style={[styles.ctaTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.ctaSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function ProfileModeCards() {
  const router = useRouter();
  const { tier, isCitizen } = useUser();
  const { activeAccount } = useAccount();
  const isOrg = activeAccount?.account_type === 'organisation';

  return (
    <View style={styles.container}>
      {(tier === 'tourist' || tier === 'guest') && !isOrg && <TouristCards router={router} />}
      {isCitizen && !isOrg && <CitizenCards router={router} />}
      {isOrg && <OrgCards router={router} />}
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
    <>
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
      <CTABanner
        emoji="🚀"
        title="Mach's in Röbel"
        subtitle="Gewerbe, Verein, Partei, Freelancer..."
        onPress={() => router.push('/create-org' as any)}
      />
    </>
  );
}

function OrgCards({ router }: { router: ReturnType<typeof useRouter> }) {
  const { activeAccount } = useAccount();
  const subType = activeAccount?.sub_type;

  if (!subType) return null;

  const features = getOrgFeatures(subType);
  const rows: typeof features[] = [];
  for (let i = 0; i < features.length; i += 2) {
    rows.push(features.slice(i, i + 2));
  }

  return (
    <>
      {rows.map((row, index) => (
        <View key={index} style={styles.cardsRow}>
          {row.map((feature) => (
            <ModeCard
              key={feature.id}
              emoji={feature.emoji}
              title={feature.title}
              subtitle={feature.subtitle}
              onPress={() => router.push(feature.route as any)}
              highlight={feature.highlight}
            />
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
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
  },
  ctaSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
});
