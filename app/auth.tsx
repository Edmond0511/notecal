import { supabase } from "@/lib/supabase";
import { useFonts, IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_700Bold,
  });
  const [isLoading, setIsLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

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
          "notecal://auth/callback",
        );

        if (result.type === "success") {
          const url = result.url;
          console.log("OAuth callback URL:", url);

          // Extract code from URL (PKCE flow)
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get("code");

          if (code) {
            console.log("Got auth code, exchanging for session...");
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

            if (sessionError) {
              console.error("Session error:", sessionError);
              throw sessionError;
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            // Fallback: try hash fragment for tokens (legacy flow)
            const hashParams = new URLSearchParams(url.split("#")[1] || "");
            const accessToken = hashParams.get("access_token");
            const refreshToken = hashParams.get("refresh_token");

            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              console.log("No code or tokens found in URL");
              setError("Authentication failed - please try again");
            }
          }
        } else {
          console.log("WebBrowser result:", result.type);
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

      if (!credential.identityToken) {
        throw new Error("No identity token received from Apple");
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });

      if (signInError) throw signInError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (err.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      setError(err.message || "Failed to sign in with Apple");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.content}>
        {/* Branding */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(500)}
          style={styles.brandingContainer}
        >
          <Text style={[styles.appName, fontsLoaded && { fontFamily: "IBMPlexSans_700Bold" }]}>NoteCal</Text>
          <Text style={styles.tagline}>Log in or sign up</Text>
        </Animated.View>

        {/* Auth Buttons */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(500)}
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
                <Ionicons name="logo-google" size={20} />
                <Text style={styles.authButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple Sign In */}
          {Platform.OS === "ios" && isAppleAvailable && (
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
                  <Text style={[styles.authButtonText, styles.appleButtonText]}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Error Message */}
        {error && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.errorContainer}
          >
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  brandingContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  appName: {
    fontSize: 32,
    color: "#1a1a1a",
    letterSpacing: -1,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
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
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
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
});
