import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fontFamily } from '@/constants/theme';
import { findOrCreateConversation, sendMessage } from '@/lib/supabase-messages';
import { formatBookingWhen, sendBookingAutoReply, type BookingMessage } from '@/lib/booking';

/**
 * Success after a booking (Airbnb "reservation" style): the seller's listing as a card. "Fertig" opens the
 * DM thread with the seller, posts the booking there as the booker's own message and asks the server for
 * the seller's automatic answer.
 */
export default function BookingDankeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, variant } = useTheme();
  const { activeAccount } = useAccount();
  const p = useLocalSearchParams<{
    bookingId: string; start: string; duration: string; title: string; location?: string;
    sellerAccountId?: string; sellerName?: string; listingId?: string; listingTitle?: string; listingImage?: string;
  }>();
  const [busy, setBusy] = useState(false);

  const duration = Number(p.duration) || 30;
  const when = p.start ? formatBookingWhen(String(p.start), duration) : '';
  const first = (p.sellerName ?? '').split(' ')[0] || 'Dein Termin';
  const phone = p.location === 'outbound_call';
  const bg = variant === 'light' ? '#F8F5F1' : colors.background;

  const done = async () => {
    if (busy) return;
    const me = activeAccount?.id;
    const seller = p.sellerAccountId ? String(p.sellerAccountId) : '';
    // Not signed in (or booking yourself): nothing to post, just leave.
    if (!me || !seller || me === seller) {
      router.canGoBack() ? router.back() : router.replace('/explore' as any);
      return;
    }
    setBusy(true);
    try {
      const convo = await findOrCreateConversation(me, seller);
      if (!convo) throw new Error('no conversation');
      const msg: BookingMessage = {
        type: 'booking',
        bookingId: String(p.bookingId),
        title: String(p.title ?? 'Termin'),
        startTime: String(p.start),
        durationMin: duration,
        locationKind: p.location ? String(p.location) : null,
        ...(p.listingId ? { listingId: String(p.listingId) } : {}),
        ...(p.listingTitle ? { listingTitle: String(p.listingTitle) } : {}),
        ...(p.listingImage ? { imageUrl: String(p.listingImage) } : {}),
      };
      await sendMessage(convo.id, me, JSON.stringify(msg));
      // Fire and forget: the seller's automatic answer arrives via Realtime in the open thread.
      void sendBookingAutoReply(String(p.bookingId), convo.id);
      router.replace(`/messages/${convo.id}` as any);
    } catch {
      setBusy(false);
      router.canGoBack() ? router.back() : router.replace('/explore' as any);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top + 70, paddingBottom: insets.bottom + 16 }]}>
      <Text style={[styles.h1, { color: colors.textPrimary }]}>Dein Termin{'\n'}ist gebucht</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        {phone ? `${first} ruft dich zum Termin an.` : 'Die Bestätigung kommt per E-Mail.'}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface }, variant === 'light' ? styles.cardShadow : { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
        <View style={styles.imageWrap}>
          {p.listingImage ? (
            <Image source={{ uri: String(p.listingImage) }} style={styles.image} contentFit="cover" accessible={false} />
          ) : (
            <View style={[styles.image, { backgroundColor: colors.cardPlaceholder }]} />
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Bestätigt</Text>
          </View>
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {p.listingTitle ? String(p.listingTitle) : String(p.title ?? '')}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{when}</Text>
          <Text style={[styles.meta, styles.metaGap, { color: colors.textSecondary }]}>
            {String(p.title ?? '')}{phone ? ' · Telefon' : ''}
          </Text>
          {p.sellerName ? <Text style={[styles.meta, { color: colors.textSecondary }]}>mit {String(p.sellerName)}</Text> : null}
        </View>
      </View>

      <View style={styles.flex} />
      <Pressable onPress={done} disabled={busy} style={[styles.cta, { backgroundColor: colors.textPrimary }]} accessibilityRole="button">
        {busy ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.ctaText, { color: colors.background }]}>Fertig</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingHorizontal: 24, gap: 12 },
  flex: { flex: 1 },
  h1: { fontFamily: fontFamily.heading, fontSize: 34, lineHeight: 39, textAlign: 'center' },
  sub: { fontFamily: fontFamily.regular, fontSize: 16, textAlign: 'center' },
  card: { marginTop: 22, width: '82%', maxWidth: 320, borderRadius: 28, padding: 14, gap: 12 },
  cardShadow: { boxShadow: '0px 10px 30px rgba(0,0,0,0.08)' } as any,
  imageWrap: { borderRadius: 18, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 1.35 },
  badge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontFamily: fontFamily.semiBold, fontSize: 13, color: '#222222' },
  info: { paddingHorizontal: 4, paddingBottom: 6, gap: 3 },
  title: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 22 },
  meta: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  metaGap: { marginTop: 8 },
  cta: { width: '100%', height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
});
