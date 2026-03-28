import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import MeckyJumpGame from '@/components/games/MeckyJumpGame';

export default function MeckyJumpScreen() {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <MeckyJumpGame />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
