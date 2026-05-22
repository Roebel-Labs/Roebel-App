import React from 'react';
import { Modal, View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Category = { id: string; name: string };

type Props = {
  visible: boolean;
  categories: Category[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export default function MenuCategoriesSheet({ visible, categories, activeIndex, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter-Medium', fontSize: 16 }}>Schließen</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Kategorien</Text>
          <View style={{ width: 60 }} />
        </View>

        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => {
            const active = index === activeIndex;
            return (
              <Pressable
                onPress={() => onSelect(index)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: colors.border, backgroundColor: pressed ? colors.pressedOverlay : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.rowText,
                    { color: active ? colors.primary : colors.textPrimary },
                    active && { fontFamily: 'Inter-Medium' },
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontFamily: 'Inter-Medium' },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 16, fontFamily: 'Inter-Regular' },
});
