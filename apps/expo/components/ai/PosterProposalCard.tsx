// Poster step of the AI event submission chat: right before the event is sent,
// the web server designs two DIN-A posters for it and the person picks one,
// keeps their own image, or skips. Images are AI-generated and labelled so.
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import type { ColorTokens } from '@/constants/theme';
import { fontFamily } from '@/constants/theme';
import { POSTER_ASPECT_RATIO, POSTER_RADIUS } from '@/constants/poster';
import ImageZoomModal from '@/components/ImageZoomModal';
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
  /** The person's own uploaded image, if any (for "Original behalten"). */
  hasOriginal: boolean;
  onSelect: (proposal: PosterOption) => void;
  onKeepOriginal: () => void;
  onRegenerate: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
/** Two cards, the second peeking in, so it is obvious there is a choice. */
const CARD_WIDTH = Math.round(Math.min(SCREEN_WIDTH * 0.62, 300));
const CARD_GAP = 12;

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

const SAVE_LABEL = Platform.OS === 'ios' ? 'Sichern' : 'Öffnen';

export default function PosterProposalCard({
  step,
  hasOriginal,
  onSelect,
  onKeepOriginal,
  onRegenerate,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const urls = step.proposals.map((p) => p.image_url);
  const heading =
    step.mode === 'reformat' ? 'Dein Flyer im Plakatformat' : 'Zwei Plakat-Vorschläge';
  const sub =
    step.status === 'loading'
      ? 'Ich gestalte zwei Plakate für dein Event. Das dauert etwa eine Minute.'
      : step.status === 'chosen'
        ? 'Dieses Plakat wird dein Veranstaltungsbild.'
        : step.mode === 'reformat'
          ? 'Gleicher Inhalt, sauber ins Hochformat gebracht. Wähle eine Variante.'
          : 'Aus deinen Angaben gestaltet. Wähle eine Variante.';

  if (step.status === 'dismissed') return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.sub}>{sub}</Text>

      {step.status === 'loading' ? (
        <View style={styles.row}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.card, styles.skeleton]}>
              {i === 0 ? <ActivityIndicator color={colors.textSecondary} /> : null}
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
          {step.proposals.map((p) => {
            const selected = step.selectedId === p.id;
            const dimmed = step.status === 'chosen' && !selected;
            return (
              <View key={p.id} style={[styles.cardColumn, dimmed && styles.dimmed]}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setZoomUrl(p.image_url)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Variante ${variantLetter(p.variant)} groß ansehen`}
                  style={[styles.card, selected && { borderColor: colors.primary, borderWidth: 2 }]}
                >
                  <Image
                    source={{ uri: p.image_url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.aiChip}>
                    <Text style={styles.aiChipText}>KI-generiert</Text>
                  </View>
                  {selected ? (
                    <View style={[styles.check, { backgroundColor: colors.primary }]}>
                      <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
                    </View>
                  ) : null}
                </TouchableOpacity>
                <Text style={styles.label} numberOfLines={1}>
                  Variante {variantLetter(p.variant)} · {directionLabel(p.direction)}
                </Text>
                {step.status === 'ready' ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.choose, { backgroundColor: colors.primary }]}
                      onPress={() => onSelect(p)}
                    >
                      <Text style={[styles.chooseText, { color: colors.onPrimary }]}>Diese wählen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.save, { borderColor: colors.border }]}
                      onPress={() => savePoster(p.image_url)}
                      accessibilityLabel={`Variante ${variantLetter(p.variant)} ${SAVE_LABEL.toLowerCase()}`}
                    >
                      <Ionicons
                        name={Platform.OS === 'ios' ? 'share-outline' : 'open-outline'}
                        size={18}
                        color={colors.textPrimary}
                      />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {step.status === 'loading' || step.status === 'ready' ? (
        <View style={styles.footer}>
          <TouchableOpacity onPress={onKeepOriginal} hitSlop={8}>
            <Text style={styles.footerLink}>
              {hasOriginal ? 'Mein Bild behalten' : 'Ohne Plakat weiter'}
            </Text>
          </TouchableOpacity>
          {step.status === 'ready' && step.canRegenerate ? (
            <TouchableOpacity onPress={onRegenerate} hitSlop={8}>
              <Text style={styles.footerLink}>Andere Vorschläge</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <ImageZoomModal
        visible={zoomUrl !== null}
        images={urls}
        imageUrl={zoomUrl ?? undefined}
        onClose={() => setZoomUrl(null)}
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
      aspectRatio: POSTER_ASPECT_RATIO,
      borderRadius: POSTER_RADIUS,
      overflow: 'hidden',
      backgroundColor: colors.cardPlaceholder,
    },
    skeleton: {
      alignItems: 'center',
      justifyContent: 'center',
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
      width: 26,
      height: 26,
      borderRadius: 13,
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
