import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
};

export default function PostOptionsDrawer({
  visible,
  onClose,
  isOwner,
  onEdit,
  onDelete,
  onReport,
}: Props) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.25}>
      <View style={styles.container}>
        {isOwner ? (
          <>
            <Pressable
              onPress={() => {
                onClose();
                onEdit();
              }}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.pressedOverlay },
              ]}
            >
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>Bearbeiten</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onClose();
                onDelete();
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.pressedOverlay },
              ]}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={[styles.rowText, { color: colors.error }]}>Löschen</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => {
              onClose();
              onReport();
            }}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.pressedOverlay },
            ]}
          >
            <Ionicons name="flag-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Melden</Text>
          </Pressable>
        )}
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
