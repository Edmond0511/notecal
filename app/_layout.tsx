import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';

import { offlineReconnectService } from '@/services/offlineReconnectService';
import { syncService } from '@/services/syncService';
import { startSyncSubscriber, stopSyncSubscriber } from '@/services/syncSubscriber';
import { useAppStore } from '@/store/app-store';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const goals = useAppStore((s) => s.goals);
  const [firstSyncDone, setFirstSyncDone] = useState(false);
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  useEffect(() => {
    if (isLoading) return;

    const seg = segments[0];
    const onOnboarding = seg === 'onboarding';
    const isPreAuth =
      seg === 'get-started' ||
      seg === 'auth' ||
      seg === 'sign-in-email' ||
      seg === 'forgot-password' ||
      onOnboarding;

    if (!isAuthenticated) {
      if (!isPreAuth) router.replace('/get-started');
      return;
    }

    // Authenticated: wait for first server sync before deciding onboarding gate.
    if (!firstSyncDone) return;

    const needsOnboarding = !goals;

    if (needsOnboarding && !onOnboarding) {
      router.replace('/onboarding');
    } else if (!needsOnboarding && isPreAuth) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, segments, goals, firstSyncDone]);

  // Start offline reconnect service after auth loading resolves
  useEffect(() => {
    if (!isLoading) {
      offlineReconnectService.start();
    }
    return () => offlineReconnectService.stop();
  }, [isLoading]);

  // Start sync subscriber + cold-start sync when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setFirstSyncDone(false);
      return;
    }
    if (isLoading) return;

    startSyncSubscriber();

    // Health: start subscriber + observer if enabled, run cold-start sync
    let cancelled = false;
    (async () => {
      const { startHealthSubscriber } = await import('@/services/healthkit/healthSubscriber');
      const { healthSyncService } = await import('@/services/healthkit/healthSyncService');
      const { getHealthSettings } = await import('@/services/healthkit/healthSettings');
      if (cancelled) return;
      if (getHealthSettings().healthEnabled) {
        startHealthSubscriber();
        healthSyncService.startWeightObserver();
        healthSyncService.fullHealthSync();
      }
    })();

    syncService.fullSync().finally(() => setFirstSyncDone(true));

    return () => {
      cancelled = true;
      stopSyncSubscriber();
      (async () => {
        const { stopHealthSubscriber } = await import('@/services/healthkit/healthSubscriber');
        const { healthSyncService } = await import('@/services/healthkit/healthSyncService');
        stopHealthSubscriber();
        healthSyncService.stopWeightObserver();
      })();
    };
  }, [isLoading, isAuthenticated]);

  const [splashVisible, setSplashVisible] = useState(true);
  const splashOpacity = useSharedValue(1);

  useEffect(() => {
    if (isLoading || !fontsLoaded || !splashVisible) return;
    splashOpacity.value = withTiming(
      0,
      { duration: 400, easing: Easing.bezier(0.2, 0.7, 0.2, 1) },
      (finished) => {
        if (finished) runOnJS(setSplashVisible)(false);
      },
    );
  }, [isLoading, fontsLoaded, splashVisible, splashOpacity]);

  const splashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  // Until fonts load, render only the static splash mirror so route text never
  // flashes in the system font before swapping to IBM Plex Sans.
  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="get-started" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="sign-in-email" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      {splashVisible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.loadingContainer, StyleSheet.absoluteFillObject, splashAnimatedStyle]}
        >
          <Image
            source={require('@/assets/images/splash-icon.png')}
            style={styles.loadingLogo}
            resizeMode="contain"
          />
        </Animated.View>
      )}
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <RootLayoutNav />
          </SubscriptionProvider>
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingLogo: {
    width: 200,
    height: 200,
  },
});
