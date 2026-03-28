import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  isTestingEnabled: boolean;
  onPress: () => void;
};

export default function GovernanceTestBanner({ isTestingEnabled, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.primaryLight },
        pressed && styles.containerPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Wir testen digitale</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Bürgerabstimmungen</Text>
          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={onPress}>
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
              {isTestingEnabled ? 'Test deaktivieren' : 'Jetzt testen'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.illustrationContainer}>
          <Image
            source={require('@/assets/illustration/pass.png')}
            style={styles.illustration}
            resizeMode="contain"
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    marginHorizontal: 16,
  },
  containerPressed: {
    opacity: 0.8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    lineHeight: 24,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  illustrationContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
});
