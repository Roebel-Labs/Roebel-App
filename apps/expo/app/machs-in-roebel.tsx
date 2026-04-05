import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

interface OptionCardProps {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: any;
}

function OptionCard({ emoji, title, subtitle, onPress, colors }: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
    >
      <Text style={styles.optionEmoji}>{emoji}</Text>
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.optionArrow, { color: colors.textSecondary }]}>›</Text>
    </Pressable>
  );
}

export default function MachsInRoebelScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mach's in Röbel</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.heroTitle}>Werde, wer du{'\n'}sein willst.</Text>
          <Text style={styles.heroSubtitle}>In Röbel.</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Was möchtest du starten?</Text>

        <View style={styles.options}>
          <OptionCard
            emoji="🏪"
            title="Gewerbe gründen"
            subtitle="Registriere dein Unternehmen in Röbel"
            onPress={() => router.push('/create-org' as any)}
            colors={colors}
          />
          <OptionCard
            emoji="🤝"
            title="Verein gründen"
            subtitle="Starte einen Sportverein, Kulturverein, oder mehr"
            onPress={() => router.push('/create-org' as any)}
            colors={colors}
          />
          <OptionCard
            emoji="🏛️"
            title="Politisch engagieren"
            subtitle="Partei oder Fraktion beitreten"
            onPress={() => router.push('/create-org' as any)}
            colors={colors}
          />
          <OptionCard
            emoji="💼"
            title="Freelancer werden"
            subtitle="Biete deine Dienste auf dem Marktplatz an"
            onPress={() => router.push('/create/marketplace' as any)}
            colors={colors}
          />
          <OptionCard
            emoji="🎨"
            title="Kreativ werden"
            subtitle="Kulturprojekte, Kunst, Musik in Röbel"
            onPress={() => router.push('/submit-event' as any)}
            colors={colors}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  content: { padding: 16, gap: 20 },
  heroCard: {
    borderRadius: 20,
    padding: 28,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    lineHeight: 34,
  },
  heroSubtitle: {
    fontSize: 22,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  options: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  optionEmoji: { fontSize: 28 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  optionSubtitle: { fontSize: 13, fontFamily: 'Inter-Regular' },
  optionArrow: { fontSize: 22 },
});
