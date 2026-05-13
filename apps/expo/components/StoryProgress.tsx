import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  step: number;
  totalSteps: number;
};

export default function StoryProgress({ step, totalSteps }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const filled = i < step;
        return (
          <View
            key={i}
            style={[
              styles.pill,
              { backgroundColor: filled ? colors.textPrimary : colors.border },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 24,
  },
  pill: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
});
