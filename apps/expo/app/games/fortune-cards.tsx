import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import FortuneCardsGame from '@/components/games/FortuneCardsGame';

export default function FortuneCardsScreen() {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FortuneCardsGame />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
