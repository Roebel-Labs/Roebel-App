import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatCompact } from '@/lib/charts/geometry';
import type { TopObject } from '@/lib/analytics/queries';

const TYPE_LABEL: Record<string, string> = {
  post: 'Beitrag', deal: 'Anzeige', event: 'Veranstaltung', listing: 'Marktplatz', mini_app: 'Mini-App', profile: 'Profil', org: 'Profil',
};

function hrefFor(o: TopObject): string | null {
  switch (o.objectType) {
    case 'post': return `/post/${o.objectId}`;
    case 'deal': return `/deals/${o.objectId}`;
    case 'event': return `/event/${o.objectId}`;
    case 'listing': return `/marketplace/${o.objectId}`;
    case 'profile':
    case 'org': return `/account/${o.objectId}`;
    default: return null;
  }
}

export default function TopList({ items, unit }: { items: TopObject[]; unit: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  if (items.length === 0) {
    return <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Daten in diesem Zeitraum</Text>;
  }
  return (
    <View>
      {items.map((o, i) => {
        const href = hrefFor(o);
        return (
          <Pressable
            key={`${o.objectType}:${o.objectId}`}
            onPress={() => href && router.push(href as any)}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
          >
            <Text style={[styles.rank, { color: colors.textTertiary }]}>{i + 1}</Text>
            {o.thumbnailUrl ? (
              <Image source={{ uri: o.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.surface }]} />
            )}
            <View style={styles.text}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {o.title}
              </Text>
              <Text style={[styles.type, { color: colors.textSecondary }]}>{TYPE_LABEL[o.objectType] ?? 'Inhalt'}</Text>
            </View>
            <Text style={[styles.count, { color: colors.textPrimary }]}>
              {formatCompact(o.count)} <Text style={{ color: colors.textSecondary }}>{unit}</Text>
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rank: { width: 16, fontFamily: fontFamily.medium, fontSize: 13 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  text: { flex: 1 },
  title: { fontFamily: fontFamily.medium, fontSize: 14 },
  type: { fontFamily: fontFamily.regular, fontSize: 12 },
  count: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  empty: { fontFamily: fontFamily.medium, fontSize: 14, paddingVertical: 16, textAlign: 'center' },
});
