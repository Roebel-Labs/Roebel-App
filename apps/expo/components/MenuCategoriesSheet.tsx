import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import BottomDrawer from './BottomDrawer';

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
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.7}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Kategorien</Text>
      </View>
      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        showsVerticalScrollIndicator={false}
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
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    paddingBottom: 12,
    alignItems: 'center',
  },
  title: { fontSize: 16, fontFamily: 'Inter-Medium' },
  row: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 16, fontFamily: 'Inter-Regular' },
});
