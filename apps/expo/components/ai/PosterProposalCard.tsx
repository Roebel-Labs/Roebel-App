// Poster step of the AI event submission chat: two DIN-A posters side by side,
// each with its style name underneath. Tap one to use it as the event image,
// tap it again to go back to the own image; long-press to see it big. No
// buttons. While the server designs them the cards shimmer; each poster then
// develops from blurred to sharp as it arrives. Labelled as AI-generated.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import type { ColorTokens } from '@/constants/theme';
import { fontFamily } from '@/constants/theme';
import { POSTER_ASPECT_RATIO, POSTER_RADIUS } from '@/constants/poster';
import {
  directionLabel,
  variantLetter,
  type PosterMode,
  type PosterOption,
} from '@/lib/poster-api';

export type PosterStepStatus = 'loading' | 'ready' | 'dismissed';

export interface PosterStep {
  status: PosterStepStatus;
  mode: PosterMode | null;
  proposals: PosterOption[];
  selectedId: string | null;
}

interface Props {
  step: PosterStep;
  onToggle: (proposal: PosterOption) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_GAP = 12;
/** The chat's horizontal padding is 12 on each side. */
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 24 - CARD_GAP) / 2);
const CARD_HEIGHT = Math.round(CARD_WIDTH / POSTER_ASPECT_RATIO);
const LIGHTBOX_HEIGHT = Math.round(Math.min(SCREEN_HEIGHT * 0.72, (SCREEN_WIDTH - 32) / POSTER_ASPECT_RATIO));
const LIGHTBOX_WIDTH = Math.round(LIGHTBOX_HEIGHT * POSTER_ASPECT_RATIO);

/** No expo-media-library / expo-sharing in the store build: iOS share sheet, Android browser. */
async function savePoster(url: string) {
  try {
    if (Platform.OS === 'ios') await Share.share({ url });
    else await Linking.openURL(url);
  } catch {
    /* user cancelled or no handler */
  }
}

/** Skeleton shimmer: a soft diagonal highlight sweeping across the empty card. */
function Shimmer({ width }: { width: number }) {
  const { isDark } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const band = width * 0.8;
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-band, width + band] });
  const highlight = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)';

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { width: band, transform: [{ translateX }, { skewX: '-18deg' }] }]}
    >
      <LinearGradient
        colors={['transparent', highlight, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** A poster that starts blurred and sharpens once its pixels have arrived. */
function DevelopingPoster({ uri }: { uri: string }) {
  const blur = useRef(new Animated.Value(1)).current;
  const settle = useRef(new Animated.Value(0)).current;

  const onLoad = () => {
    Animated.parallel([
      Animated.timing(blur, { toValue: 0, duration: 900, delay: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(settle, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  const scale = settle.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onLoad={onLoad} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: blur }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} cachePolicy="memory-disk" />
      </Animated.View>
    </Animated.View>
  );
}

function PosterTile({
  proposal,
  selected,
  anySelected,
  onToggle,
  onPeek,
  colors,
  styles,
}: {
  proposal: PosterOption;
  selected: boolean;
  anySelected: boolean;
  onToggle: () => void;
  onPeek: () => void;
  colors: ColorTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: selected ? 1 : 0, damping: 12, stiffness: 220, useNativeDriver: true }).start();
  }, [selected, pop]);

  const scale = pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] });
  const checkScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onPeek}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${directionLabel(proposal.direction)}, ${selected ? 'gewählt' : 'als Bild verwenden'}`}
      accessibilityHint="Lange drücken, um das Plakat groß zu sehen"
      style={[styles.tile, anySelected && !selected && styles.dimmed]}
    >
      <Animated.View
        style={[
          styles.card,
          { transform: [{ scale }] },
          selected && { borderColor: colors.primary, borderWidth: 2.5 },
        ]}
      >
        <DevelopingPoster uri={proposal.image_url} />
        <Animated.View
          style={[styles.check, { backgroundColor: colors.primary, opacity: pop, transform: [{ scale: checkScale }] }]}
        >
          <Ionicons name="checkmark" size={15} color={colors.onPrimary} />
        </Animated.View>
      </Animated.View>
      <Text style={[styles.name, selected && { color: colors.textPrimary }]} numberOfLines={1}>
        {directionLabel(proposal.direction)}
      </Text>
    </Pressable>
  );
}

/** Full-screen view (long-press), paging between both posters. */
function PosterLightbox({
  proposals,
  index,
  onClose,
}: {
  proposals: PosterOption[];
  index: number | null;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index ?? 0);
  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);
  const visible = index !== null;
  const active = proposals[current];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={lightbox.container}>
        <View style={lightbox.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Schließen" style={lightbox.icon}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          <Text style={lightbox.title} numberOfLines={1}>
            {active ? `${directionLabel(active.direction)} · Variante ${variantLetter(active.variant)}` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => active && savePoster(active.image_url)}
            hitSlop={10}
            accessibilityLabel="Plakat speichern"
            style={lightbox.icon}
          >
            <Ionicons name={Platform.OS === 'ios' ? 'share-outline' : 'open-outline'} size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
        {visible ? (
          <FlatList
            data={proposals}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index ?? 0}
            getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
            renderItem={({ item }) => (
              <View style={lightbox.page}>
                <View style={lightbox.frame}>
                  <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
                </View>
              </View>
            )}
          />
        ) : null}
        <View style={lightbox.dots}>
          {proposals.map((p, i) => (
            <View key={p.id} style={[lightbox.dot, i === current && lightbox.dotActive]} />
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function PosterProposalCard({ step, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [peekIndex, setPeekIndex] = useState<number | null>(null);

  if (step.status === 'dismissed') return null;

  const heading = step.mode === 'reformat' ? 'Dein Flyer im Plakatformat' : 'Zwei Plakat-Vorschläge';
  const sub =
    step.status === 'loading'
      ? 'Deine Plakate entstehen gerade.'
      : 'Tippe ein Plakat an, um es als Bild zu verwenden.';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.sub}>{sub}</Text>
      <View style={styles.row}>
        {step.status === 'loading'
          ? [0, 1].map((i) => (
              <View key={i} style={styles.tile}>
                <View style={styles.card}>
                  <Shimmer width={CARD_WIDTH} />
                </View>
                <View style={styles.nameSkeleton} />
              </View>
            ))
          : step.proposals.map((p, i) => (
              <PosterTile
                key={p.id}
                proposal={p}
                selected={step.selectedId === p.id}
                anySelected={step.selectedId !== null}
                onToggle={() => onToggle(p)}
                onPeek={() => setPeekIndex(i)}
                colors={colors}
                styles={styles}
              />
            ))}
      </View>
      <PosterLightbox proposals={step.proposals} index={peekIndex} onClose={() => setPeekIndex(null)} />
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      marginVertical: 8,
      gap: 4,
    },
    heading: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    sub: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      gap: CARD_GAP,
    },
    tile: {
      width: CARD_WIDTH,
      gap: 8,
    },
    dimmed: {
      opacity: 0.45,
    },
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: POSTER_RADIUS,
      overflow: 'hidden',
      backgroundColor: colors.cardPlaceholder,
    },
    check: {
      position: 'absolute',
      right: 8,
      top: 8,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    nameSkeleton: {
      alignSelf: 'center',
      width: CARD_WIDTH * 0.45,
      height: 12,
      borderRadius: 6,
      marginTop: 3,
      backgroundColor: colors.cardPlaceholder,
    },
  });
}

const lightbox = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#ffffff',
  },
  page: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: LIGHTBOX_WIDTH,
    height: LIGHTBOX_HEIGHT,
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
  },
});
