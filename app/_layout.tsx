import { AuthProvider, useAuth } from '@/contexts/AuthContext';

import { offlineReconnectService } from '@/services/offlineReconnectService';
import { syncService } from '@/services/syncService';
import { startSyncSubscriber, stopSyncSubscriber } from '@/services/syncSubscriber';
import { useAppStore } from '@/store/app-store';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const goals = useAppStore((s) => s.goals);
  const [firstSyncDone, setFirstSyncDone] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const seg = segments[0];
    const onOnboarding = seg === 'onboarding';
    const isPreAuth = seg === 'get-started' || seg === 'auth' || onOnboarding;

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

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#666" />
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
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <RootLayoutNav />
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
});
