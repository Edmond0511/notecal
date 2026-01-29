import { supabase } from "@/lib/supabase";
import { useFonts, IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }

    try {
      setIsLoading("email");
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Try sign in first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        // If invalid credentials, try sign up
        if (signInError.message.includes("Invalid login credentials")) {
          const { error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
          });

          if (signUpError) throw signUpError;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          throw signInError;
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(null);
    }
  };

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
          {/* Email Input */}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={isLoading === null}
          />

          {/* Password Input */}
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={isLoading === null}
          />

          {/* Email Sign In Button */}
          <TouchableOpacity
            style={[styles.authButton, styles.emailButton]}
            onPress={handleEmailSignIn}
            disabled={isLoading !== null}
            activeOpacity={0.8}
          >
            {isLoading === "email" ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={[styles.authButtonText, styles.emailButtonText]}>
                Continue
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

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
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 16,
    color: "#1a1a1a",
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
  emailButton: {
    backgroundColor: "#1a1a1a",
    borderColor: "#1a1a1a",
  },
  emailButtonText: {
    color: "#ffffff",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e5e5e5",
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#999",
    fontWeight: "500",
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
