import React from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { chatType, useChatTokens } from './tokens';

export type SourcesLinksProps = {
  items: { title: string; url: string }[];
  /** Lead-in text, default "Quellen: ". */
  prefix?: string;
  onLinkPress?: (url: string) => void;
  style?: StyleProp<TextStyle>;
};

/** Inline, comma-separated blue underlined links (ref 14). Render inside a bot bubble. */
export function SourcesLinks({ items, prefix = 'Quellen: ', onLinkPress, style }: SourcesLinksProps) {
  const t = useChatTokens();
  const open = (url: string) => (onLinkPress ? onLinkPress(url) : Linking.openURL(url).catch(() => {}));
  return (
    <Text style={[chatType.body, { color: t.bubbleBotText }, style]}>
      {prefix}
      {items.map((it, i) => (
        <Text key={`${it.url}-${i}`}>
          <Text
            accessibilityRole="link"
            onPress={() => open(it.url)}
            style={{ color: t.link, textDecorationLine: 'underline' }}
          >
            {it.title}
          </Text>
          {i < items.length - 1 ? ', ' : '.'}
        </Text>
      ))}
    </Text>
  );
}

export default SourcesLinks;
