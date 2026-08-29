import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Polygon,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useMuenzenLeaderboard, type LeaderboardEntry } from '@/hooks/useMuenzenLeaderboard';

const COIN_IMG = require('../../assets/illustration/gamification/single.png');

/** Rows shown below the podium; the user's own row is pinned when ranked lower. */
const MAX_ROWS = 50;

// Metallic gradients for the big podium numerals (gold / silver / bronze).
const NUMERAL_STOPS: Record<1 | 2 | 3, string[]> = {
  1: ['#FFF3C6', '#F7C96B', '#D9973B'],
  2: ['#FAFBFF', '#D9DCE4', '#A7ACBA'],
  3: ['#FFE3BE', '#E2A667', '#B9772F'],
};

const PODIUM: Record<
  1 | 2 | 3,
  { panel: number; avatar: number; numeral: number; ring: string; badge: [string, string] }
> = {
  1: { panel: 150, avatar: 68, numeral: 118, ring: '#8B5CF6', badge: ['#A78BFA', '#7C3AED'] },
  2: { panel: 124, avatar: 60, numeral: 90, ring: '#F59E0B', badge: ['#FCD34D', '#D97706'] },
  3: { panel: 112, avatar: 60, numeral: 90, ring: '#F43F5E', badge: ['#FB7185', '#E11D48'] },
};

const LIST_BADGE: [string, string] = ['#60A5FA', '#2563EB'];

// Pointy-top hexagon + five-point star, both on a 24×24 viewBox.
const HEX_POINTS = '12,1 21.5,6.5 21.5,17.5 12,23 2.5,17.5 2.5,6.5';
const STAR_POINTS =
  '12,6.5 13.29,10.22 17.23,10.3 14.09,12.68 15.23,16.45 12,14.2 8.77,16.45 9.91,12.68 6.77,10.3 10.71,10.22';

const fmtAmount = (n: number) => Math.round(n).toLocaleString('de-DE');

function subtitleFor(entry: LeaderboardEntry): string {
  if (entry.connections != null) {
    return `Mit ${entry.connections} ${entry.connections === 1 ? 'Person' : 'Personen'} verbunden`;
  }
  const pct = (entry.supplyShare * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return `${pct} % aller Münzen`;
}

/** Small hexagonal achievement badge with a star, used on every avatar. */
function RankBadge({ id, tint, size }: { id: string; tint: [string, string]; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tint[0]} />
          <Stop offset="1" stopColor={tint[1]} />
        </SvgGradient>
      </Defs>
      <Polygon points={HEX_POINTS} fill={`url(#${id})`} />
      <Polygon points={STAR_POINTS} fill="#FFFFFF" opacity={0.92} />
    </Svg>
  );
}

/** Big metallic podium numeral (gradient-filled text). */
function MedalNumeral({ place, size }: { place: 1 | 2 | 3; size: number }) {
  const stops = NUMERAL_STOPS[place];
  const width = size * 0.72;
  return (
    <Svg width={width} height={size}>
      <Defs>
        <SvgGradient id={`numeral-${place}`} x1="0" y1="0" x2="0" y2="1">
          {stops.map((c, i) => (
            <Stop key={c} offset={`${i / (stops.length - 1)}`} stopColor={c} />
          ))}
        </SvgGradient>
      </Defs>
      <SvgText
        x={width / 2}
        y={size * 0.82}
        fontSize={size}
        fontFamily="MonaSansSemiCondensed-Bold"
        fontWeight="bold"
        textAnchor="middle"
        fill={`url(#numeral-${place})`}
      >
        {String(place)}
      </SvgText>
    </Svg>
  );
}

