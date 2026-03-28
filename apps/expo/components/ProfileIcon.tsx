import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { UserIcon } from '@/components/Icons';
import { useRouter } from 'expo-router';

export default function ProfileIcon() {
  const router = useRouter();

  const handlePress = () => {
    router.push('/profile');
  };

  return (
    <Pressable
      style={styles.actionBtn}
      accessibilityLabel="Profil öffnen"
      onPress={handlePress}
    >
      <UserIcon size={20} color="#374453" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    backgroundColor: '#f5f5f5',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
