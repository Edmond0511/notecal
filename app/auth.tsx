import { GoogleG } from '@/components/onboarding';
import { Tokens } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { IBMPlexSans_700Bold, useFonts } from '@expo-google-fonts/ibm-plex-sans';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const [fontsLoaded] = useFonts({ IBMPlexSans_700Bold });
  const [isLoading, setIsLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading('google');
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'notecal://auth/callback',
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, 'notecal://auth/callback');

        if (result.type === 'success') {
          const url = result.url;
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');

          if (code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
            if (sessionError) throw sessionError;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            const hashParams = new URLSearchParams(url.split('#')[1] || '');
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              setError('Authentication failed - please try again');
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsLoading('apple');
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (signInError) throw signInError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') return;
      setError(err.message || 'Failed to sign in with Apple');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(null);
    }
  };

  const heroFont = fontsLoaded ? { fontFamily: 'IBMPlexSans_700Bold' as const } : null;
  const showApple = Platform.OS === 'ios' && isAppleAvailable;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />

      <View style={styles.eyebrowWrap}>
        <Text style={styles.eyebrow}>NoteCal</Text>
      </View>

      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.wordmarkWrap}>
        <Text style={[styles.wordmark, heroFont]}>Eat.</Text>
        <Text style={[styles.wordmark, heroFont]}>Type.</Text>
        <Text style={[styles.wordmark, heroFont, styles.wordmarkAccent]}>Track.</Text>
        <Text style={styles.tagline}>
          A calorie tracker that feels like a notes app — because it is one.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.bottom}>
        {showApple && (
          <TouchableOpacity
            onPress={handleAppleSignIn}
            disabled={isLoading !== null}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            style={[styles.btn, styles.appleBtn]}
          >
            <View style={styles.btnLeft}>
              {isLoading === 'apple' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color="#fff" />
                  <Text style={[styles.btnLabel, styles.appleBtnLabel]}>Continue with Apple</Text>
                </>
              )}
            </View>
            {isLoading !== 'apple' && (
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleGoogleSignIn}
          disabled={isLoading !== null}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          style={[styles.btn, styles.googleBtn]}
        >
          <View style={styles.btnLeft}>
            {isLoading === 'google' ? (
              <ActivityIndicator color={Tokens.textSecondary} />
            ) : (
              <>
                <GoogleG size={18} />
                <Text style={[styles.btnLabel, styles.googleBtnLabel]}>Continue with Google</Text>
              </>
            )}
          </View>
          {isLoading !== 'google' && (
            <Ionicons name="arrow-forward" size={16} color={Tokens.textPrimary} />
          )}
        </TouchableOpacity>

        {error && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.errorPill}>
            <Ionicons name="alert-circle" size={16} color={Tokens.error} />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}

        <Text style={styles.legal}>
          By continuing you agree to our <Text style={styles.legalEmph}>Terms</Text> ·{' '}
          <Text style={styles.legalEmph}>Privacy</Text>
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.background,
    paddingHorizontal: 24,
  },
  eyebrowWrap: {
    paddingTop: 12,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    color: Tokens.textSecondary,
    textTransform: 'uppercase',
  },
  wordmarkWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 32,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1.4,
    lineHeight: 40,
    color: Tokens.textPrimary,
  },
  wordmarkAccent: {
    color: Tokens.accent,
  },
  tagline: {
    fontSize: 15,
    color: Tokens.textSecondary,
    marginTop: 12,
    letterSpacing: -0.1,
  },
  bottom: {
    paddingBottom: 40,
    gap: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    borderRadius: 30,
    paddingHorizontal: 22,
  },
  btnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appleBtn: {
    backgroundColor: '#000',
  },
  googleBtn: {
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
  },
  btnLabel: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  appleBtnLabel: { color: '#fff' },
  googleBtnLabel: { color: Tokens.textPrimary },
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Tokens.errorTint,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
    color: Tokens.error,
    flex: 1,
  },
  legal: {
    fontSize: 12,
    color: Tokens.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
  legalEmph: {
    color: Tokens.textSecondary,
  },
});
