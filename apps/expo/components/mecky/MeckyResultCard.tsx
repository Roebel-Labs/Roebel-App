import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { RichCardData } from '@/lib/types/mecky';

function getRouteForItem(type: RichCardData['type'], item: any): string {
  switch (type) {
    case 'events':
      return `/event/${item.id}`;
    case 'restaurants':
      return `/restaurant/${item.slug}`;
    case 'marketplace':
      return `/marketplace/${item.id}`;
    case 'news':
      return `/news/${item.slug}`;
    case 'movies':
      return `/movies/${item.id}`;
    case 'businesses':
      return `/business/${item.slug}`;
    case 'deals':
      return `/deals/${item.id}`;
    default:
      return '/';
  }
}

function getImageUrl(type: RichCardData['type'], item: any): string | null {
  switch (type) {
    case 'events':
      return item.image_url;
    case 'restaurants':
      return item.logo_url;
    case 'marketplace':
      return item.image_url;
    case 'news':
      return item.cover_image_url;
    case 'movies':
      return item.cover_image_url;
    case 'businesses':
      return item.logo_url;
    case 'deals':
      return item.image_url;
    default:
      return null;
  }
}

function getTitle(item: any): string {
  return item.title || item.name || 'Unbekannt';
}

function getSubtitle(type: RichCardData['type'], item: any): string {
  switch (type) {
    case 'events':
      return [item.date, item.time?.slice(0, 5), item.location].filter(Boolean).join(' · ');
    case 'restaurants':
      return item.address || '';
    case 'marketplace': {
      if (item.price_type === 'free') return 'Gratis';
      return `${item.price?.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`;
    }
    case 'news':
      return item.published_at
        ? new Date(item.published_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
        : '';
    case 'movies':
      return [item.date, item.time?.slice(0, 5), item.fsk].filter(Boolean).join(' · ');
    case 'businesses':
      return [item.category, item.address].filter(Boolean).join(' · ');
    case 'deals':
      return item.deal_value || item.deal_type || '';
    default:
      return '';
  }
}

type Props = {
  type: RichCardData['type'];
  item: any;
};

export default function MeckyResultCard({ type, item }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const imageUrl = getImageUrl(type, item);
  const route = getRouteForItem(type, item);

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => router.push(route as any)}
    >
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
      )}
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {getTitle(item)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {getSubtitle(type, item)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 90,
  },
  info: {
    padding: 8,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    lineHeight: 17,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
});
