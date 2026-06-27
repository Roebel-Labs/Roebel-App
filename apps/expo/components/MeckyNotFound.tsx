import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  onPress?: () => void;
};

export default function MeckyNotFound({
  title = "Hier gibt's nichts zu finden",
  subtitle = 'Mecky geht dem auf die Spur.',
  buttonLabel = 'Zurück zur Startseite',
  onPress,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = onPress ?? (() => router.replace('/'));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Image
          source={require('@/assets/illustration/mecky/not_found.png')}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handlePress}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  image: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
