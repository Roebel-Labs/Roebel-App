import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import MeckyNotFound from '@/components/MeckyNotFound';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <MeckyNotFound />
      </SafeAreaView>
    </>
  );
}
