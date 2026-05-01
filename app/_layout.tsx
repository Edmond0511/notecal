import { AuthProvider, useAuth } from '@/contexts/AuthContext';

import { offlineReconnectService } from '@/services/offlineReconnectService';
import { syncService } from '@/services/syncService';
import { startSyncSubscriber, stopSyncSubscriber } from '@/services/syncSubscriber';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const seg = segments[0];
    const inPreAuthFlow =
      seg === 'get-started' || seg === 'auth' || seg === 'onboarding';

    if (!isAuthenticated && !inPreAuthFlow) {
      router.replace('/get-started');
    } else if (isAuthenticated && inPreAuthFlow) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Start offline reconnect service after auth loading resolves
  useEffect(() => {
    if (!isLoading) {
      offlineReconnectService.start();
    }
    return () => offlineReconnectService.stop();
  }, [isLoading]);

  // Start sync subscriber + cold-start sync when authenticated
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    startSyncSubscriber();
    syncService.fullSync(); // Sync on cold start

    return () => {
      stopSyncSubscriber();
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
