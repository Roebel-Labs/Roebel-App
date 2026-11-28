import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { openListing } from '@/lib/navigation/openDetail';
import { formatBookingWhen, type BookingMessage } from '@/lib/booking';

/** A booking posted into the DM thread by the booker (JSON content `{ type: 'booking', … }`). */
export default function BookingCard({ data }: { data: BookingMessage; isOwn: boolean }) {
  const { colors } = useTheme();
  const when = formatBookingWhen(data.startTime, data.durationMin || 30);
  return (
    <Pressable
      onPress={data.listingId ? () => openListing({ id: data.listingId! }) : undefined}
      disabled={!data.listingId}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole={data.listingId ? 'button' : undefined}
      accessibilityLabel={`Termin gebucht: ${data.title}, ${when}`}
    >
      {data.imageUrl ? <Image source={{ uri: data.imageUrl }} style={styles.image} contentFit="cover" accessible={false} /> : null}
      <View style={styles.body}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>TERMIN GEBUCHT</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{data.title}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>{when}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {data.locationKind === 'outbound_call' ? 'Telefon' : 'Termin'} · {data.durationMin || 30} Min.
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 260, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  image: { width: '100%', height: 116 },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 3 },
  eyebrow: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 0.4 },
  title: { fontFamily: fontFamily.bold, fontSize: 15 },
  meta: { fontFamily: fontFamily.regular, fontSize: 13 },
});
