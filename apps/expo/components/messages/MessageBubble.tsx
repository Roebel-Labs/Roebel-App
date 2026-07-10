import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import ListingCard, { type ListingInquiry } from './ListingCard';
import PaymentBubble from './PaymentBubble';
import type { Message } from '@/lib/supabase-messages';

type Props = {
  message: Message;
  isOwn: boolean;
  peerAvatar?: string | null;
  peerFrameUrl?: string | null;
  /** Long-press opens the reaction bar (XMTP-rail chats only). */
  onLongPress?: (message: Message) => void;
  /** Toggle a reaction directly from its chip. */
  onToggleReaction?: (message: Message, emoji: string, add: boolean) => void;
  /** "Gelesen" indicator under the newest own message. */
  showRead?: boolean;
};

function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tryParseListingInquiry(content: string): ListingInquiry | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'listing_inquiry' && parsed.listingId && parsed.title) {
      return parsed as ListingInquiry;
    }
    // Also handle legacy format from old XMTP messages
    if (parsed?.type === 'product_inquiry' && parsed.listingId && parsed.title) {
      return {
        type: 'listing_inquiry',
        listingId: parsed.listingId,
        title: parsed.title,
        price: parsed.price ?? 0,
        priceType: parsed.priceType ?? 'fixed',
        imageUrl: parsed.imageUrl,
        condition: parsed.condition,
      };
    }
  } catch {
    // Not JSON — regular text message
  }
  return null;
}

export default function MessageBubble({
  message,
  isOwn,
  peerAvatar,
  peerFrameUrl,
  onLongPress,
  onToggleReaction,
  showRead,
}: Props) {
  const { colors } = useTheme();

  const hasSticker = !!message.sticker?.asset_url;
  const hasText = !!message.content && message.content.trim().length > 0;
  const hasPayment = !!message.payment;

  if (!hasSticker && !hasText && !hasPayment) return null;

  const listingData = !hasSticker && !hasPayment && hasText ? tryParseListingInquiry(message.content) : null;

  const timeLabel = showRead
    ? `${formatTime(message.created_at)} · Gelesen`
    : formatTime(message.created_at);

  const reactions = message.reactions ?? [];

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {/* Peer avatar (only for other's messages) */}
      {!isOwn && (
        <View style={styles.avatarSlot}>
          <UserAvatarWithFrame
            size={24}
            uri={peerAvatar ?? null}
            frameAssetUrl={peerFrameUrl ?? null}
          />
        </View>
      )}

      <Pressable
        style={[styles.wrapper, isOwn ? styles.wrapperOwn : styles.wrapperOther]}
        onLongPress={onLongPress ? () => onLongPress(message) : undefined}
        delayLongPress={300}
      >
        {listingData ? (
          <>
            <ListingCard data={listingData} isOwn={isOwn} />
            <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther, { color: colors.textTertiary }]}>
              {timeLabel}
            </Text>
          </>
        ) : (
          <>
            {hasPayment && <PaymentBubble payment={message.payment!} isOwn={isOwn} />}
            {!hasPayment && hasText && (
              <View
                style={[
                  styles.bubble,
                  isOwn
                    ? [styles.bubbleOwn, { backgroundColor: colors.primary }]
                    : [styles.bubbleOther, { backgroundColor: colors.surface }],
                ]}
              >
                <Text
                  style={[
                    styles.text,
                    { color: isOwn ? colors.onPrimary : colors.textPrimary },
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            )}
            {hasSticker && (
              <Image
                source={{ uri: message.sticker!.asset_url }}
                style={styles.sticker}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            )}
            {reactions.length > 0 && (
              <View style={[styles.reactionRow, isOwn ? styles.reactionRowOwn : null]}>
                {reactions.map((r) => (
                  <Pressable
                    key={r.emoji}
                    onPress={
                      onToggleReaction
                        ? () => onToggleReaction(message, r.emoji, !r.reactedByMe)
                        : undefined
                    }
                    style={[
                      styles.reactionChip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: r.reactedByMe ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    {r.count > 1 && (
                      <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                        {r.count}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther, { color: colors.textTertiary }]}>
              {timeLabel}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 8,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    width: 32,
    marginRight: 4,
    justifyContent: 'flex-end',
  },
  wrapper: {
    maxWidth: '75%',
  },
  wrapperOwn: {
    alignItems: 'flex-end',
  },
  wrapperOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  sticker: {
    width: 180,
    height: 180,
    marginTop: 2,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  reactionRowOwn: {
    justifyContent: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  time: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  timeOwn: {
    textAlign: 'right',
  },
  timeOther: {
    textAlign: 'left',
  },
});
