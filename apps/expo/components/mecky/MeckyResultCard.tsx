import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { RichCardData } from '@/lib/types/mecky';

const POI_EMOJIS: Record<string, string> = {
  toilet: '🚻',
  drinking_water: '🚰',
  bike_repair: '🔧',
  bike_rental: '🚲',
  swim_spot: '🏊',
  indoor_alternative: '🏛️',
  tourist_info: 'ℹ️',
  pharmacy: '💊',
  observation_stand: '🦅',
  viewpoint: '🌄',
};

const POI_COLORS: Record<string, string> = {
  toilet: '#5E6BFF',
  drinking_water: '#00B7C2',
  bike_repair: '#E85D04',
  bike_rental: '#F4A261',
  swim_spot: '#00A6FB',
  indoor_alternative: '#9B5DE5',
  tourist_info: '#194383',
  pharmacy: '#D62828',
  observation_stand: '#2B9348',
  viewpoint: '#FFB703',
};

const TRANSIT_MODE_EMOJIS: Record<string, string> = {
  bus_regio: '🚌',
  bus_city: '🚐',
  bus_park: '🌲',
  buergerbus: '💛',
  ferry: '⛴️',
  train: '🚆',
};

const TRANSIT_MODE_COLORS: Record<string, string> = {
  bus_regio: '#194383',
  bus_city: '#0077B6',
  bus_park: '#2B9348',
  buergerbus: '#FFB703',
  ferry: '#00A6FB',
  train: '#7209B7',
};

const ADVISORY_EMOJIS: Record<string, string> = {
  mosquito: '🦟',
  tick: '🕷️',
  cyanobacteria: '💧',
  pollen: '🌼',
  sun: '☀️',
};

type RouteParams = {
  pathname: string;
  params?: Record<string, string>;
};

