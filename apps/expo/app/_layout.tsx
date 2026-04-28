import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { extractReferralCode, storePendingReferralCode } from '@/lib/referral-deeplink';
import { TransitionStack } from '@/lib/navigation/TransitionStack';
import { noTransition } from '@/lib/navigation/transitionPresets';
import { BookmarksProvider } from '@/context/BookmarksContext';
import { InterestProvider } from '@/context/InterestContext';
import { LocationProvider } from '@/context/LocationContext';
import { GovernanceTestProvider } from '@/context/GovernanceTestContext';
import { AccountProvider } from '@/context/AccountContext';
import { SnackbarProvider } from '@/context/SnackbarContext';
import { VerificationProvider } from '@/context/VerificationContext';
import { UserProvider } from '@/context/UserContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { MessagingProvider } from '@/context/MessagingContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { MeckyProvider } from '@/context/MeckyContext';
import { RewardsProvider } from '@/context/RewardsContext';
import { useDeferredTaskTriggers } from '@/hooks/useDeferredTaskTriggers';
import { StatusBar, View, StyleSheet, Text, Platform } from 'react-native';
import '@/lib/patch-text';
import useInterFonts from '@/hooks/useFonts';
import * as SplashScreen from 'expo-splash-screen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ThirdwebProvider, AutoConnect } from 'thirdweb/react';
import { client, chain } from '../constants/thirdweb';
import { useScreenTracking } from '@/hooks/useAnalytics';
import { wallets } from '@/constants/wallets';
import { ConsentProvider } from '@/context/ConsentContext';
import { ConditionalPostHogProvider } from '@/components/consent/ConditionalPostHogProvider';
import { ConsentGate } from '@/components/consent/ConsentGate';
import { PostHogTelemetry } from '@/components/consent/PostHogTelemetry';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Check for OTA updates on native platforms
if (Platform.OS !== 'web') {
  const Updates = require('expo-updates');
  Updates.checkForUpdateAsync()
    .then((update: any) => {
      if (update.isAvailable) {
        return Updates.fetchUpdateAsync().then(() => Updates.reloadAsync());
      }
    })
    .catch(() => {
      // silently fail — user continues with current version
    });
}

