import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function MarketplaceRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    router.replace({ pathname: '/create-listing', params });
  }, []);

  return null;
}
