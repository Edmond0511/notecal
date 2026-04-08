import { Tokens } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { isLiquidGlassSupported, LiquidGlassView } from "@callstack/liquid-glass";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string };

export default function EmailAuthScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!EMAIL_REGEX.test(email.trim())) {
      next.email = "Enter a valid email address";
    }
    if (password.length < 6) {
      next.password = "Password must be at least 6 characters";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError(null);
    setVerifyMessage(null);
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const trimmedEmail = email.trim();

    try {
      // Step 1: try sign-in
      const signInRes = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (!signInRes.error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return; // AuthContext handles nav + sync
      }

      const isInvalidCreds =
        signInRes.error.message?.toLowerCase().includes("invalid login credentials");

      if (!isInvalidCreds) {
        throw signInRes.error;
      }

      // Step 2: unknown email OR wrong password — try sign-up
      const signUpRes = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      if (signUpRes.error) {
        const msg = signUpRes.error.message?.toLowerCase() || "";
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          // Email exists — so step 1 failed because password was wrong
          setFieldErrors({ password: "Incorrect password" });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }
        throw signUpRes.error;
      }

      // Sign-up succeeded
      if (signUpRes.data.session) {
        // Auto-signed in
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // Email confirmation required
        setVerifyMessage(
          "Check your email to verify your account, then come back and sign in.",
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = email.length > 0 && password.length > 0 && !isSubmitting;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                style={styles.backButton}
                interactive
                effect="regular"
              >
                <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
              </LiquidGlassView>
            ) : (
              <View style={[styles.backButton, styles.backButtonFallback]}>
                <Ionicons name="chevron-back" size={20} color="#666" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Animated.View
            entering={reducedMotion ? FadeIn.duration(0) : FadeInDown.delay(100).duration(400)}
          >
            <Text
              style={styles.title}
              maxFontSizeMultiplier={1.5}
              accessibilityRole="header"
            >
              Sign in with Email
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View
            entering={reducedMotion ? FadeIn.duration(0) : FadeInDown.delay(200).duration(400)}
            style={styles.form}
          >
            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, fieldErrors.email && styles.inputError]}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
              }}
              placeholder="you@example.com"
              placeholderTextColor={Tokens.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              autoFocus
              accessibilityLabel="Email address"
              editable={!isSubmitting}
            />
            {fieldErrors.email && (
              <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                {fieldErrors.email}
              </Text>
            )}

            {/* Password */}
            <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
            <View style={[styles.passwordWrap, fieldErrors.password && styles.inputError]}>
              <TextInput
                ref={passwordRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
                }}
                placeholder="At least 6 characters"
                placeholderTextColor={Tokens.textTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Password"
                editable={!isSubmitting}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.5}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={Tokens.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {fieldErrors.password && (
              <Text style={styles.fieldError} accessibilityLiveRegion="polite">
                {fieldErrors.password}
              </Text>
            )}

            {/* Continue button */}
            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>Continue</Text>
              )}
            </TouchableOpacity>

            {/* Global error */}
            {error && (
              <Animated.View
                entering={reducedMotion ? FadeIn.duration(0) : FadeIn.duration(250)}
                style={styles.errorContainer}
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="alert-circle" size={16} color={Tokens.error} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* Verify message */}
            {verifyMessage && (
              <Animated.View
                entering={reducedMotion ? FadeIn.duration(0) : FadeIn.duration(250)}
                style={styles.verifyContainer}
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="mail-outline" size={16} color={Tokens.accent} />
                <Text style={styles.verifyText}>{verifyMessage}</Text>
              </Animated.View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -0.5,
  },
  form: {
    marginTop: 32,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B6B6B",
    marginBottom: 6,
    textTransform: "capitalize",
  },
  labelSpaced: {
    marginTop: 16,
  },
  input: {
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Tokens.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Tokens.textPrimary,
    backgroundColor: Tokens.surfaceRaised,
    minHeight: 52,
  },
  inputError: {
    borderColor: Tokens.error,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Tokens.border,
    backgroundColor: Tokens.surfaceRaised,
    minHeight: 52,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Tokens.textPrimary,
  },
  eyeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldError: {
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.error,
    marginTop: 6,
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: Tokens.accent,
    borderRadius: 9999,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: Tokens.errorTint,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.error,
  },
  verifyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: Tokens.accentTint,
    borderRadius: 10,
  },
  verifyText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.accent,
  },
});
