import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { openBrowserAsync } from 'expo-web-browser';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import type { PostLinkRecord } from '@/lib/types/feed';

type Props = {
  link: PostLinkRecord;
};

export default function PostLinkPreview({ link }: Props) {
  const { colors } = useTheme();

  const handlePress = () => {
    openBrowserAsync(link.url).catch(() => {});
  };

  const hostname = (() => {
    try {
      return new URL(link.url).hostname.replace('www.', '');
    } catch {
      return link.og_site_name || '';
    }
  })();

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.surface },
        pressed && { opacity: 0.8 },
      ]}
    >
      {link.og_image && (
        <Image
          source={{ uri: link.og_image }}
          style={styles.image}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={styles.content}>
        {hostname ? (
          <Text style={[styles.siteName, { color: colors.textTertiary }]} numberOfLines={1}>
            {link.og_site_name || hostname}
          </Text>
        ) : null}
        {link.og_title && (
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {link.og_title}
          </Text>
        )}
        {link.og_description && (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {link.og_description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 160,
  },
  content: {
    padding: 12,
    gap: 4,
  },
  siteName: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
});
