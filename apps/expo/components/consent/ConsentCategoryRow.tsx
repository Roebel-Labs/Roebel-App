import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { CustomToggle } from './CustomToggle';
import type { ConsentCategory } from '@/constants/consent';

type Props = {
  category: ConsentCategory;
  value: boolean;
  onChange: (next: boolean) => void;
  showDetailLink?: boolean;
};

export function ConsentCategoryRow({ category, value, onChange, showDetailLink = true }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const processorsLabel = category.processors
    .map((p) => `${p.name} · ${regionLabel(p.region)}`)
    .join(' · ');

  return (
    <View
      style={[
        styles.container,
        { borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.textColumn}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{category.title}</Text>
            {category.isLocked && (
              <Text style={[styles.lockBadge, { color: colors.textTertiary, borderColor: colors.border }]}>
                erforderlich
              </Text>
            )}
          </View>
          <Text style={[styles.purpose, { color: colors.textSecondary }]}>
            {category.oneLineDe}
          </Text>
        </View>
        <CustomToggle value={value} onChange={onChange} disabled={category.isLocked} />
      </View>

      <Text style={[styles.meta, { color: colors.textTertiary }]}>
        {processorsLabel} · {category.retention}
      </Text>

      {showDetailLink && (
        <Pressable
          onPress={() => router.push(`/settings/consent/${category.id}` as any)}
          style={({ pressed }) => [styles.learnMore, pressed && { opacity: 0.5 }]}
          accessibilityRole="link"
        >
          <Text style={[styles.learnMoreText, { color: colors.link }]}>Mehr erfahren ›</Text>
        </Pressable>
      )}
    </View>
  );
}

function regionLabel(region: 'EU' | 'USA' | 'Multi' | 'Device'): string {
  switch (region) {
    case 'EU':
      return 'EU';
    case 'USA':
      return 'USA';
    case 'Device':
      return 'Gerät';
    case 'Multi':
    default:
      return 'Mehrere Regionen';
  }
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  lockBadge: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  purpose: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  learnMore: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  learnMoreText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
