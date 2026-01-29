import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  StatusBar,
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
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

WebBrowser.maybeCompleteAuthSession();

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
}

export function AuthModal({ visible, onClose, onAuthSuccess }: AuthModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const [isLoading, setIsLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isScrolledToTop.value && event.translationY > 0) {
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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  React.useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setError(null);
    }
  }, [visible]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading("google");
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "notecal://auth/callback",
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "notecal://auth/callback"
        );

        if (result.type === "success") {
          const url = result.url;
          // Extract tokens from URL and set session
          const params = new URLSearchParams(url.split("#")[1]);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onAuthSuccess?.();
            onClose();
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
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

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        if (error) throw error;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAuthSuccess?.();
        onClose();
      }
    } catch (err: any) {
      if (err.code !== "ERR_REQUEST_CANCELED") {
        setError(err.message || "Failed to sign in with Apple");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />

        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.container, { marginTop: insets.top }, animatedStyle]}
          >
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Content */}
            <View style={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
              {/* Logo & Branding */}
              <Animated.View
                entering={FadeInDown.delay(100).duration(500)}
                style={styles.brandingContainer}
              >
                <View style={styles.logoContainer}>
                  <Text style={styles.logoIcon}>🥗</Text>
                </View>
                <Text style={styles.appName}>NoteCal</Text>
                <Text style={styles.tagline}>Track nutrition effortlessly</Text>
              </Animated.View>

              {/* Welcome Text */}
              <Animated.View
                entering={FadeInDown.delay(200).duration(500)}
                style={styles.welcomeContainer}
              >
                <Text style={styles.welcomeTitle}>Welcome</Text>
                <Text style={styles.welcomeSubtitle}>
                  Sign in to sync your food diary across devices and unlock premium features.
                </Text>
              </Animated.View>

              {/* Auth Buttons */}
              <Animated.View
                entering={FadeInDown.delay(300).duration(500)}
                style={styles.buttonsContainer}
              >
                {/* Google Sign In */}
                <TouchableOpacity
                  style={styles.authButton}
                  onPress={handleGoogleSignIn}
                  disabled={isLoading !== null}
                  activeOpacity={0.8}
                >
                  {isLoading === "google" ? (
                    <ActivityIndicator size="small" color="#1a1a1a" />
                  ) : (
                    <>
                      <View style={styles.googleIconContainer}>
                        <Text style={styles.googleIcon}>G</Text>
                      </View>
                      <Text style={styles.authButtonText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Apple Sign In - iOS only */}
                {Platform.OS === "ios" && (
                  <TouchableOpacity
                    style={[styles.authButton, styles.appleButton]}
                    onPress={handleAppleSignIn}
                    disabled={isLoading !== null}
                    activeOpacity={0.8}
                  >
                    {isLoading === "apple" ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="logo-apple" size={20} color="#ffffff" />
                        <Text style={[styles.authButtonText, styles.appleButtonText]}>
                          Continue with Apple
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </Animated.View>

              {/* Error Message */}
              {error && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              )}

              {/* Terms */}
              <Animated.Text
                entering={FadeInDown.delay(400).duration(500)}
                style={styles.termsText}
              >
                By continuing, you agree to our{" "}
                <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Animated.Text>

              {/* Skip for now */}
              <Animated.View entering={FadeInDown.delay(500).duration(500)}>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skipButtonText}>Continue without account</Text>
                </TouchableOpacity>
              </Animated.View>
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
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backdropPressable: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#888",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  brandingContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  logoIcon: {
    fontSize: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -1,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  welcomeContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  authButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  googleIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4285F4",
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  appleButton: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  appleButtonText: {
    color: "#ffffff",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "500",
  },
  termsText: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  termsLink: {
    color: "#666",
    fontWeight: "600",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
});
