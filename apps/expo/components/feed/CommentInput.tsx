import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import StickerEmojiPicker from '@/components/pickers/StickerEmojiPicker';
import { uploadMediaFile } from '@/lib/upload-media';
import type { LootboxReward } from '@/lib/supabase-rewards';

import SendIcon from '@/assets/icons/sent.svg';
import EmojiIcon from '@/assets/icons/emoji.svg';
import ImageIcon from '@/assets/icons/image-01.svg';

const MAX_COMMENT_LENGTH = 500;
// Grow with content from one line up to this height, then scroll inside.
const INPUT_MIN_HEIGHT = 20;
const INPUT_MAX_HEIGHT = 100;

type Props = {
  onSubmit: (content: string, stickerRewardId: string | null, imageUrl: string | null) => Promise<void>;
  isSubmitting: boolean;
  initialValue?: string;
  onCancel?: () => void;
  onFocusChange?: (focused: boolean) => void;
  walletAddress?: string;
  /** When set, the input is composing a reply to this person (shows a chip). */
  replyingToName?: string | null;
  onCancelReply?: () => void;
};

export default function CommentInput({
  onSubmit,
  isSubmitting,
  initialValue,
  onCancel,
  onFocusChange,
  walletAddress,
  replyingToName,
  onCancelReply,
}: Props) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(initialValue || '');
  const [showPicker, setShowPicker] = useState(false);
  const [pendingSticker, setPendingSticker] = useState<LootboxReward | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (initialValue !== undefined) {
      setText(initialValue);
    }
  }, [initialValue]);

  // Focus the field when a reply is started.
  useEffect(() => {
    if (replyingToName) {
      inputRef.current?.focus();
    }
  }, [replyingToName]);

  const inputHeight = Math.min(Math.max(INPUT_MIN_HEIGHT, contentHeight), INPUT_MAX_HEIGHT);

  const canSubmit =
    (text.trim().length > 0 || !!pendingSticker || !!imageUrl) && !isSubmitting && !isUploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const content = text.trim();
    const stickerId = pendingSticker?.id ?? null;
    const submittedImage = imageUrl;
    setText('');
    setContentHeight(0);
    setPendingSticker(null);
    setImageUrl(null);
    setShowPicker(false);
    await onSubmit(content, stickerId, submittedImage);
  };

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false);
  };

  const handlePickImage = async () => {
    if (!walletAddress) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploading(true);
    const asset = result.assets[0];
    const url = await uploadMediaFile(
      asset.uri,
      walletAddress,
      'image',
      'comments',
      asset.mimeType || undefined,
    );
    if (url) setImageUrl(url);
    setIsUploading(false);
  };

  const isEditMode = !!onCancel;
  const showImageIcon = (isFocused || !!imageUrl) && !isEditMode && !!walletAddress;
  const placeholder = isEditMode
    ? 'Kommentar bearbeiten...'
    : replyingToName
      ? `Antwort an ${replyingToName}...`
      : 'Kommentar schreiben...';

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
      {replyingToName && (
        <View style={[styles.replyChip, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.replyChipText, { color: colors.textSecondary }]} numberOfLines={1}>
            Antwort an <Text style={{ color: colors.textPrimary }}>{replyingToName}</Text>
          </Text>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
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
      {imageUrl && (
        <View style={[styles.stickerChip, { backgroundColor: colors.surfaceSecondary }]}>
          <Image source={{ uri: imageUrl }} style={styles.previewImage} contentFit="cover" />
          <Pressable onPress={() => setImageUrl(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
      <View style={styles.container}>
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
        <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.textPrimary, height: inputHeight }]}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onContentSizeChange={(e) => setContentHeight(e.nativeEvent.contentSize.height)}
            maxLength={MAX_COMMENT_LENGTH}
            multiline
            scrollEnabled
            autoFocus={isEditMode}
          />
          {showImageIcon && (
            <Pressable
              onPress={handlePickImage}
              style={styles.imageButton}
              hitSlop={6}
              accessibilityLabel="Bild anhängen"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <ImageIcon width={22} height={22} color={colors.textSecondary} />
              )}
            </Pressable>
          )}
        </View>
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
    gap: 8,
  },
  emojiButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 38,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  imageButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  cancelButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: 6,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 8,
  },
  replyChipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  stickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  stickerChipImage: {
    width: 48,
    height: 48,
  },
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
});
