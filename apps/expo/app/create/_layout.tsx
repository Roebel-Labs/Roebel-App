import { Stack } from 'expo-router';
import { CreatePostProvider } from '@/context/CreatePostContext';

export default function CreateLayout() {
  return (
    <CreatePostProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </CreatePostProvider>
  );
}
