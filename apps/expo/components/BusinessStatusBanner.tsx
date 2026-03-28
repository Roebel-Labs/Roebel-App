import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { BusinessRecord } from '@/lib/types';

type Props = {
  business: BusinessRecord;
  onRetry?: () => void;
};

export default function BusinessStatusBanner({ business, onRetry }: Props) {
  const { colors, isDark } = useTheme();

  if (business.status === 'approved') {
    return (
      <View style={[styles.banner, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5' }]}>
        <Text style={[styles.bannerText, { color: isDark ? '#6EE7B7' : '#065F46' }]}>
          Unternehmen aktiv
        </Text>
      </View>
    );
  }

  if (business.status === 'pending') {
    return (
      <View style={[styles.banner, { backgroundColor: isDark ? '#78350F' : '#FEF3C7' }]}>
        <Text style={[styles.bannerText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
          Antrag wird geprüft
        </Text>
        <Text style={[styles.bannerSubtext, { color: isDark ? '#D97706' : '#B45309' }]}>
          Ihr Unternehmensprofil wird von der Verwaltung geprüft.
        </Text>
      </View>
    );
  }

  // Rejected
  return (
    <View style={[styles.banner, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' }]}>
      <Text style={[styles.bannerText, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>
        Antrag abgelehnt
      </Text>
      {business.admin_notes && (
        <Text style={[styles.bannerSubtext, { color: isDark ? '#F87171' : '#B91C1C' }]}>
          {business.admin_notes}
        </Text>
      )}
      {onRetry && (
        <Pressable style={[styles.retryButton, { borderColor: isDark ? '#FCA5A5' : '#991B1B' }]} onPress={onRetry}>
          <Text style={[styles.retryText, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>Erneut beantragen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  bannerText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  bannerSubtext: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
