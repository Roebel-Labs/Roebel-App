import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { goToTab } from '@/lib/navigation/tabBar';

export function useGoBack() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      goToTab('home');
    }
  }, [router]);
}
