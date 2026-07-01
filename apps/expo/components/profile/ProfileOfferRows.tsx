import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import { prepareProfileOffers, formatOfferPrice } from '@/lib/profile-offers';
import type { MarketplaceListingRecord, BusinessDealRecord } from '@/lib/types';

type Props = {
  /** Active marketplace listings for this account/person (products + services). */
  listings: MarketplaceListingRecord[] | null | undefined;
  /** Open (active) deals — organisation profiles only; omit for citizens. */
  deals?: BusinessDealRecord[] | null;
  /** Header for the selling row. Defaults to "Zu verkaufen". */
  sellingTitle?: string;
};

/**
 * Horizontal "Zu verkaufen" (marketplace listings) and "Anzeigen" (open deals)
 * rows, shown above the posts on both the org (`account/[id]`) and citizen
 * (`user/[username]`) public profiles. Presentational only — the parent screen
 * fetches and scopes the data. Renders nothing when there is nothing to show.
 */
export default function ProfileOfferRows({ listings, deals, sellingTitle = 'Zu verkaufen' }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const { listings: safeListings, deals: safeDeals, hasContent } = prepareProfileOffers(
    listings,
    deals
  );
  if (!hasContent) return null;

  return (
    <>
      {safeListings.length > 0 && (
        <InlineErrorBoundary label="profile-offer-listings">
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{sellingTitle}</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
                {safeListings.length}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
            >
              {safeListings.map((listing) => (
                <Pressable
                  key={listing.id}
                  onPress={() => router.push(`/marketplace/${listing.id}` as any)}
                  style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                  accessibilityRole="button"
                  accessibilityLabel={listing.title}
                >
                  {listing.media_urls && listing.media_urls.length > 0 ? (
                    <Image
                      source={{ uri: listing.media_urls[0] }}
                      style={styles.mediaCardImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                  )}
                  <View style={styles.mediaCardBody}>
                    <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      {listing.title}
                    </Text>
                    <Text style={[styles.mediaCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {formatOfferPrice(listing.price, listing.price_type)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </InlineErrorBoundary>
      )}

      {safeDeals.length > 0 && (
        <InlineErrorBoundary label="profile-offer-deals">
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Anzeigen</Text>
              <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
                {safeDeals.length}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
            >
              {safeDeals.map((deal) => (
                <View
                  key={deal.id}
                  style={[styles.mediaCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
                >
                  {deal.image_url ? (
                    <Image source={{ uri: deal.image_url }} style={styles.mediaCardImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.mediaCardImage, { backgroundColor: colors.cardPlaceholder }]} />
                  )}
                  <View style={styles.mediaCardBody}>
                    <Text style={[styles.mediaCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      {deal.title}
                    </Text>
                    {deal.deal_value ? (
                      <Text style={[styles.mediaCardMeta, { color: colors.primary }]} numberOfLines={1}>
                        {deal.deal_value}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </InlineErrorBoundary>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    marginBottom: 8,
  },
  sectionCount: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  hList: {
    gap: 12,
    paddingRight: 16,
  },
  mediaCard: {
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaCardImage: {
    width: '100%',
    height: 110,
  },
  mediaCardBody: {
    padding: 10,
    gap: 4,
  },
  mediaCardTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  mediaCardMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
