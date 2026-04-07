import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import ArrowRightIcon from '@/assets/icons/arrow-right.svg';
import { useTheme } from '@/context/ThemeContext';
import EmojiPicker from './EmojiPicker';

type Props = {
  onSend: (text: string) => void;
  isSending: boolean;
};

export default function ChatInput({ onSend, isSending }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  const handleSend = () => {
    if (!text.trim() || isSending) return;
    onSend(text.trim());
    setText('');
    setShowEmoji(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowEmoji(false);
  };

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <View>
      {showEmoji && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmoji(false)}
        />
      )}
      <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          style={styles.emojiButton}
          onPress={() => setShowEmoji((prev) => !prev)}
        >
          <Text style={styles.emojiIcon}>😊</Text>
        </Pressable>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (showEmoji) setShowEmoji(false);
          }}
          placeholder="Nachricht schreiben..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={5000}
          returnKeyType="default"
        />
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: colors.primary },
            !canSend && [styles.sendButtonDisabled, { backgroundColor: colors.disabled }],
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <ArrowRightIcon width={20} height={20} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
    alignItems: 'flex-end',
  },
  emojiButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiIcon: {
    fontSize: 24,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {},
});
