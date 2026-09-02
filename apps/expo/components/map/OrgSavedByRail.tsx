/**
 * "Gespeichert von" — the faces under the counts row.
 *
 * Each avatar carries the badge for that person's own state, so the rail reads
 * as who did what rather than an undifferentiated crowd.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { SaverProfile } from '@/lib/types';

export default function OrgSavedByRail({ savers }: { savers: SaverProfile[] }) {
  const { colors } = useTheme();

  if (!savers.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>GESPEICHERT VON</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {savers.map((saver) => (
          <View key={saver.wallet_address} style={styles.person}>
            <View>
              {saver.profile_picture_url ? (
                <Image
                  source={{ uri: saver.profile_picture_url }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]} />
              )}
              <View style={[styles.badge, { backgroundColor: colors.background }]}>
                <Text style={styles.badgeIcon}>{saver.state === 'been' ? '✅' : '🔖'}</Text>
              </View>
            </View>
            <Text
              style={[styles.name, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {saver.username || 'Anonym'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { fontFamily: fontFamily.bold, fontSize: 13, letterSpacing: 0.4 },
  row: { gap: 14, paddingRight: 8 },
  person: { width: 64, alignItems: 'center', gap: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: { fontSize: 12 },
  name: { fontFamily: fontFamily.regular, fontSize: 12, maxWidth: 64 },
});
