import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const EMOJI_ROWS = [
  ['😀', '😂', '🥹', '😍', '🤩', '😘', '😊', '🙂'],
  ['😅', '🤣', '😭', '🥺', '😤', '😱', '🤔', '😏'],
  ['👍', '👎', '👏', '🙌', '🤝', '💪', '✌️', '🤞'],
  ['❤️', '🔥', '⭐', '🎉', '💯', '✅', '👀', '🙏'],
  ['😴', '🤮', '💀', '🤡', '👻', '🎊', '💐', '🏠'],
];

type Props = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={(e) => e.stopPropagation()}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {EMOJI_ROWS.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.row}>
              {row.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={({ pressed }) => [
                    styles.emojiButton,
                    pressed && { backgroundColor: colors.pressedOverlay },
                  ]}
                  onPress={() => onSelect(emoji)}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  },
  container: {
    position: 'absolute',
    bottom: 70,
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    maxHeight: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  emojiButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  emoji: {
    fontSize: 24,
  },
});
