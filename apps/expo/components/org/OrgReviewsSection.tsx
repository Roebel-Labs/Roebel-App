import React, { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { StarIcon } from '@/components/Icons';
import UserIcon from '@/assets/icons/user.svg';
import ReplyIcon from '@/assets/icons/reply.svg';
import { transformedImageUrl } from '@/lib/image-url';
import { formatRating } from '@/lib/org-profile';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { AccountComment, AccountCommentAuthor, AccountRatingSummary } from '@/lib/types';
import { STAR_GOLD } from './OrgProfileHero';

const PREVIEW_COUNT = 5;

type Props = {
  summary: AccountRatingSummary | null;
  comments: AccountComment[];
  onRate: () => void;
};

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${day} um ${time}`;
}

function Stars({ value, size }: { value: number; size: number }) {
  const { colors } = useTheme();
  const filled = Math.round(value);
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} size={size} color={i <= filled ? STAR_GOLD : colors.border} />
      ))}
    </View>
  );
}

function Avatar({ author, size }: { author?: AccountCommentAuthor | null; size: number }) {
  const { colors } = useTheme();
  const url = author?.profile_picture_url;
  return url ? (
    <Image
      source={{ uri: transformedImageUrl(url, { width: size * 3 }) ?? url }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardPlaceholder },
      ]}
    >
      <UserIcon width={size * 0.5} height={size * 0.5} color={colors.textTertiary} />
    </View>
  );
}

/** "Bewertungen": big star summary, then each comment with its replies. */
function OrgReviewsSection({ summary, comments, onRate }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const hasRating = !!summary && summary.rating_count > 0;
  const avg = summary?.avg_stars ?? 0;
  const count = summary?.rating_count ?? 0;
  const visible = expanded ? comments : comments.slice(0, PREVIEW_COUNT);

  return (
    <View>
      {hasRating ? (
        <View style={styles.summary}>
          <Stars value={avg} size={34} />
          <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
            {formatRating(avg)}{' '}
            <Text style={{ color: colors.primary, fontFamily: 'MonaSans-Regular' }}>
              ({count})
            </Text>
          </Text>
        </View>
      ) : (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Noch keine Bewertungen. Sei die erste Person, die eine abgibt.
        </Text>
      )}

      <Pressable
        onPress={onRate}
        style={({ pressed }) => [
          styles.rateButton,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
      >
        <Text style={[styles.rateButtonText, { color: colors.textPrimary }]}>Bewerten</Text>
      </Pressable>

      {visible.map((c) => (
        <View key={c.id} style={[styles.review, { borderTopColor: colors.border }]}>
          <View style={styles.authorRow}>
            <Avatar author={c.author} size={56} />
            <View style={styles.authorText}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
                {c.author?.username || 'Röbeler:in'}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                {formatReviewDate(c.created_at)}
              </Text>
            </View>
          </View>
          {c.stars != null ? <Stars value={c.stars} size={20} /> : null}
          {c.comment ? (
            <Text style={[styles.body, { color: colors.textPrimary }]}>{c.comment}</Text>
          ) : null}
          {c.replies.map((r) => (
            <View key={r.id} style={[styles.reply, { backgroundColor: colors.surface }]}>
              <View style={styles.replyHead}>
                <ReplyIcon width={20} height={20} color={colors.textSecondary} />
                <Avatar author={r.author} size={40} />
                <View style={styles.authorText}>
                  <Text style={[styles.replyName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {r.author?.username || 'Röbeler:in'}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    Antwort · {formatRelativeTimestamp(r.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.replyBody, { color: colors.textPrimary }]}>{r.content}</Text>
            </View>
          ))}
        </View>
      ))}

      {comments.length > PREVIEW_COUNT && !expanded ? (
        <Pressable
          onPress={() => setExpanded(true)}
          style={styles.moreLink}
          accessibilityRole="button"
        >
          <Text style={[styles.moreLinkText, { color: colors.primary }]}>
            Alle {comments.length} Bewertungen anzeigen
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(OrgReviewsSection);

const styles = StyleSheet.create({
  summary: {
    gap: 10,
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  summaryText: {
    fontSize: 20,
    fontFamily: 'MonaSans-SemiBold',
  },
  empty: {
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 22,
    marginBottom: 16,
  },
  rateButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  rateButtonText: {
    fontSize: 16,
    fontFamily: 'MonaSans-Medium',
  },
  review: {
    borderTopWidth: 1,
    paddingTop: 20,
    marginTop: 20,
    gap: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  authorText: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    fontSize: 18,
    fontFamily: 'MonaSans-SemiBold',
  },
  meta: {
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
  },
  body: {
    fontSize: 17,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 24,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reply: {
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  replyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  replyName: {
    fontSize: 16,
    fontFamily: 'MonaSans-SemiBold',
  },
  replyBody: {
    fontSize: 16,
    fontFamily: 'MonaSans-Regular',
    lineHeight: 22,
    paddingLeft: 32,
  },
  moreLink: {
    paddingVertical: 16,
  },
  moreLinkText: {
    fontSize: 16,
    fontFamily: 'MonaSans-Medium',
  },
});
