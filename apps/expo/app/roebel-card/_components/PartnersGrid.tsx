import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { ApprovedPartnerDisplay } from '@/lib/supabase-roebel-card-partners';

type Props = {
  partners: ApprovedPartnerDisplay[];
  onPressPartner?: (partner: ApprovedPartnerDisplay) => void;
};

const HORIZONTAL_PADDING = 16;
const COLUMN_GAP = 8;

export default function PartnersGrid({ partners, onPressPartner }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const tileWidth =
    (width - HORIZONTAL_PADDING * 2 - COLUMN_GAP * 2) / 3;

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>
        Partner-Geschäfte
      </Text>

      {partners.length === 0 ? (
        <View
          style={[
            styles.empty,
            { backgroundColor: colors.background },
          ]}
        >
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
            Bald verfügbar
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {partners.map((partner) => (
            <PartnerTile
              key={partner.id}
              partner={partner}
              width={tileWidth}
              onPress={onPressPartner}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function PartnerTile({
  partner,
  width,
  onPress,
}: {
  partner: ApprovedPartnerDisplay;
  width: number;
  onPress?: (partner: ApprovedPartnerDisplay) => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress ? () => onPress(partner) : undefined}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          backgroundColor: colors.background,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={partner.account_name}
    >
      <View
        style={[
          styles.avatarWrap,
          { backgroundColor: colors.primaryLight },
        ]}
      >
        {partner.avatar_url ? (
          <Image
            source={{ uri: partner.avatar_url }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <Text style={[styles.avatarFallback, { color: colors.primary }]}>
            {partner.account_name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[styles.tileTitle, { color: colors.textPrimary }]}
      >
        {partner.account_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 28,
    paddingBottom: 48,
    gap: 16,
  },
  heading: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COLUMN_GAP,
  },
  tile: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
  },
  tileTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 18,
  },
  empty: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter-Regular' },
});
