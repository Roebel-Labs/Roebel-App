import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { chatFont, useChatTokens } from './tokens';

export type FileCardProps = {
  name: string;
  /** Extension without dot, e.g. "md". */
  ext: string;
  /** Bytes. */
  size: number;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** "3,1 KB" (German decimal comma). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** File card with the grey "M↓" badge (ref 7). */
export function FileCard({ name, ext, size, onPress, onLongPress, style }: FileCardProps) {
  const t = useChatTokens();
  const base = ext && name.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? name.slice(0, -(ext.length + 1)) : name;
  const badge = ext.toLowerCase() === 'md' || ext.toLowerCase() === 'markdown' ? 'M↓' : ext.slice(0, 3).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Datei ${base}.${ext} öffnen`}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, { backgroundColor: t.bubbleBot, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <View style={[styles.badge, { backgroundColor: t.fileBadgeBg }]}>
        <Text style={[styles.badgeText, { color: t.fileBadgeText }]}>{badge}</Text>
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
          {base}
          {ext ? <Text style={{ color: t.textTertiary }}>.{ext}</Text> : null}
        </Text>
        <Text style={[styles.size, { color: t.textTertiary }]}>{formatFileSize(size)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: 22,
    paddingLeft: 12,
    paddingRight: 16,
    paddingVertical: 9,
    maxWidth: '80%',
    minWidth: 180,
  },
  badge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: chatFont.medium, fontSize: 13, letterSpacing: -0.3 },
  text: { marginLeft: 11, flexShrink: 1 },
  name: { fontFamily: chatFont.medium, fontSize: 16, letterSpacing: -0.2 },
  size: { fontFamily: chatFont.regular, fontSize: 13, marginTop: 2 },
});

export default FileCard;
