/**
 * Bewertungen on a Marktplatz listing (Airbnb-style):
 *  - section: "★ 4,8 · 3 Bewertungen" (or just the count when nobody gave
 *    stars), a horizontal rail of review cards, "Alle Bewertungen anzeigen";
 *    rendered only when at least one review exists.
 *  - all-reviews sheet and write sheet are BottomDrawers, so the page behind
 *    them gets the SheetStage depth effect (scale + growing corner radius).
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInDays, format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import BottomDrawer from '@/components/BottomDrawer';
import { StarIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import {
  averageStars,
  fetchListingReviews,
  listingReviewsQueryKey,
  reviewAuthorName,
  upsertListingReview,
  type ListingReview,
} from '@/lib/supabase-listing-reviews';

const STAR = '#222222';
const STAR_DARK = '#FFFFFF';
const AVATAR = 44;
const MAX_LENGTH = 1000;

function reviewDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (differenceInDays(new Date(), d) < 30) return formatDistanceToNow(d, { locale: de, addSuffix: true });
    return format(d, 'MMMM yyyy', { locale: de });
  } catch {
    return '';
  }
}

function formatAverage(avg: number): string {
  return avg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function countLabel(n: number): string {
  return n === 1 ? '1 Bewertung' : `${n} Bewertungen`;
}

export function useListingReviews(listingId: string | undefined) {
  return useQuery({
    queryKey: listingReviewsQueryKey(listingId ?? ''),
    queryFn: () => fetchListingReviews(listingId!),
    enabled: !!listingId,
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* Section on the detail page                                          */
/* ------------------------------------------------------------------ */

type SectionProps = {
  listingId: string;
  /** Horizontal page padding the rail should bleed through. */
  side: number;
  /** Shows "Bewertung schreiben" (hidden on your own listing). */
  canWrite: boolean;
  onWrite: () => void;
  /** Rendered above the section (e.g. a divider) — only when it shows. */
  before?: React.ReactNode;
};