function getRouteForItem(type: RichCardData['type'], item: any): RouteParams | string {
  switch (type) {
    case 'events':
      return { pathname: '/event/[id]', params: { id: item.id } };
    case 'restaurants':
      return { pathname: '/restaurant/[slug]', params: { slug: item.slug } };
    case 'marketplace':
      return { pathname: '/marketplace/[id]', params: { id: item.id } };
    case 'news':
      return { pathname: '/news/[slug]', params: { slug: item.slug } };
    case 'movies':
      return { pathname: '/movies/[id]', params: { id: item.id } };
    case 'businesses':
      return { pathname: '/business/[slug]', params: { slug: item.slug } };
    case 'deals':
      return { pathname: '/deals/[id]', params: { id: item.id } };
    case 'pois':
      return { pathname: '/poi/[id]', params: { id: item.id } };
    case 'transit':
      return { pathname: '/transit/line/[code]', params: { code: item.line_code } };
    case 'tours':
      return { pathname: '/tour/[slug]', params: { slug: item.slug } };
    case 'wildlife':
      // Wildlife cards from Mecky come without a sighting id; route to the species page
      return item.species_slug
        ? { pathname: '/wildlife/species/[slug]', params: { slug: item.species_slug } }
        : '/wildlife';
    case 'wildlife_calendar':
      return '/wildlife';
    case 'advisories':
      return '/location';
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

function getEmoji(type: RichCardData['type'], item: any): string | null {
  switch (type) {
    case 'pois':
      return POI_EMOJIS[item.type] || '📍';
    case 'transit':
      return TRANSIT_MODE_EMOJIS[item.mode] || '🚌';
    case 'tours':
      if (item.categories?.includes('wildlife')) return '🦅';
      if (item.categories?.includes('faehre_kombi')) return '⛴️';
      if (item.categories?.includes('schlechtwetter')) return '🌧️';
      if (item.categories?.includes('sonnenuntergang')) return '🌅';
      if (item.categories?.includes('familie')) return '👨‍👩‍👧';
      return '🚲';
    case 'wildlife':
      return '🦅';
    case 'wildlife_calendar':
      return '📅';
    case 'advisories':
      return ADVISORY_EMOJIS[item.type] || '⚠️';
    default:
      return null;
  }
}

function getEmojiColor(type: RichCardData['type'], item: any): string {
  switch (type) {
    case 'pois':
      return POI_COLORS[item.type] || '#194383';
    case 'transit':
      return TRANSIT_MODE_COLORS[item.mode] || '#194383';
    case 'tours':
      if (item.difficulty === 'sportlich') return '#D62828';
      if (item.difficulty === 'mittel') return '#FFB703';
      return '#2B9348';
    case 'wildlife':
      return '#2B9348';
    case 'wildlife_calendar':
      return '#194383';
    case 'advisories':
      if (item.level === 'sehr_hoch') return '#D62828';
      if (item.level === 'hoch') return '#E85D04';
      if (item.level === 'mittel') return '#FFB703';
      return '#2B9348';
    default:
      return '#194383';
  }
}

function getTitle(type: RichCardData['type'], item: any): string {
  switch (type) {
    case 'pois':
      return item.name || 'Tipp';
    case 'transit':
      return `${item.line_code} · ${item.departure_time}`;
    case 'tours':
      return item.title || 'Tour';
    case 'wildlife':
      return item.species_de || 'Sichtung';
    case 'wildlife_calendar':
      return item.title || 'Saisontermin';
    case 'advisories':
      return `${item.type === 'mosquito' ? 'Mücken' : item.type === 'tick' ? 'Zecken' : item.type === 'cyanobacteria' ? 'Blaualgen' : item.type === 'sun' ? 'UV' : 'Pollen'} · ${item.level}`;
    default:
      return item.title || item.name || 'Unbekannt';
  }
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
    case 'pois': {
      const parts: string[] = [item.type_label_de || ''];
      if (item.is_24h) parts.push('24h');
      if (item.is_pannendienst) parts.push('Pannendienst');
      if (item.status_label_de) parts.push(item.status_label_de);
      return parts.filter(Boolean).join(' · ');
    }
    case 'transit': {
      const parts: string[] = [item.mode_label_de || ''];
      if (item.destination) parts.push(`→ ${item.destination}`);
      if (item.distance_km != null) parts.push(`${item.distance_km} km`);
      return parts.filter(Boolean).join(' · ');
    }
    case 'tours': {
      const parts: string[] = [];
      if (item.distance_km) parts.push(`${item.distance_km} km`);
      if (item.duration_min) parts.push(`${Math.round(item.duration_min / 60)} h`);
      if (item.difficulty_label_de) parts.push(item.difficulty_label_de);
      return parts.join(' · ');
    }
    case 'wildlife': {
      const parts: string[] = [];
      if (item.individual_count > 1) parts.push(`${item.individual_count} Tiere`);
      if (item.near_landmark) parts.push(item.near_landmark);
      if (item.freshness) parts.push(item.freshness);
      return parts.join(' · ');
    }
    case 'wildlife_calendar': {
      const parts: string[] = [];
      if (item.peak_window) parts.push(`★ ${item.peak_window}`);
      else if (item.start_date_hint) parts.push(item.start_date_hint);
      if (item.best_location) parts.push(item.best_location);
      return parts.join(' · ');
    }
    case 'advisories':
      return item.recommendation || item.message || '';
    default:
      return '';
  }
}

function handleNavigate(target: RouteParams | string, router: ReturnType<typeof useRouter>) {
  if (typeof target === 'string') {
    router.push(target as any);
  } else {
    router.push(target as any);
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
  const emoji = getEmoji(type, item);
  const emojiColor = getEmojiColor(type, item);
  const target = getRouteForItem(type, item);

  // Handle "Anrufen" inline for POIs with phone (Pannendienst etc.)
  const phoneOnTap = type === 'pois' && item.is_pannendienst && item.phone ? item.phone : null;

  const handlePress = () => {
    if (phoneOnTap) {
      Linking.openURL(`tel:${phoneOnTap.replace(/\s+/g, '')}`).catch(() =>
        handleNavigate(target, router)
      );
      return;
    }
    handleNavigate(target, router);
  };

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={handlePress}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
      ) : emoji ? (
        <View style={[styles.emojiBox, { backgroundColor: emojiColor + '22' }]}>
          <Text style={styles.emojiBig}>{emoji}</Text>
        </View>
      ) : null}
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {getTitle(type, item)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
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
  emojiBox: {
    width: '100%',
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiBig: { fontSize: 40 },
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
    lineHeight: 15,
  },
});
