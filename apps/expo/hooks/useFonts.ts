import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

export default function useInterFonts() {
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('@/assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('@/assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('@/assets/fonts/Inter-SemiBold.ttf'),
    'GeistMono-Regular': require('@/assets/fonts/GeistMono-Regular.ttf'),
    'GeistMono-Medium': require('@/assets/fonts/GeistMono-Medium.ttf'),
  });

  useEffect(() => {
    if (fontError) {
      console.error('Font loading error:', fontError);
      setLoadError(fontError);
    }
  }, [fontError]);

  return { fontsLoaded, fontError: loadError };
}
