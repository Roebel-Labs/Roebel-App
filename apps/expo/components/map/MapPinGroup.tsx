/**
 * A group of nearby pins, drawn the way Luma does it: the members' photos
 * as a small fanned stack, the most important member's name underneath and
 * "+N weitere" — instead of a bubble with a bare number in it.
 *
 * Members without a photo show their pin emoji on a tile, so a stack of
 * Vereine still reads as "what is here", not as an empty frame.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MapFeatureProperties } from '@/lib/map/geojson';
import type { PinGroup } from '@/lib/map/clusters';

type Props = {
  group: PinGroup;
  onPress: (group: PinGroup) => void;
};

const FRONT = 44;
const BACK = 38;
/** Width the label may use; the stack is centred above it. */
export const PIN_GROUP_WIDTH = 150;

/** The front tile is the group's anchor; the two behind prefer members with photos. */
function stackMembers(members: MapFeatureProperties[]): MapFeatureProperties[] {
  const [anchor, ...rest] = members;
  const withPhoto = rest.filter((m) => m.image_url);
  const without = rest.filter((m) => !m.image_url);
  return [anchor, ...withPhoto, ...without].slice(0, 3);
}

function Tile({
  member,
  size,
  style,
}: {
  member: MapFeatureProperties;
  size: number;
  style?: object;
}) {
  const { colors, isDark } = useTheme();
  const frame = isDark ? '#2d2e31' : '#ffffff';
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderColor: frame, backgroundColor: colors.card },
        style,
      ]}
    >
      {member.image_url ? (
        <Image
          source={{ uri: member.image_url }}
          style={styles.fill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={member.fid}
          transition={120}
        />
      ) : (
        <Text style={[styles.emoji, { fontSize: size * 0.48 }]}>{member.emoji}</Text>
      )}
    </View>
  );
}

function MapPinGroup({ group, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const [front, second, third] = stackMembers(group.members);
  const more = group.members.length - 1;
  const halo = isDark ? '#18191B' : '#ffffff';

  return (
    <Pressable
      onPress={() => onPress(group)}
      style={styles.container}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${front.title} und ${more} weitere`}
    >
      <View style={styles.stack}>
        {third ? <Tile member={third} size={BACK} style={styles.backRight} /> : null}
        {second ? <Tile member={second} size={BACK} style={styles.backLeft} /> : null}
        <Tile member={front} size={FRONT} style={styles.front} />
      </View>
      <Text
        numberOfLines={2}
        style={[
          styles.title,
          { color: colors.textPrimary, textShadowColor: halo },
        ]}
      >
        {front.title}
      </Text>
      <Text style={[styles.more, { color: colors.textSecondary, textShadowColor: halo }]}>
        +{more} weitere
      </Text>
    </Pressable>
  );
}

export default memo(MapPinGroup);

const styles = StyleSheet.create({
  container: { width: PIN_GROUP_WIDTH, alignItems: 'center' },
  stack: {
    width: FRONT + 34,
    height: FRONT + 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tile: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  fill: { width: '100%', height: '100%' },
  emoji: { textAlign: 'center' },
  front: { bottom: 0 },
  backLeft: { bottom: 5, left: 2, transform: [{ rotate: '-10deg' }] },
  backRight: { bottom: 5, right: 2, transform: [{ rotate: '9deg' }] },
  title: {
    marginTop: 4,
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  more: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
});
