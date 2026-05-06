import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  title: string;
  body?: string;
};

const DEFAULT_BODY =
  'Inhalte werden vom Ausschuss für Kultur und Tourismus auf Qualität für Röbel geprüft.';

export function QualityStampSection({ title, body = DEFAULT_BODY }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/illustration/stamp.png')}
        style={styles.stamp}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 16,
  },
  stamp: { width: 140, height: 140 },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
