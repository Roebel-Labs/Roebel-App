import React, { useState, useEffect } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import StickerEmojiPicker from '@/components/pickers/StickerEmojiPicker';
import type { LootboxReward } from '@/lib/supabase-rewards';

import SendIcon from '@/assets/icons/sent.svg';
import EmojiIcon from '@/assets/icons/emoji.svg';

const MAX_COMMENT_LENGTH = 500;

type Props = {
  onSubmit: (content: string, stickerRewardId: string | null) => Promise<void>;
  isSubmitting: boolean;
  initialValue?: string;
  onCancel?: () => void;
};

export default function CommentInput({ onSubmit, isSubmitting, initialValue, onCancel }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialValue || '');
  const [showPicker, setShowPicker] = useState(false);
  const [pendingSticker, setPendingSticker] = useState<LootboxReward | null>(null);

  useEffect(() => {
    if (initialValue !== undefined) {
      setText(initialValue);
    }
  }, [initialValue]);

  const canSubmit = (text.trim().length > 0 || !!pendingSticker) && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const content = text.trim();
    const stickerId = pendingSticker?.id ?? null;
    setText('');
    setPendingSticker(null);
    setShowPicker(false);
    await onSubmit(content, stickerId);
  };

  const isEditMode = !!onCancel;

  return (
    <View>
      {showPicker && (
        <StickerEmojiPicker
          onPickEmoji={(emoji) => {
            setText((prev) => prev + emoji);
            setShowPicker(false);
          }}
          onPickSticker={(reward) => {
            setPendingSticker(reward);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {pendingSticker && (
        <View style={[styles.stickerChip, { backgroundColor: colors.surfaceSecondary }]}>
          <Image
            source={{ uri: pendingSticker.asset_url }}
            style={styles.stickerChipImage}
            contentFit="contain"
          />
          <Pressable onPress={() => setPendingSticker(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
      <View style={[styles.container, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {isEditMode && (
          <Pressable onPress={onCancel} style={styles.cancelButton} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.textTertiary} />
          </Pressable>
        )}
        {!isEditMode && (
          <Pressable
            onPress={() => setShowPicker((p) => !p)}
            style={styles.emojiButton}
            accessibilityLabel="Emoji oder Sticker öffnen"
            hitSlop={6}
          >
            <EmojiIcon width={22} height={22} color={colors.textSecondary} />
          </Pressable>
        )}
        <TextInput
          style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
          placeholder={isEditMode ? 'Kommentar bearbeiten...' : 'Kommentar schreiben...'}
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          maxLength={MAX_COMMENT_LENGTH}
          multiline
          numberOfLines={1}
          autoFocus={isEditMode}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[styles.sendButton, { backgroundColor: canSubmit ? colors.primary : colors.disabled }]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <SendIcon width={18} height={18} color={canSubmit ? colors.onPrimary : colors.disabledText} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  emojiButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  cancelButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  stickerChipImage: {
    width: 48,
    height: 48,
  },
});
