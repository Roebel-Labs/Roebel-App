import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function HelpLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Inter-Medium', fontSize: 16 },
        headerShadowVisible: false,
      }}
    />
  );
}
