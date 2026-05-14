import { GoogleG } from '@/components/onboarding';
import { Tokens } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { IBMPlexSans_700Bold, useFonts } from '@expo-google-fonts/ibm-plex-sans';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

const SLIDES: ImageSourcePropType[] = [
  require('@/assets/onboarding/screen-1-notes.png'),
  require('@/assets/onboarding/screen-2-nutrition.png'),
  require('@/assets/onboarding/screen-3-progress.png'),
  require('@/assets/onboarding/screen-4-add.png'),
];

const INTERVAL_MS = 3500;
const CROSSFADE_DURATION = 600;
const CROSSFADE_EASING = Easing.bezier(0.2, 0.7, 0.2, 1);
const DOT_DURATION = 300;
const SWIPE_THRESHOLD = 40;
const SWIPE_VELOCITY_THRESHOLD = 400;

function CarouselImage({ source, isActive }: { source: ImageSourcePropType; isActive: boolean }) {
  const opacity = useSharedValue(isActive ? 1 : 0);
  const translateY = useSharedValue(isActive ? 0 : 8);
  const scale = useSharedValue(isActive ? 1 : 0.985);

  useEffect(() => {
    const config = { duration: CROSSFADE_DURATION, easing: CROSSFADE_EASING };
    opacity.value = withTiming(isActive ? 1 : 0, config);
    translateY.value = withTiming(isActive ? 0 : 8, config);
    scale.value = withTiming(isActive ? 1 : 0.985, config);
  }, [isActive, opacity, translateY, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.imageWrapper, animatedStyle]} pointerEvents="none">
      <Image source={source} style={styles.image} resizeMode="contain" />
    </Animated.View>
  );
}

function Dot({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  const width = useSharedValue(isActive ? 22 : 6);

  useEffect(() => {
    width.value = withTiming(isActive ? 22 : 6, { duration: DOT_DURATION });
  }, [isActive, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: isActive ? Tokens.textPrimary : Tokens.textTertiary },
          animatedStyle,
        ]}
      />
    </Pressable>
  );
}

export default function AuthScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ IBMPlexSans_700Bold });
  const [isLoading, setIsLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headlineFont = fontsLoaded ? { fontFamily: 'IBMPlexSans_700Bold' as const } : null;

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

  const startInterval = useMemo(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setIdx((i) => (i + 1) % SLIDES.length);
      }, INTERVAL_MS);
    },
    [],
  );

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, startInterval]);

  const handleDotPress = (i: number) => {
    setIdx(i);
    if (!paused) startInterval();
  };

  const goNext = () => setIdx((i) => (i + 1) % SLIDES.length);
  const goPrev = () => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-20, 20])
    .onBegin(() => {
      runOnJS(setPaused)(true);
    })
    .onEnd((e) => {
      const passedDistance = Math.abs(e.translationX) > SWIPE_THRESHOLD;
      const passedVelocity = Math.abs(e.velocityX) > SWIPE_VELOCITY_THRESHOLD;
      if (passedDistance || passedVelocity) {
        if (e.translationX < 0) {
          runOnJS(goNext)();
        } else {
          runOnJS(goPrev)();
        }
      }
    })
    .onFinalize(() => {
      runOnJS(setPaused)(false);
    });

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading('google');
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Native Google Sign-In. iOS shows the account-picker sheet (or falls
      // back to ASWebAuthenticationSession on google.com if no Google account
      // is configured on the device) — no Supabase domain appears in any
      // prompt. The returned ID token is exchanged with Supabase via
      // signInWithIdToken, matching the Apple flow below.
      //
      // The library is pinned to v14.x (GoogleSignIn iOS 7.x) because newer
      // versions auto-embed an opaque nonce that Supabase rejects.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken ?? null;
      if (!idToken) {
        throw new Error('No identity token received from Google');
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (signInError) throw signInError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }
      setError(err?.message || 'Failed to sign in with Google');
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

      // Generate a per-request nonce to defeat Apple ID-token replay. Apple
      // signs the SHA-256 hash and embeds it in the JWT; Supabase verifies the
      // raw nonce matches.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
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

  const showApple = Platform.OS === 'ios' && isAppleAvailable;

  const handleBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />

      <TouchableOpacity
        onPress={handleBack}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
      </TouchableOpacity>

      <View style={styles.headlineContainer}>
        <Text style={[styles.headline, headlineFont]}>
          Start tracking <Text style={styles.headlineAccent}>today.</Text>
        </Text>
      </View>

      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={styles.imageStack}>
          {SLIDES.map((src, i) => (
            <CarouselImage key={i} source={src} isActive={i === idx} />
          ))}
        </Animated.View>
      </GestureDetector>

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <Dot key={i} isActive={i === idx} onPress={() => handleDotPress(i)} />
        ))}
      </View>

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
          By continuing you agree to our{' '}
          <Text
            style={styles.legalEmph}
            onPress={() => WebBrowser.openBrowserAsync('https://notecal.app/terms')}
          >
            Terms
          </Text>{' '}
          ·{' '}
          <Text
            style={styles.legalEmph}
            onPress={() => WebBrowser.openBrowserAsync('https://notecal.app/privacy')}
          >
            Privacy
          </Text>
        </Text>

        <Text
          style={styles.attribution}
          onPress={() => WebBrowser.openBrowserAsync('https://platform.fatsecret.com')}
        >
          Powered by fatsecret Platform API
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
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    marginTop: 4,
  },
  headlineContainer: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  headline: {
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -1,
    fontWeight: '700',
    color: Tokens.textPrimary,
    textAlign: 'center',
  },
  headlineAccent: {
    color: Tokens.accent,
  },
  imageStack: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    paddingTop: 16,
    paddingBottom: 8,
  },
  imageWrapper: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.1,
        shadowRadius: 40,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  dot: {
    height: 6,
    borderRadius: 3,
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
  attribution: {
    fontSize: 11,
    color: Tokens.textTertiary,
    textAlign: 'center',
    marginTop: 6,
  },
});
