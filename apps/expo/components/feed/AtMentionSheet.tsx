import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

const STADTKASSE_IMG = require('../../assets/illustration/muenzen/stadtkasse.png');

type Props = {
  visible: boolean;
  /** A Stadtkasse snapshot is already attached to the draft. */
  attached: boolean;
  /** Capturing the treasury figure (on-chain read in flight). */
  loading: boolean;
  /** Attach (captures the value) or, if already attached, remove it. */
  onSelectStadtkasse: () => void;
  onClose: () => void;
};

/**
 * The "@" composer menu. Today it offers a single row — attach a live snapshot
 * of the Stadtkasse — but is shaped as a list so people/events can be added
 * later. Tapping the row attaches the snapshot; tapping it again (when already
 * attached) removes it.
 */
export default function AtMentionSheet({
  visible,
  attached,
  loading,
  onSelectStadtkasse,
  onClose,
}: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so they don't dismiss via the backdrop. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Hinzufügen</Text>

          <Pressable
            style={[styles.row, { backgroundColor: colors.surfaceSecondary }]}
            onPress={onSelectStadtkasse}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Stadtkasse anhängen"
          >
            <Image source={STADTKASSE_IMG} style={styles.rowIcon} contentFit="contain" />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Stadtkasse</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                Aktuellen Kontostand anhängen
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : attached ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  rowSub: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
