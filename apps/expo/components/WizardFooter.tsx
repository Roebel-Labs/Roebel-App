import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  step: number;
  totalSteps?: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextContent?: React.ReactNode;
};

export default function WizardFooter({
  step,
  totalSteps = 6,
  onBack,
  onNext,
  nextLabel = 'Weiter',
  nextDisabled = false,
  nextContent,
}: Props) {
  const { colors } = useTheme();
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: (step / totalSteps) * 100,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [step]);

  return (
    <View>
      {/* Progress bar as top border of footer */}
      <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.primary,
              width: widthAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Button row */}
      <View style={styles.buttonRow}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Zurück</Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          disabled={nextDisabled}
          style={[
            styles.nextButton,
            { backgroundColor: colors.primary },
            nextDisabled && styles.disabled,
          ]}
        >
          {nextContent || (
            <Text style={[styles.nextText, { color: colors.onPrimary }]}>{nextLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    height: 3,
  },
  progressFill: {
    height: 3,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  nextButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  nextText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  disabled: {
    opacity: 0.5,
  },
});
