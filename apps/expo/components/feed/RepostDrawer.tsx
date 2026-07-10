import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import RepostIcon from '@/assets/icons/repost.svg';

type Props = {
  visible: boolean;
  onClose: () => void;
  isReposted: boolean;
  onRepost: () => void;
  onQuote: () => void;
};

/** X-style repost menu: „Reposten" / „Repost rückgängig" + „Zitieren". */
export default function RepostDrawer({ visible, onClose, isReposted, onRepost, onQuote }: Props) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Pressable
          onPress={() => {
            onClose();
            onRepost();
          }}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: colors.border },
            pressed && { backgroundColor: colors.pressedOverlay },
          ]}
        >
          <RepostIcon
            width={20}
            height={20}
            color={isReposted ? colors.error : colors.textPrimary}
          />
          <Text style={[styles.rowText, { color: isReposted ? colors.error : colors.textPrimary }]}>
            {isReposted ? 'Repost rückgängig' : 'Reposten'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            onClose();
            onQuote();
          }}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.pressedOverlay },
          ]}
        >
          <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>Zitieren</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
