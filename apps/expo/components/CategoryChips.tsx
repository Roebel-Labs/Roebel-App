import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet, View } from 'react-native';
import { categoryAssetIcons, CommunitySvg } from './AssetIcons';
import { useTheme } from '@/context/ThemeContext';

type CategoryChip = {
  id: string;
  label: string;
  iconComponent: React.FC<{ size?: number; color?: string; }>;
};

type Props = {
  categories: string[];
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
};

export default function CategoryChips({ categories, selectedCategory, onCategorySelect }: Props) {
  const { colors } = useTheme();

  // Toggle category selection - if same category is clicked, deselect it
  const handleCategoryPress = (category: string) => {
    if (selectedCategory === category) {
      // Deselect if already selected
      onCategorySelect('');
    } else {
      // Select the category
      onCategorySelect(category);
    }
  };

  // Remove the 'all' category - only show actual categories
  const categoryChips: CategoryChip[] = categories.map(cat => ({
    id: cat,
    label: cat,
    iconComponent: categoryAssetIcons[cat] || CommunitySvg // Default to community icon
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scrollView}
    >
      {categoryChips.map((chip) => {
        const isSelected = selectedCategory === chip.id;
        const IconComponent = chip.iconComponent;
        return (
          <Pressable
            key={chip.id}
            onPress={() => handleCategoryPress(chip.id)}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.chipPressed
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <View style={[
              styles.iconContainer,
              { backgroundColor: colors.surfaceSecondary },
              isSelected && { backgroundColor: colors.tabIconActive }
            ]}>
              <IconComponent
                size={24}
                color={isSelected ? colors.onPrimary : colors.tabIconActive}
              />
            </View>
            <Text style={[
              styles.chipText,
              { color: colors.textPrimary },
              isSelected && { fontFamily: 'Inter-Medium' }
            ]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    marginBottom: 10,
  },
  container: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 8,
    gap: 20,
  },
  chip: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start', // Align to top for consistent layout
    width: 70,
    minHeight: 80, // Fixed height to prevent layout shifts with multi-line labels
    gap: 8,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipPressed: {
    transform: [{ scale: 0.95 }],
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 14, // Tighter line height for multi-line labels
    flexShrink: 1, // Allow text to shrink if needed
  },
});
