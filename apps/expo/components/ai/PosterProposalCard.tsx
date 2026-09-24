// Poster step of the AI event submission chat: right before the event is sent,
// the web server designs two DIN-A posters for it and the person picks one,
// keeps their own image, or skips. While the posters are designed the empty
// cards are "scanned"; each poster then develops from blurred to sharp as it
// arrives. Tapping a poster opens a lightbox that pages between the variants
// and lets the person choose right there. Images are labelled as AI-generated.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import type { ColorTokens } from '@/constants/theme';
import { fontFamily } from '@/constants/theme';
import { POSTER_ASPECT_RATIO, POSTER_RADIUS } from '@/constants/poster';
import { ScanLine } from '@/components/ai/ScanningImages';
import {
  directionLabel,
  variantLetter,
  type PosterMode,
  type PosterOption,
} from '@/lib/poster-api';

export type PosterStepStatus = 'loading' | 'ready' | 'chosen' | 'dismissed';

export interface PosterStep {
  status: PosterStepStatus;
  mode: PosterMode | null;
  proposals: PosterOption[];
  selectedId: string | null;
  /** The server allows two rounds per draft, so one "Andere Vorschläge". */
  canRegenerate: boolean;
}

interface Props {
  step: PosterStep;
  /** The person's own uploaded image, if any (for "Mein Bild behalten"). */
  hasOriginal: boolean;
  onSelect: (proposal: PosterOption) => void;
  onKeepOriginal: () => void;
  onRegenerate: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Two cards, the second peeking in, so it is obvious there is a choice. */
const CARD_WIDTH = Math.round(Math.min(SCREEN_WIDTH * 0.62, 300));
const CARD_HEIGHT = Math.round(CARD_WIDTH / POSTER_ASPECT_RATIO);
const CARD_GAP = 12;
/** Lightbox poster: as large as fits between the top bar and the action bar. */
const LIGHTBOX_HEIGHT = Math.round(Math.min(SCREEN_HEIGHT * 0.68, (SCREEN_WIDTH - 32) / POSTER_ASPECT_RATIO));
const LIGHTBOX_WIDTH = Math.round(LIGHTBOX_HEIGHT * POSTER_ASPECT_RATIO);

/**
 * No expo-media-library / expo-sharing in the store build, so "save" uses what
 * ships natively: iOS share sheet (has "Bild sichern"), Android browser.
 */
async function savePoster(url: string) {
  try {
    if (Platform.OS === 'ios') await Share.share({ url });
    else await Linking.openURL(url);
  } catch {
    /* user cancelled or no handler */
  }
}

const SAVE_ICON = Platform.OS === 'ios' ? 'share-outline' : 'open-outline';

/** A poster that starts blurred and sharpens once its pixels have arrived. */
function DevelopingPoster({ uri, radius }: { uri: string; radius: number }) {
  const blur = useRef(new Animated.Value(1)).current;
  const settle = useRef(new Animated.Value(0)).current;

  const onLoad = () => {
    Animated.parallel([
      Animated.timing(blur, {
        toValue: 0,
        duration: 900,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(settle, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const scale = settle.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', transform: [{ scale }] }]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        onLoad={onLoad}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: blur }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} cachePolicy="memory-disk" />
      </Animated.View>
    </Animated.View>
  );
}

/** Springs a little when a card becomes the chosen one. */
function useSelectPop(selected: boolean) {
  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pop, {
      toValue: selected ? 1 : 0,
      damping: 12,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }, [selected, pop]);
  return pop;
}

function PosterCard({
  proposal,
  selected,
  dimmed,
  interactive,
  onOpen,
  onSelect,
  styles,
  colors,
}: {
  proposal: PosterOption;
  selected: boolean;
  dimmed: boolean;
  interactive: boolean;
  onOpen: () => void;
  onSelect: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorTokens;
}) {
  const pop = useSelectPop(selected);
  const cardScale = pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] });
  const checkScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <View style={[styles.cardColumn, dimmed && styles.dimmed]}>
      <Animated.View style={{ transform: [{ scale: cardScale }] }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onOpen}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Variante ${variantLetter(proposal.variant)} groß ansehen`}
          style={[styles.card, selected && { borderColor: colors.primary, borderWidth: 2.5 }]}
        >
          <DevelopingPoster uri={proposal.image_url} radius={POSTER_RADIUS} />
          <View style={styles.aiChip}>
            <Text style={styles.aiChipText}>KI-generiert</Text>
          </View>
          <Animated.View
            style={[
              styles.check,
              { backgroundColor: colors.primary, opacity: pop, transform: [{ scale: checkScale }] },
            ]}
          >
            <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
      <Text style={styles.label} numberOfLines={1}>
        Variante {variantLetter(proposal.variant)} · {directionLabel(proposal.direction)}
      </Text>
      {interactive ? (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.choose, { backgroundColor: colors.primary }]} onPress={onSelect}>
            <Text style={[styles.chooseText, { color: colors.onPrimary }]}>Diese wählen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.save, { borderColor: colors.border }]}
            onPress={() => savePoster(proposal.image_url)}
            accessibilityLabel={`Variante ${variantLetter(proposal.variant)} speichern`}
          >
            <Ionicons name={SAVE_ICON} size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** Full-screen viewer that pages between the variants and lets you choose one. */
function PosterLightbox({
  proposals,
  index,
  canChoose,
  selectedId,
  onClose,
  onChoose,
}: {
  proposals: PosterOption[];
  index: number | null;
  canChoose: boolean;
  selectedId: string | null;
  onClose: () => void;
  onChoose: (p: PosterOption) => void;
}) {
  const [current, setCurrent] = useState(index ?? 0);
  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);

  const visible = index !== null;
  const active = proposals[current];

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={lightboxStyles.container}>
        <View style={lightboxStyles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Schließen" style={lightboxStyles.close}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          {active ? (
            <Text style={lightboxStyles.title} numberOfLines={1}>
              Variante {variantLetter(active.variant)} · {directionLabel(active.direction)}
            </Text>
          ) : null}
          <Text style={lightboxStyles.counter}>
            {proposals.length > 1 ? `${current + 1} / ${proposals.length}` : ''}
          </Text>
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
              <View style={lightboxStyles.page}>
                <View style={lightboxStyles.posterFrame}>
                  <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
                  {selectedId === item.id ? (
                    <View style={lightboxStyles.chosenChip}>
                      <Ionicons name="checkmark" size={14} color="#ffffff" />
                      <Text style={lightboxStyles.chosenText}>Gewählt</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          />
        ) : null}

        <View style={lightboxStyles.dots}>
          {proposals.map((p, i) => (
            <View key={p.id} style={[lightboxStyles.dot, i === current && lightboxStyles.dotActive]} />
          ))}
        </View>

        {active ? (
          <View style={lightboxStyles.bottomBar}>
            {canChoose ? (
              <TouchableOpacity style={lightboxStyles.choose} onPress={() => onChoose(active)}>
                <Text style={lightboxStyles.chooseText}>Variante {variantLetter(active.variant)} wählen</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <TouchableOpacity
              style={lightboxStyles.save}
              onPress={() => savePoster(active.image_url)}
              accessibilityLabel="Plakat speichern"
            >
              <Ionicons name={SAVE_ICON} size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

export default function PosterProposalCard({
  step,
  hasOriginal,
  onSelect,
  onKeepOriginal,
  onRegenerate,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (step.status === 'dismissed') return null;

  const heading = step.mode === 'reformat' ? 'Dein Flyer im Plakatformat' : 'Zwei Plakat-Vorschläge';
  const sub =
    step.status === 'loading'
      ? 'Ich gestalte zwei Plakate für dein Event. Das dauert etwa eine Minute.'
      : step.status === 'chosen'
        ? 'Dieses Plakat wird dein Veranstaltungsbild.'
        : step.mode === 'reformat'
          ? 'Gleicher Inhalt, sauber ins Hochformat gebracht. Tippe ein Plakat an, um es groß zu sehen.'
          : 'Aus deinen Angaben gestaltet. Tippe ein Plakat an, um es groß zu sehen.';

  const choose = (p: PosterOption) => {
    setLightboxIndex(null);
    onSelect(p);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.sub}>{sub}</Text>

      {step.status === 'loading' ? (
        <View style={styles.row}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.cardPlaceholder }]}>
              <ScanLine active height={CARD_HEIGHT} />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={styles.row}
        >
          {step.proposals.map((p, i) => (
            <PosterCard
              key={p.id}
              proposal={p}
              selected={step.selectedId === p.id}
              dimmed={step.status === 'chosen' && step.selectedId !== p.id}
              interactive={step.status === 'ready'}
              onOpen={() => setLightboxIndex(i)}
              onSelect={() => choose(p)}
              styles={styles}
              colors={colors}
            />
          ))}
        </ScrollView>
      )}

      {step.status === 'loading' || step.status === 'ready' ? (
        <View style={styles.footer}>
          <TouchableOpacity onPress={onKeepOriginal} hitSlop={8}>
            <Text style={styles.footerLink}>{hasOriginal ? 'Mein Bild behalten' : 'Ohne Plakat weiter'}</Text>
          </TouchableOpacity>
          {step.status === 'ready' && step.canRegenerate ? (
            <TouchableOpacity onPress={onRegenerate} hitSlop={8}>
              <Text style={styles.footerLink}>Andere Vorschläge</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <PosterLightbox
        proposals={step.proposals}
        index={lightboxIndex}
        canChoose={step.status === 'ready'}
        selectedId={step.selectedId}
        onClose={() => setLightboxIndex(null)}
        onChoose={choose}
      />
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
      paddingRight: 16,
      paddingVertical: 4,
    },
    cardColumn: {
      width: CARD_WIDTH,
      gap: 8,
    },
    dimmed: {
      opacity: 0.4,
    },
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: POSTER_RADIUS,
      overflow: 'hidden',
      backgroundColor: colors.cardPlaceholder,
    },
    aiChip: {
      position: 'absolute',
      left: 8,
      top: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    aiChipText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: '#ffffff',
    },
    check: {
      position: 'absolute',
      right: 8,
      top: 8,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    choose: {
      flex: 1,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chooseText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
    },
    save: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      flexDirection: 'row',
      gap: 20,
      marginTop: 12,
    },
    footerLink: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
  });
}

const lightboxStyles = StyleSheet.create({
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
  close: {
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
  counter: {
    width: 40,
    textAlign: 'right',
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  page: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterFrame: {
    width: LIGHTBOX_WIDTH,
    height: LIGHTBOX_HEIGHT,
    borderRadius: POSTER_RADIUS,
    overflow: 'hidden',
  },
  chosenChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  chosenText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: '#ffffff',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
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
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  choose: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#000000',
  },
  save: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
