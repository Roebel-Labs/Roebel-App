import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import MeckyResultCard from './MeckyResultCard';
import type { MeckyMessage } from '@/lib/types/mecky';

type Props = {
  message: MeckyMessage;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MeckyChatBubble({ message }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {/* Mecky avatar for assistant messages */}
      {!isUser && (
        <Image
          source={require('@/assets/illustration/mecky/welcome.png')}
          style={styles.avatar}
          contentFit="cover"
        />
      )}

      <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
        {/* Text bubble */}
        {message.content ? (
          <View
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, { backgroundColor: colors.primary }]
                : [styles.bubbleAssistant, { backgroundColor: colors.surface }],
            ]}
          >
            {isUser ? (
              <Text style={[styles.text, { color: colors.onPrimary }]}>
                {message.content}
              </Text>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
          </View>
        ) : null}

        {/* Rich cards */}
        {message.richCards && message.richCards.items.length > 0 && (
          <View style={styles.cardsGrid}>
            {message.richCards.items.map((item: any, idx: number) => (
              <MeckyResultCard
                key={item.id || item.slug || idx}
                type={message.richCards!.type}
                item={item}
              />
            ))}
          </View>
        )}

        {/* Navigation links */}
        {message.navigationLinks && message.navigationLinks.length > 0 && (
          <View style={styles.navLinks}>
            {message.navigationLinks.map((link, idx) => (
              <Pressable
                key={idx}
                style={[styles.navButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push(link.route as any)}
              >
                <Text style={[styles.navButtonText, { color: colors.onPrimary }]}>
                  {link.label} →
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Timestamp */}
        <Text
          style={[
            styles.time,
            isUser ? styles.timeUser : styles.timeAssistant,
            { color: colors.textTertiary },
          ]}
        >
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 8,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    alignSelf: 'flex-end',
  },
  wrapper: {
    maxWidth: '80%',
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },
  wrapperAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 21,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  navLinks: {
    marginTop: 8,
    gap: 6,
  },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  time: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  timeUser: {
    textAlign: 'right',
  },
  timeAssistant: {
    textAlign: 'left',
  },
});
