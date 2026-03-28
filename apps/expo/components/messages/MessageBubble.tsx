import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import ListingCard, { type ListingInquiry } from './ListingCard';
import type { Message } from '@/lib/supabase-messages';

type Props = {
  message: Message;
  isOwn: boolean;
  peerAvatar?: string | null;
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

export default function MessageBubble({ message, isOwn, peerAvatar }: Props) {
  const { colors } = useTheme();

  if (!message.content) return null;

  const listingData = tryParseListingInquiry(message.content);

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {/* Peer avatar (only for other's messages) */}
      {!isOwn && (
        <View style={styles.avatarSlot}>
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={styles.avatar} contentFit="cover" />
          ) : null}
        </View>
      )}

      <View style={[styles.wrapper, isOwn ? styles.wrapperOwn : styles.wrapperOther]}>
        {listingData ? (
          <>
            <ListingCard data={listingData} isOwn={isOwn} />
            <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther, { color: colors.textTertiary }]}>
              {formatTime(message.created_at)}
            </Text>
          </>
        ) : (
          <>
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
            <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther, { color: colors.textTertiary }]}>
              {formatTime(message.created_at)}
            </Text>
          </>
        )}
      </View>
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
    width: 28,
    marginRight: 4,
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