// Native-only: lock orientation and configure notifications
if (Platform.OS !== 'web') {
  const ScreenOrientation = require('expo-screen-orientation');
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Component to handle notification deep linking (native only)
 */
function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const Notifications = require('expo-notifications');

    // Handle notification response when app is open
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data;

      if (data?.type === 'event' && data?.eventId) {
        router.push(`/event/${data.eventId}` as any);
      } else if (data?.type === 'news' && data?.slug) {
        router.push(`/news/${data.slug}` as any);
      } else if (data?.type === 'reward') {
        router.push('/rewards' as any);
      }
    });

    // Handle notification that opened the app from closed state
    Notifications.getLastNotificationResponseAsync().then((response: any) => {
      if (response) {
        const data = response.notification.request.content.data;

        if (data?.type === 'event' && data?.eventId) {
          setTimeout(() => {
            router.push(`/event/${data.eventId}` as any);
          }, 100);
        } else if (data?.type === 'news' && data?.slug) {
          setTimeout(() => {
            router.push(`/news/${data.slug}` as any);
          }, 100);
        } else if (data?.type === 'reward') {
          setTimeout(() => {
            router.push('/rewards' as any);
          }, 100);
        }
      }
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}

/**
 * Component to handle Firebase Analytics screen tracking
 */
function AnalyticsTracker() {
  useScreenTracking();
  return null;
}

/**
 * Captures referral deep-links (roebel://r/<code> and
 * https://www.roebel.app/r/<code>) and stores the code for the next login to
 * redeem. Also pushes the /rewards/referral screen so the user sees the hero
 * immediately when they land from a shared link.
 */
function ReferralDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const handle = async (url: string | null) => {
      const code = extractReferralCode(url);
      if (!code) return;
      await storePendingReferralCode(code);
      setTimeout(() => router.push('/rewards/referral' as any), 200);
    };

    // Initial URL (cold start).
    Linking.getInitialURL()
      .then((url) => handle(url))
      .catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      void handle(event.url);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

/**
 * Observes user/permission state and auto-completes onboarding rewards tasks.
 */
function RewardsTaskTriggers() {
  useDeferredTaskTriggers();
  return null;
}

/**
 * Inner layout that can access ThemeContext
 */
function AutoConnectHandler() {
  return (
    <AutoConnect
      client={client}
      wallets={wallets}
      timeout={15000}
      onConnect={(wallet) => {
        if (__DEV__) {
          console.log('[thirdweb] auto-connect ✓', {
            walletId: wallet.id,
            address: wallet.getAccount()?.address,
          });
        }
      }}
    />
  );
}

function ThemedLayout() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <NotificationHandler />
      <AnalyticsTracker />
      <PostHogTelemetry />
      <RewardsTaskTriggers />
      <ReferralDeepLinkHandler />
      <View style={[styles.gradientContainer, { backgroundColor: colors.background }]}>
        <TransitionStack screenOptions={{ headerShown: false, animation: 'none' }}>
          <TransitionStack.Screen
            name="submit"
            options={{ headerShown: true, title: 'Veranstaltung einreichen', animation: 'none' }}
          />
          <TransitionStack.Screen name="games/mecky-jump" options={noTransition()} />
          <TransitionStack.Screen name="games/mecky-portal" options={noTransition()} />
          <TransitionStack.Screen name="games/speedrun" options={noTransition()} />
          <TransitionStack.Screen name="games/fortune-cards" options={noTransition()} />
          <TransitionStack.Screen
            name="welcome"
            options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
          />
          <TransitionStack.Screen
            name="consent"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              animation: 'fade',
              gestureEnabled: false,
            }}
          />
          <TransitionStack.Screen name="settings/consent/index" options={{ headerShown: false }} />
          <TransitionStack.Screen name="settings/consent/[category]" options={{ headerShown: false }} />
          <TransitionStack.Screen name="settings/consent/history" options={{ headerShown: false }} />
          <TransitionStack.Screen name="rewards" options={{ headerShown: false }} />
        </TransitionStack>
      </View>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    </>
  );
}

function Layout() {
  const { fontsLoaded, fontError } = useInterFonts();

  React.useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Show error state if fonts fail to load
  if (fontError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#ffffff' }}>
        <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 16, color: '#000000' }}>Font Loading Error</Text>
        <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
          Die Schriftarten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
        </Text>
        <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 16, textAlign: 'center' }}>
          {fontError.message}
        </Text>
      </View>
    );
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <ConsentProvider>
              <ConditionalPostHogProvider>
                <ThirdwebProvider>
                  <AutoConnectHandler />
                  <MessagingProvider>
                    <VerificationProvider>
                      <UserProvider>
                      <AccountProvider>
                      <NotificationsProvider>
                      <RewardsProvider>
                      <MeckyProvider>
                      <GovernanceTestProvider>
                      <InterestProvider>
                      <BookmarksProvider>
                        <LocationProvider>
                          <SnackbarProvider>
                            <ConsentGate />
                            <ThemedLayout />
                          </SnackbarProvider>
                        </LocationProvider>
                      </BookmarksProvider>
                      </InterestProvider>
                      </GovernanceTestProvider>
                      </MeckyProvider>
                      </RewardsProvider>
                      </NotificationsProvider>
                      </AccountProvider>
                      </UserProvider>
                    </VerificationProvider>
                  </MessagingProvider>
                </ThirdwebProvider>
              </ConditionalPostHogProvider>
            </ConsentProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

// Sentry is initialized manually inside ConsentGate when the user opts in to
// crash reporting. See lib/sentry-init.ts.
export default Layout;

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
});
