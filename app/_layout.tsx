import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { offlineReconnectService } from '@/services/offlineReconnectService';
import { syncService } from '@/services/syncService';
import { startSyncSubscriber, stopSyncSubscriber } from '@/services/syncSubscriber';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState as RNAppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthScreen) {
      // Redirect to auth if not authenticated and not already on auth screen
      router.replace('/auth');
    } else if (isAuthenticated && inAuthScreen) {
      // Redirect to main app if authenticated and on auth screen
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

  // Start sync subscriber + foreground sync when authenticated
  const appStateRef = useRef(RNAppState.currentState);
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    startSyncSubscriber();

    const sub = RNAppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        syncService.fullSync();
      }
      appStateRef.current = nextState;
    });

    return () => {
      stopSyncSubscriber();
      sub.remove();
    };
  }, [isLoading, isAuthenticated]);

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
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
