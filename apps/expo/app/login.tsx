import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  // const { isConnected } = useWallet();

  // // Navigate back to profile when connected
  // useEffect(() => {
  //   if (isConnected) {
  //     router.replace('/profile');
  //   }
  // }, [isConnected, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Anmelden</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.welcomeSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Wallet-Funktion vorübergehend deaktiviert</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Die Wallet-Anmeldung ist aufgrund technischer Kompatibilitätsprobleme vorübergehend nicht verfügbar.{'\n\n'}
            Alle Event-Features (Durchsuchen, Bookmarks, Standort) funktionieren weiterhin normal.
          </Text>
        </View>

        {/* TEMPORARILY DISABLED: Wallet connect UI */}
        {/* <View style={styles.connectContainer}>
          <ConnectEmbed
            client={client}
            wallets={wallets}
            theme={{...}}
          />
        </View> */}

        <View style={styles.connectContainer}>
          <Pressable
            style={styles.backToAppButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backToAppButtonText}>Zurück zur App</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  welcomeSection: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  connectContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  link: {
    fontFamily: 'Inter-Medium',
  },
  backToAppButton: {
    backgroundColor: '#374453',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  backToAppButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
});
