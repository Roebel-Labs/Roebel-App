import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGoBack } from '@/hooks/useGoBack';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fetchDealById, incrementDealViews } from '@/lib/supabase-deals';
import MeckyNotFound from '@/components/MeckyNotFound';
import { fetchBusinessBySlug } from '@/lib/supabase-businesses';
import { DEAL_TYPE_LABELS, BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import StarIcon from '@/assets/icons/star.svg';
import type { BusinessDealRecord, BusinessRecord } from '@/lib/types';

export default function DealDetailScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [deal, setDeal] = useState<BusinessDealRecord | null>(null);
  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadDeal();
  }, [id]);

  const loadDeal = async () => {
    try {
      setLoading(true);
      const data = await fetchDealById(id!);
      setDeal(data);

      // Track view
      incrementDealViews(id!);

      // Load business info if deal has business_id
      if (data?.business_id) {
        // Fetch business by id - we need to query directly
        const { data: bizData } = await (await import('@/lib/supabase')).supabase
          .from('businesses')
          .select('*')
          .eq('id', data.business_id)
          .single();
        if (bizData) setBusiness(bizData as BusinessRecord);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!deal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <MeckyNotFound title="Angebot nicht gefunden" />
      </SafeAreaView>
    );
  }

  const dealTypeLabel = DEAL_TYPE_LABELS[deal.deal_type] || deal.deal_type;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Hero Image */}
        {deal.image_url ? (
          <View style={styles.heroContainer}>
            <Image
              source={{ uri: deal.image_url }}
              style={styles.heroImage}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
            {deal.deal_value && (
              <View style={[styles.dealValueBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.dealValueText}>{deal.deal_value}</Text>
              </View>
            )}
            {deal.is_boosted && (
              <View style={[styles.boostedBadge, { backgroundColor: '#FFA500' }]}>
                <StarIcon width={14} height={14} color="#fff" />
              </View>
            )}
          </View>
        ) : deal.deal_value ? (
          <View style={[styles.dealValueBanner, { backgroundColor: colors.primary }]}>
            <Text style={styles.dealValueBannerText}>{deal.deal_value}</Text>
          </View>
        ) : null}

        {/* Content */}
        <View style={styles.content}>
          <View style={[styles.typeBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.typeBadgeText, { color: colors.textSecondary }]}>{dealTypeLabel}</Text>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{deal.title}</Text>

          {deal.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{deal.description}</Text>
          )}

          {(deal.start_date || deal.end_date) && (
            <View style={[styles.dateRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>Gültig:</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>
                {deal.start_date && deal.end_date
                  ? `${deal.start_date} – ${deal.end_date}`
                  : deal.start_date
                    ? `Ab ${deal.start_date}`
                    : `Bis ${deal.end_date}`}
              </Text>
            </View>
          )}

          {/* Business Card */}
          {business && (
            <Pressable
              onPress={() => router.push(`/business/${business.slug}` as any)}
              style={[styles.businessCard, { backgroundColor: colors.surface }]}
            >
              {business.logo_url && (
                <Image
                  source={{ uri: business.logo_url }}
                  style={styles.businessLogo}
                  contentFit="cover"
                />
              )}
              <View style={styles.businessInfo}>
                <Text style={[styles.businessName, { color: colors.textPrimary }]}>{business.name}</Text>
                <Text style={[styles.businessCategory, { color: colors.textSecondary }]}>
                  {BUSINESS_CATEGORY_LABELS[business.category] || 'Unternehmen'}
                </Text>
              </View>
              <ChevronLeftIcon
                width={20}
                height={20}
                color={colors.textTertiary}
                style={{ transform: [{ rotate: '180deg' }] }}
              />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  heroContainer: {
    width: '100%',
    height: 240,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  dealValueBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dealValueText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  boostedBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dealValueBanner: {
    marginHorizontal: 16,
    paddingVertical: 20,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dealValueBannerText: {
    color: '#ffffff',
    fontSize: 28,
    fontFamily: 'Inter-SemiBold',
  },
  content: {
    padding: 16,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  typeBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 30,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  dateLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  dateValue: {
    fontSize: 14,
  },
  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
    marginTop: 8,
  },
  businessLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  businessCategory: {
    fontSize: 13,
  },
});
