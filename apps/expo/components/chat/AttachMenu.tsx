import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatFont, haloShadow, useChatTokens } from './tokens';

export type AttachMenuProps = {
  visible: boolean;
  onClose: () => void;
  onPickImage?: () => void;
  onTakePhoto?: () => void;
  onPickFile?: () => void;
  /** Distance of the card's bottom edge from the window bottom (pt). */
  anchorBottom?: number;
  /** Distance from the window's left edge (default 9, ref 11). */
  anchorLeft?: number;
};

type Item = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; run?: () => void };

/** "+" popover: Bild anhängen / Foto aufnehmen / Datei wählen (ref 11). */
export function AttachMenu({
  visible,
  onClose,
  onPickImage,
  onTakePhoto,
  onPickFile,
  anchorBottom = 24,
  anchorLeft = 9,
}: AttachMenuProps) {
  const t = useChatTokens();
  const items: Item[] = [
    { key: 'image', label: 'Bild anhängen', icon: 'images-outline', run: onPickImage },
    { key: 'photo', label: 'Foto aufnehmen', icon: 'camera-outline', run: onTakePhoto },
    { key: 'file', label: 'Datei wählen', icon: 'folder-outline', run: onPickFile },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Menü schließen" />
      <View
        style={[
          styles.card,
          { backgroundColor: t.surface, bottom: anchorBottom, left: anchorLeft },
          haloShadow(t, true),
        ]}
      >
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onClose();
              it.run?.();
            }}
            style={({ pressed }) => [styles.row, pressed ? { backgroundColor: t.chipBackground } : null]}
          >
            <Ionicons name={it.icon} size={24} color={t.icon} style={styles.icon} />
            <Text style={[styles.label, { color: t.textPrimary }]}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: 249,
    borderRadius: 28,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  row: { height: 42, flexDirection: 'row', alignItems: 'center', paddingLeft: 26 },
  icon: { width: 28 },
  label: { fontFamily: chatFont.regular, fontSize: 17, marginLeft: 10 },
});

export default AttachMenu;
