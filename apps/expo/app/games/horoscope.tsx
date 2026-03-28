import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import HoroscopeGame from '@/components/games/HoroscopeGame';

export default function HoroscopeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <HoroscopeGame />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0c29',
  },
});
