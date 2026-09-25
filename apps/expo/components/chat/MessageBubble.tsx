import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { chatSize, chatType, useChatTokens } from './tokens';

export type MessageBubbleProps = {
  role: 'user' | 'bot';
  children: React.ReactNode;
  onLongPress?: () => void;
  onPress?: () => void;
  /** Drop the inner padding (image bubbles / cards that pad themselves). */
  bare?: boolean;
  /** Override max width (default 80% of the row, measured from refs). */
  maxWidth?: ViewStyle['maxWidth'];
  style?: StyleProp<ViewStyle>;
};

/** Bot = left light-grey #F3F3F3, user = right black; radius 22 (refs 4, 8). */
export function MessageBubble({ role, children, onLongPress, onPress, bare, maxWidth, style }: MessageBubbleProps) {
  const t = useChatTokens();
  const isUser = role === 'user';
  const content = (
    <View
      style={[
        styles.bubble,
        bare ? styles.bare : null,
        { backgroundColor: isUser ? t.bubbleUser : t.bubbleBot },
        style,
      ]}
    >
      {children}
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onLongPress();
            }
          : undefined
      }
      delayLongPress={300}
      style={[styles.wrap, { maxWidth: maxWidth ?? chatSize.bubbleMaxWidth }, isUser ? styles.right : styles.left]}
    >
      {content}
    </Pressable>
  );
}

/** Body text inside a bubble with the correct role color. */
export function BubbleText({
  role,
  children,
  style,
}: {
  role: 'user' | 'bot';
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const t = useChatTokens();
  return (
    <Text selectable={false} style={[chatType.body, { color: role === 'user' ? t.bubbleUserText : t.bubbleBotText }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  bubble: {
    borderRadius: chatSize.bubbleRadius,
    paddingHorizontal: chatSize.bubblePadH,
    paddingVertical: chatSize.bubblePadV,
    overflow: 'hidden',
  },
  bare: { paddingHorizontal: 0, paddingVertical: 0 },
});

export default MessageBubble;
