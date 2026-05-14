import { GoogleG } from "@/components/onboarding";
import { Tokens } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import {
  IBMPlexSans_700Bold,
  useFonts,
} from "@expo-google-fonts/ibm-plex-sans";
import { Ionicons } from "@expo/vector-icons";
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SignInModal({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ IBMPlexSans_700Bold });
  const [isLoading, setIsLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  const translateY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setError(null);
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [visible, translateY]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading("google");
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Native Google Sign-In — see app/auth.tsx for the rationale.
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken ?? null;
      if (!idToken) {
        throw new Error("No identity token received from Google");
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      if (signInError) throw signInError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }
      setError(err?.message || "Failed to sign in with Google");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsLoading("apple");
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Per-request nonce binds Apple's identity token to this single login
      // attempt, preventing replay of intercepted tokens. Apple receives the
      // SHA-256 hash; Supabase verifies against the raw value.
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
        throw new Error("No identity token received from Apple");
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (signInError) throw signInError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      setError(err?.message || "Failed to sign in with Apple");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(null);
    }
  };

  const heroFont = fontsLoaded
    ? { fontFamily: "IBMPlexSans_700Bold" as const }
    : null;
  const showApple = Platform.OS === "ios" && isAppleAvailable;
  const disabled = isLoading !== null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 16 },
              sheetStyle,
            ]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.headerBlock}>
              <Text style={[styles.title, heroFont]}>
                Welcome <Text style={styles.titleAccent}>Back.</Text>
              </Text>
              <Text style={styles.subtitle}>Sign in to continue tracking.</Text>
            </View>

            <View style={styles.buttonsBlock}>
              {showApple && (
                <TouchableOpacity
                  onPress={handleAppleSignIn}
                  disabled={disabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  style={[
                    styles.btn,
                    styles.appleBtn,
                    disabled && styles.btnDisabled,
                  ]}
                >
                  {isLoading === "apple" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={18} color="#fff" />
                      <Text style={[styles.btnLabel, styles.appleBtnLabel]}>
                        Continue with Apple
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleGoogleSignIn}
                disabled={disabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                style={[
                  styles.btn,
                  styles.googleBtn,
                  disabled && styles.btnDisabled,
                ]}
              >
                {isLoading === "google" ? (
                  <ActivityIndicator color={Tokens.textSecondary} />
                ) : (
                  <>
                    <GoogleG size={18} />
                    <Text style={[styles.btnLabel, styles.googleBtnLabel]}>
                      Continue with Google
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (disabled) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                  router.push("/sign-in-email");
                }}
                disabled={disabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Continue with email"
                style={[
                  styles.btn,
                  styles.emailBtn,
                  disabled && styles.btnDisabled,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={Tokens.textPrimary}
                />
                <Text style={[styles.btnLabel, styles.emailBtnLabel]}>
                  Continue with email
                </Text>
              </TouchableOpacity>

              {error && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  style={styles.errorPill}
                >
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color={Tokens.error}
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              )}

              <Text style={styles.legal}>
                By continuing you agree to our{" "}
                <Text
                  style={styles.legalEmph}
                  onPress={() =>
                    WebBrowser.openBrowserAsync("https://notecal.app/terms")
                  }
                >
                  Terms
                </Text>{" "}
                ·{" "}
                <Text
                  style={styles.legalEmph}
                  onPress={() =>
                    WebBrowser.openBrowserAsync("https://notecal.app/privacy")
                  }
                >
                  Privacy
                </Text>
              </Text>

              <Text
                style={styles.attribution}
                onPress={() =>
                  WebBrowser.openBrowserAsync("https://platform.fatsecret.com")
                }
              >
                Powered by fatsecret Platform API
              </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Tokens.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  headerBlock: {
    paddingTop: 12,
    paddingBottom: 28,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.4,
    lineHeight: 40,
    color: Tokens.textPrimary,
  },
  titleAccent: {
    color: Tokens.accent,
  },
  subtitle: {
    fontSize: 15,
    color: Tokens.textSecondary,
    marginTop: 10,
    letterSpacing: -0.1,
  },
  buttonsBlock: {
    gap: 10,
    paddingTop: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 30,
    paddingHorizontal: 22,
    gap: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  appleBtn: {
    backgroundColor: "#000",
  },
  googleBtn: {
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
  },
  btnLabel: {
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  appleBtnLabel: { color: "#fff" },
  googleBtnLabel: { color: Tokens.textPrimary },
  emailBtn: {
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
  },
  emailBtnLabel: { color: Tokens.textPrimary },
  errorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Tokens.errorTint,
    borderRadius: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.error,
    flex: 1,
  },
  legal: {
    fontSize: 12,
    color: Tokens.textTertiary,
    textAlign: "center",
    marginTop: 16,
  },
  legalEmph: {
    color: Tokens.textSecondary,
  },
  attribution: {
    fontSize: 11,
    color: Tokens.textTertiary,
    textAlign: "center",
    marginTop: 6,
  },
});