export function ListingReviewsSection({ listingId, side, canWrite, onWrite, before }: SectionProps) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const { data: reviews = [] } = useListingReviews(listingId);
  const [allOpen, setAllOpen] = useState(false);

  const avg = useMemo(() => averageStars(reviews), [reviews]);
  const openAll = useCallback(() => setAllOpen(true), []);

  if (reviews.length === 0) return null;

  const cardWidth = Math.round(width * 0.78);
  const starColor = isDark ? STAR_DARK : STAR;

  return (
    <>
      {before}
      <View style={{ paddingHorizontal: side }}>
        <View style={styles.heading}>
          {avg != null ? <StarIcon size={20} color={starColor} /> : null}
          <Text style={[styles.headingText, { color: colors.textPrimary }]}>
            {avg != null ? `${formatAverage(avg)} · ` : ''}
            {countLabel(reviews.length)}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: side }}
        decelerationRate="fast"
        snapToInterval={cardWidth + 1}
        snapToAlignment="start"
      >
        {reviews.slice(0, 8).map((r, i) => (
          <View key={r.id} style={styles.railItem}>
            <ReviewCard review={r} width={cardWidth} clamp={4} onMore={openAll} />
            {i < Math.min(reviews.length, 8) - 1 ? (
              <View style={[styles.railDivider, { backgroundColor: colors.border }]} />
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: side }}>
        <Pressable
          onPress={openAll}
          style={({ pressed }) => [styles.greyButton, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={[styles.greyButtonText, { color: colors.textPrimary }]}>
            {reviews.length > 1 ? `Alle ${reviews.length} Bewertungen anzeigen` : 'Bewertung anzeigen'}
          </Text>
        </Pressable>
        {canWrite ? (
          <Pressable onPress={onWrite} hitSlop={8} style={styles.writeLink} accessibilityRole="button">
            <Text style={[styles.writeLinkText, { color: colors.textPrimary }]}>Bewertung schreiben</Text>
          </Pressable>
        ) : null}
      </View>

      <AllReviewsSheet
        visible={allOpen}
        reviews={reviews}
        avg={avg}
        canWrite={canWrite}
        onWrite={() => {
          setAllOpen(false);
          onWrite();
        }}
        onClose={() => setAllOpen(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One review                                                          */
/* ------------------------------------------------------------------ */

const ReviewCard = memo(function ReviewCard({
  review,
  width,
  clamp,
  onMore,
}: {
  review: ListingReview;
  width?: number;
  clamp?: number;
  onMore?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const name = reviewAuthorName(review);
  const avatar = review.author?.profile_picture_url ?? null;
  const sub = review.is_ai ? 'KI-Assistent' : review.author?.is_verified_citizen ? 'Verifiziert in Röbel' : 'Röbel-App';
  const long = clamp != null && review.content.length > 140;
  const starColor = isDark ? STAR_DARK : STAR;

  return (
    <View style={width ? { width } : undefined}>
      <View style={styles.authorRow}>
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={avatar}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>{(name[0] || '?').toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.authorText}>
          <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.authorSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {review.stars ? (
          <>
            <View style={styles.stars}>
              {Array.from({ length: 5 }, (_, i) => (
                <StarIcon key={i} size={11} color={i < (review.stars ?? 0) ? starColor : colors.border} />
              ))}
            </View>
            <Text style={[styles.metaText, { color: colors.textPrimary }]}> · </Text>
          </>
        ) : null}
        <Text style={[styles.metaText, { color: colors.textPrimary }]}>{reviewDate(review.created_at)}</Text>
      </View>

      <Text style={[styles.body, { color: colors.textPrimary }]} numberOfLines={clamp}>
        {review.content}
      </Text>
      {long && onMore ? (
        <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.moreLink, { color: colors.textPrimary }]}>Mehr anzeigen</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* All reviews                                                         */
/* ------------------------------------------------------------------ */

function AllReviewsSheet({
  visible,
  reviews,
  avg,
  canWrite,
  onWrite,
  onClose,
}: {
  visible: boolean;
  reviews: ListingReview[];
  avg: number | null;
  canWrite: boolean;
  onWrite: () => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: ListingReview }) => (
      <View style={[styles.sheetItem, { borderBottomColor: colors.border }]}>
        <ReviewCard review={item} />
      </View>
    ),
    [colors.border],
  );

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.88}>
      <FlatList
        data={reviews}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={7}
        ListHeaderComponent={
          <View style={styles.sheetHeader}>
            {avg != null ? (
              <View style={styles.sheetAvgRow}>
                <StarIcon size={30} color={isDark ? STAR_DARK : STAR} />
                <Text style={[styles.sheetAvg, { color: colors.textPrimary }]}>{formatAverage(avg)}</Text>
              </View>
            ) : null}
            <View style={styles.sheetCountRow}>
              <Text style={[styles.sheetCount, { color: colors.textPrimary }]}>{countLabel(reviews.length)}</Text>
              {canWrite ? (
                <Pressable
                  onPress={onWrite}
                  style={({ pressed }) => [styles.outlineButton, { borderColor: colors.border }, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.outlineButtonText, { color: colors.textPrimary }]}>Bewerten</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
      />
    </BottomDrawer>
  );
}

/* ------------------------------------------------------------------ */
/* Write / edit your review                                            */
/* ------------------------------------------------------------------ */

export function WriteReviewSheet({
  visible,
  listingId,
  onClose,
}: {
  visible: boolean;
  listingId: string;
  onClose: () => void;
}) {
  // BottomDrawer mounts its children only while open, so the form starts
  // fresh (prefilled with your existing review) on every open.
  return (
    <BottomDrawer visible={visible} onClose={onClose} keyboardAware>
      <WriteReviewForm listingId={listingId} onDone={onClose} />
    </BottomDrawer>
  );
}

function WriteReviewForm({ listingId, onDone }: { listingId: string; onDone: () => void }) {
  const { colors, isDark } = useTheme();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: reviews = [] } = useListingReviews(listingId);
  const wallet = user?.wallet_address ?? null;
  const mine = wallet ? reviews.find((r) => r.wallet_address.toLowerCase() === wallet.toLowerCase()) : undefined;

  const [stars, setStars] = useState<number | null>(mine?.stars ?? null);
  const [text, setText] = useState(mine?.content ?? '');
  const [saving, setSaving] = useState(false);

  const canSubmit = text.trim().length > 0 && !saving;

  const submit = async () => {
    if (!wallet) {
      Alert.alert('Anmelden', 'Bitte melde dich an, um eine Bewertung zu schreiben.');
      return;
    }
    if (!canSubmit) return;
    setSaving(true);
    try {
      const saved = await upsertListingReview({ listing_id: listingId, wallet_address: wallet, stars, content: text });
      queryClient.setQueryData<ListingReview[]>(listingReviewsQueryKey(listingId), (prev = []) => [
        saved,
        ...prev.filter((r) => r.id !== saved.id),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone();
    } catch (e) {
      console.error('Error saving listing review:', e);
      Alert.alert('Fehler', 'Deine Bewertung konnte gerade nicht gespeichert werden. Bitte versuch es später noch einmal.');
    } finally {
      setSaving(false);
    }
  };

  const starColor = isDark ? STAR_DARK : STAR;

  return (
    <>
      <Text style={[styles.writeTitle, { color: colors.textPrimary }]}>
        {mine ? 'Bewertung bearbeiten' : 'Bewertung schreiben'}
      </Text>
      <Text style={[styles.writeHint, { color: colors.textSecondary }]}>
        Sterne sind freiwillig. Dein Name und Profilbild sind für alle sichtbar.
      </Text>

      <View style={styles.starPicker} accessibilityLabel="Sterne vergeben">
        {Array.from({ length: 5 }, (_, i) => {
          const value = i + 1;
          const on = stars != null && value <= stars;
          return (
            <Pressable
              key={value}
              hitSlop={6}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setStars((s) => (s === value ? null : value));
              }}
              accessibilityRole="button"
              accessibilityLabel={`${value} ${value === 1 ? 'Stern' : 'Sterne'}`}
              accessibilityState={{ selected: on }}
            >
              <StarIcon size={34} color={on ? starColor : colors.border} />
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Was möchtest du anderen mitgeben?"
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={MAX_LENGTH}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
        textAlignVertical="top"
      />
      <Text style={[styles.counter, { color: colors.textTertiary }]}>
        {text.length}/{MAX_LENGTH}
      </Text>

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.4 },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.submitText, { color: colors.onPrimary }]}>Veröffentlichen</Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  headingText: { fontSize: 22, fontFamily: fontFamily.heading },
  railItem: { flexDirection: 'row' },
  railDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 20, alignSelf: 'stretch' },
  greyButton: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  greyButtonText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  writeLink: { alignSelf: 'center', marginTop: 16 },
  writeLinkText: { fontSize: 15, fontFamily: fontFamily.medium, textDecorationLine: 'underline' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 16, fontFamily: fontFamily.semiBold },
  authorText: { flex: 1 },
  authorName: { fontSize: 16, fontFamily: fontFamily.semiBold },
  authorSub: { fontSize: 14, fontFamily: fontFamily.regular, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  stars: { flexDirection: 'row', gap: 1 },
  metaText: { fontSize: 13, fontFamily: fontFamily.medium },
  body: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 22, marginTop: 6 },
  moreLink: { fontSize: 15, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline', marginTop: 8 },
  sheetHeader: { paddingBottom: 8 },
  sheetAvgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sheetAvg: { fontSize: 40, fontFamily: fontFamily.heading },
  sheetCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetCount: { fontSize: 22, fontFamily: fontFamily.heading },
  outlineButton: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  outlineButtonText: { fontSize: 14, fontFamily: fontFamily.semiBold },
  sheetItem: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  writeTitle: { fontSize: 20, fontFamily: fontFamily.heading },
  writeHint: { fontSize: 14, fontFamily: fontFamily.regular, marginTop: 4 },
  starPicker: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 16 },
  input: {
    minHeight: 120,
    maxHeight: 220,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontFamily: fontFamily.regular,
  },
  counter: { fontSize: 12, fontFamily: fontFamily.regular, alignSelf: 'flex-end', marginTop: 6 },
  submit: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  submitText: { fontSize: 17, fontFamily: fontFamily.semiBold },
});
