import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { Feather, Ionicons } from '@expo/vector-icons';
import EmojiIcon from '@/assets/icons/emoji.svg';
import { GlassCircleButton } from '@/components/chat/GlassCircleButton';
import { chatFont, chatSize, haloShadow, useChatTokens } from '@/components/chat/tokens';
import StickerEmojiPicker from '@/components/pickers/StickerEmojiPicker';
import type { LootboxReward } from '@/lib/supabase-rewards';

// Standard Röbel Münzen coin used across the Belohnungen screens (balance
// badge, tasks, Schatzkammer). require()'d + rendered with RN's Image so it
// paints on the first frame instead of fading in late like expo-image.
const COIN = require('@/assets/illustration/gamification/single.png');

type Props = {
  onSend: (text: string, stickerRewardId: string | null) => void;
  isSending: boolean;
  /** When set, shows the Röbel-Münzen button (XMTP-rail chats only). */
  onOpenPayment?: () => void;
};

export default function ChatInput({ onSend, isSending, onOpenPayment }: Props) {
  const t = useChatTokens();
  const [text, setText] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pendingSticker, setPendingSticker] = useState<LootboxReward | null>(null);

  const canSend = (text.trim().length > 0 || !!pendingSticker) && !isSending;

  const handleSend = () => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSend(text.trim(), pendingSticker?.id ?? null);
    setText('');
    setPendingSticker(null);
    setShowPicker(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowPicker(false);
  };

  const handleStickerSelect = (reward: LootboxReward) => {
    setPendingSticker(reward);
    setShowPicker(false);
  };

  return (
    <View>
      {showPicker && (
        <StickerEmojiPicker
          onPickEmoji={handleEmojiSelect}
          onPickSticker={handleStickerSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
      {pendingSticker && (
        <View style={[styles.stickerChip, { backgroundColor: t.surface }, haloShadow(t)]}>
          <Image
            source={{ uri: pendingSticker.asset_url }}
            style={styles.stickerChipImage}
            contentFit="contain"
          />
          <Pressable onPress={() => setPendingSticker(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={t.textTertiary} />
          </Pressable>
        </View>
      )}
      {/* Same anatomy as the Mecky composer: floating circle + white pill. */}
      <View style={styles.row}>
        <GlassCircleButton
          accessibilityLabel="Emoji oder Sticker öffnen"
          onPress={() => setShowPicker((prev) => !prev)}
        >
          <EmojiIcon width={24} height={24} color={t.icon} />
        </GlassCircleButton>
        <View style={[styles.pill, { backgroundColor: t.surface }, haloShadow(t)]}>
          <TextInput
            style={[styles.input, { color: t.textPrimary }]}
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (showPicker) setShowPicker(false);
            }}
            placeholder="Nachricht"
            placeholderTextColor={t.placeholder}
            selectionColor={t.textPrimary}
            multiline
            maxLength={5000}
            returnKeyType="default"
            accessibilityLabel="Nachricht schreiben"
          />
          {canSend || isSending ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Senden"
              style={({ pressed }) => [
                styles.round,
                { backgroundColor: t.primaryButton, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={handleSend}
              disabled={!canSend}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={t.primaryButtonText} />
              ) : (
                <Feather name="arrow-up" size={21} color={t.primaryButtonText} />
              )}
            </Pressable>
          ) : onOpenPayment ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Röbel Münzen senden"
              style={({ pressed }) => [styles.round, { opacity: pressed ? 0.7 : 1 }]}
              onPress={onOpenPayment}
            >
              <RNImage source={COIN} style={styles.coinButtonImage} resizeMode="contain" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: chatSize.controlInset,
    paddingTop: 8,
    paddingBottom: 10,
  },
  pill: {
    flex: 1,
    minHeight: chatSize.control,
    borderRadius: chatSize.control / 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  input: {
    flex: 1,
    fontFamily: chatFont.regular,
    fontSize: 17,
    lineHeight: 22,
    paddingLeft: 17,
    paddingRight: 8,
    paddingTop: 11,
    paddingBottom: 11,
    maxHeight: 140,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  coinButtonImage: {
    width: 28,
    height: 28,
  },
  stickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: chatSize.controlInset,
    marginTop: 4,
    borderRadius: 16,
    padding: 6,
    gap: 6,
  },
  stickerChipImage: {
    width: 48,
    height: 48,
  },
});
