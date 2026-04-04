import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BookmarksProvider } from '@/context/BookmarksContext';
import { LocationProvider } from '@/context/LocationContext';
import { GovernanceTestProvider } from '@/context/GovernanceTestContext';
import { AppModeProvider } from '@/context/AppModeContext';
import { RoebelCardProvider } from '@/context/RoebelCardContext';
import { SnackbarProvider } from '@/context/SnackbarContext';
import { VerificationProvider } from '@/context/VerificationContext';
import { UserProvider, useUser } from '@/context/UserContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { MessagingProvider } from '@/context/MessagingContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { MeckyProvider } from '@/context/MeckyContext';
import { StatusBar, View, StyleSheet, Text, Platform } from 'react-native';
import useInterFonts from '@/hooks/useFonts';
import * as SplashScreen from 'expo-splash-screen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ThirdwebProvider } from 'thirdweb/react';
import { client } from '../constants/thirdweb';
import { useScreenTracking } from '@/hooks/useAnalytics';

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
 * Inner layout that can access ThemeContext
 */
function ThemedLayout() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <NotificationHandler />
      <AnalyticsTracker />
      <View style={[styles.gradientContainer, { backgroundColor: colors.background }]}>
        <Stack
          screenOptions={{
            animation: 'fade',
            animationDuration: 0,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="explore" options={{ headerShown: false }} />
          <Stack.Screen name="location" options={{ headerShown: false }} />
          <Stack.Screen name="governance" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="design-system" options={{ headerShown: false }} />
          <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="category/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="proposal/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="news/index" options={{ headerShown: false }} />
          <Stack.Screen name="news/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/index" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="restaurant/menu/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="submit" options={{ title: 'Veranstaltung einreichen' }} />
          <Stack.Screen name="submit-event" options={{ headerShown: false }} />
          <Stack.Screen name="feedback" options={{ headerShown: false }} />
          <Stack.Screen name="verification/my-request" options={{ headerShown: false }} />
          <Stack.Screen name="verification/request-citizen" options={{ headerShown: false }} />
          <Stack.Screen name="notifications/index" options={{ headerShown: false }} />
          <Stack.Screen name="notifications/settings" options={{ headerShown: false }} />
          <Stack.Screen name="messages/index" options={{ headerShown: false }} />
          <Stack.Screen name="messages/[conversationId]" options={{ headerShown: false }} />
          <Stack.Screen name="messages/new" options={{ headerShown: false }} />
          <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
          <Stack.Screen name="business/register" options={{ headerShown: false }} />
          <Stack.Screen name="business/dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="business/analytics" options={{ headerShown: false }} />
          <Stack.Screen name="business/deals/create" options={{ headerShown: false }} />
          <Stack.Screen name="business/deals/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="deals/index" options={{ headerShown: false }} />
          <Stack.Screen name="deals/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="marketplace/index" options={{ headerShown: false }} />
          <Stack.Screen name="marketplace/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="businesses/index" options={{ headerShown: false }} />
          <Stack.Screen name="user/[username]" options={{ headerShown: false }} />
          <Stack.Screen name="create" options={{ headerShown: false }} />
          <Stack.Screen name="ai-submit" options={{ headerShown: false }} />
          <Stack.Screen name="messages/mecky" options={{ headerShown: false }} />
          <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="games/mecky-jump" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="games/mecky-portal" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="games/speedrun" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="games/fortune-cards" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="wallet" options={{ headerShown: false }} />
          <Stack.Screen name="explorer" options={{ headerShown: false }} />
          <Stack.Screen name="machs-in-roebel" options={{ headerShown: false }} />
          <Stack.Screen name="stamp-scan" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    </>
  );
}

function AppModeWrapper({ children }: { children: React.ReactNode }) {
  const { role, isCitizen, isBusinessOwner } = useUser();
  return (
    <AppModeProvider role={role} isCitizen={isCitizen} isBusinessOwner={isBusinessOwner}>
      <RoebelCardProvider>
        {children}
      </RoebelCardProvider>
    </AppModeProvider>
  );
}

export default function Layout() {
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
      <ThirdwebProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ThemeProvider>
              <MessagingProvider>
                <NotificationsProvider>
                  <VerificationProvider>
                    <UserProvider>
                    <MeckyProvider>
                    <GovernanceTestProvider>
                    <AppModeWrapper>
                    <BookmarksProvider>
                      <LocationProvider>
                        <SnackbarProvider>
                          <ThemedLayout />
                        </SnackbarProvider>
                      </LocationProvider>
                    </BookmarksProvider>
                    </AppModeWrapper>
                    </GovernanceTestProvider>
                    </MeckyProvider>
                    </UserProvider>
                  </VerificationProvider>
                </NotificationsProvider>
              </MessagingProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThirdwebProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
});
