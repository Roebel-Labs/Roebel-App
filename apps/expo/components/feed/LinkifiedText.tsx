import React from 'react';
import { Text, type StyleProp, type TextStyle, type GestureResponderEvent } from 'react-native';
import { openBrowserAsync } from 'expo-web-browser';
import { parseLinkTokens } from '@/lib/utils/linkify';

type Props = {
  /** Raw post text. URLs inside it become tappable spans. */
  content: string;
  style?: StyleProp<TextStyle>;
  /** Color for URL spans (usually colors.primary). */
  linkColor: string;
  /** Appended inline after the content (e.g. the "Mehr anzeigen" toggle). */
  children?: React.ReactNode;
};

/**
 * Renders post text with inline URLs turned into tappable links that open in
 * the in-app browser. Only URL spans carry an onPress — plain-text spans stay
 * inert, so a card that wraps this in a Pressable still navigates on a normal
 * tap while a tap on a link opens the browser instead.
 */
export default function LinkifiedText({ content, style, linkColor, children }: Props) {
  const tokens = parseLinkTokens(content);

  const openLink = (href: string) => (e: GestureResponderEvent) => {
    // Keep the tap from bubbling to an enclosing Pressable (post navigation).
    e.stopPropagation?.();
    openBrowserAsync(href).catch(() => {});
  };

  return (
    <Text style={style}>
      {tokens.map((token, i) =>
        token.type === 'url' ? (
          <Text
            key={i}
            style={{ color: linkColor }}
            onPress={openLink(token.href)}
            suppressHighlighting
          >
            {token.value}
          </Text>
        ) : (
          <Text key={i}>{token.value}</Text>
        ),
      )}
      {children}
    </Text>
  );
}
