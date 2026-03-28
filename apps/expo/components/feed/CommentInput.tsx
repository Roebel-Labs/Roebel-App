import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

import SendIcon from '@/assets/icons/sent.svg';

const MAX_COMMENT_LENGTH = 500;

type Props = {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting: boolean;
  initialValue?: string;
  onCancel?: () => void;
};

export default function CommentInput({ onSubmit, isSubmitting, initialValue, onCancel }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialValue || '');

  useEffect(() => {
    if (initialValue !== undefined) {
      setText(initialValue);
    }
  }, [initialValue]);

  const canSubmit = text.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const content = text.trim();
    setText('');
    await onSubmit(content);
  };

  const isEditMode = !!onCancel;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      {isEditMode && (
        <Pressable onPress={onCancel} style={styles.cancelButton} hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.textTertiary} />
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
});
