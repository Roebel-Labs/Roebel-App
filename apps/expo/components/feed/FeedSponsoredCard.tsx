import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { BusinessDealWithBusiness } from '@/lib/types/feed';
import { incrementDealClicks, incrementDealViews } from '@/lib/supabase-deals';

type Props = {
  deal: BusinessDealWithBusiness;
  isVisible?: boolean;
};

export default function FeedSponsoredCard({ deal, isVisible }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const viewTracked = useRef(false);

  // Track impression when card becomes visible
  useEffect(() => {
    if (isVisible && !viewTracked.current) {
      viewTracked.current = true;
      incrementDealViews(deal.id).catch(() => {});
    }
  }, [isVisible, deal.id]);

  const handlePress = () => {
    incrementDealClicks(deal.id).catch(() => {});
    router.push(`/deals/${deal.id}` as any);
  };

  const businessName = deal.business?.name || 'Unternehmen';
  const businessLogo = deal.business?.logo_url;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      {/* Author row: business info */}
      <View style={styles.header}>
        {businessLogo ? (
          <Image source={{ uri: businessLogo }} style={styles.logo} contentFit="cover" />
        ) : (
          <View style={[styles.logoFallback, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.logoInitial, { color: colors.primary }]}>
              {businessName.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={[styles.businessName, { color: colors.textPrimary }]} numberOfLines={1}>
            {businessName}
          </Text>
          <Text style={[styles.sponsoredLabel, { color: colors.textTertiary }]}>Gesponsert</Text>
        </View>
        {deal.deal_value && (
          <View style={[styles.dealBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.dealBadgeText, { color: colors.primary }]}>{deal.deal_value}</Text>
          </View>
        )}
      </View>

      {/* Deal content */}
      <Text style={[styles.title, { color: colors.textPrimary }]}>{deal.title}</Text>

      {deal.description && (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {deal.description}
        </Text>
      )}

      {/* Deal image */}
      {deal.image_url && (
        <Image
          source={{ uri: deal.image_url }}
          style={styles.image}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    overflow: 'hidden' as const,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  logoFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoInitial: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  headerInfo: {
    flex: 1,
    gap: 1,
  },
  businessName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  sponsoredLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  dealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dealBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
});