/** Avatar with optional colored ring; falls back to an initial (never an address). */
function Avatar({
  entry,
  size,
  ring,
}: {
  entry: LeaderboardEntry;
  size: number;
  ring?: string;
}) {
  const { colors } = useTheme();
  const img = entry.imageUrl ? (
    <Image source={{ uri: entry.imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight },
      ]}
    >
      <Text style={[styles.avatarFallbackText, { color: colors.primary, fontSize: size * 0.4 }]}>
        {entry.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
  if (!ring) return img;
  return <View style={[styles.avatarRing, { borderColor: ring }]}>{img}</View>;
}

function PodiumColumn({ entry, place }: { entry?: LeaderboardEntry; place: 1 | 2 | 3 }) {
  const { colors, isDark } = useTheme();
  const cfg = PODIUM[place];
  if (!entry) return <View style={styles.podiumCol} />;
  // Slight horizontal offsets so the numerals peek out beside the avatars.
  const numeralShift = place === 1 ? 24 : place === 2 ? -16 : 18;
  return (
    <View style={styles.podiumCol}>
      <View pointerEvents="none" style={[styles.numeralWrap, { bottom: cfg.panel - 26 }]}>
        <View style={{ transform: [{ translateX: numeralShift }] }}>
          <MedalNumeral place={place} size={cfg.numeral} />
        </View>
      </View>
      <View
        style={[
          styles.podiumPanel,
          { height: cfg.panel, backgroundColor: isDark ? colors.surfaceSecondary : '#F4F5F7' },
        ]}
      >
        <View style={{ marginTop: -(cfg.avatar / 2 + 6) }}>
          <Avatar entry={entry} size={cfg.avatar} ring={cfg.ring} />
          <View style={styles.podiumBadge}>
            <RankBadge id={`podium-badge-${place}`} tint={cfg.badge} size={22} />
          </View>
        </View>
        <Text style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>
          {entry.name}
        </Text>
        <View style={[styles.amountRow, styles.podiumAmountRow]}>
          <Image source={COIN_IMG} style={styles.coinIconSmall} resizeMode="contain" />
          <Text style={[styles.podiumAmount, { color: colors.textPrimary }]}>
            {fmtAmount(entry.amount)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isDark ? colors.surfaceSecondary : '#FFFFFF',
          borderColor: isDark ? 'transparent' : colors.borderTertiary,
        },
      ]}
    >
      <Text style={[styles.rowRank, { color: colors.textSecondary }]}>{entry.rank}</Text>
      <View style={styles.rowAvatarWrap}>
        <Avatar entry={entry} size={44} />
        <View style={styles.rowBadge}>
          <RankBadge id={`row-badge-${entry.address}`} tint={LIST_BADGE} size={16} />
        </View>
      </View>
      <View style={styles.rowMiddle}>
        <View style={styles.rowNameLine}>
          <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
            {entry.name}
          </Text>
          {entry.isSelf && (
            <LinearGradient
              colors={['#F0A8D0', '#B69CF4', '#8EC5FC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.youPill}
            >
              <Text style={styles.youPillText}>Du</Text>
            </LinearGradient>
          )}
        </View>
        <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {subtitleFor(entry)}
        </Text>
      </View>
      <View style={styles.amountRow}>
        <Image source={COIN_IMG} style={styles.coinIconSmall} resizeMode="contain" />
        <Text style={[styles.rowAmount, { color: colors.textPrimary }]}>{fmtAmount(entry.amount)}</Text>
      </View>
    </View>
  );
}

/** Röbel Münzen leaderboard — top-3 podium + ranked holder rows ("Rang" tab). */
export default function MuenzenLeaderboard() {
  const { colors, isDark } = useTheme();
  const { entries, loading } = useMuenzenLeaderboard();

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />;
  }
  if (entries.length === 0) {
    return (
      <View
        style={[
          styles.emptyState,
          { backgroundColor: isDark ? colors.surface : '#F9FAFB', borderColor: colors.border },
        ]}
      >
        <Text style={styles.emptyEmoji}>🐂</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Noch keine Röbel Münzen im Umlauf.
        </Text>
      </View>
    );
  }

  const rest = entries.slice(3, MAX_ROWS);
  const self = entries.find((e) => e.isSelf);
  const selfPinned = self && self.rank > MAX_ROWS;

  return (
    <View style={styles.container}>
      <View style={styles.podiumRow}>
        <PodiumColumn entry={entries[1]} place={2} />
        <PodiumColumn entry={entries[0]} place={1} />
        <PodiumColumn entry={entries[2]} place={3} />
      </View>
      {(rest.length > 0 || selfPinned) && (
        <View style={styles.list}>
          {rest.map((e) => (
            <LeaderboardRow key={e.address} entry={e} />
          ))}
          {selfPinned && <LeaderboardRow entry={self} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    marginTop: 4,
  },
  podiumRow: {
    height: 248,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  podiumCol: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  numeralWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  podiumPanel: {
    borderRadius: 18,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  podiumBadge: {
    position: 'absolute',
    top: -3,
    left: -7,
  },
  podiumName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    marginTop: 8,
    maxWidth: '100%',
  },
  podiumAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  avatarRing: {
    borderWidth: 2.5,
    borderRadius: 999,
    padding: 2.5,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontFamily: 'Inter-Bold',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  podiumAmountRow: {
    marginTop: 4,
  },
  coinIconSmall: {
    width: 16,
    height: 16,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowRank: {
    width: 22,
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  rowAvatarWrap: {
    width: 44,
    height: 44,
  },
  rowBadge: {
    position: 'absolute',
    top: -3,
    left: -5,
  },
  rowMiddle: {
    flex: 1,
    gap: 2,
  },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    flexShrink: 1,
  },
  youPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  youPillText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  rowSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
  rowAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    textAlign: 'center',
  },
});
