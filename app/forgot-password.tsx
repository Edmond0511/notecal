import { EmailField } from "@/components/auth/EmailField";
import { ErrorPill } from "@/components/auth/ErrorPill";
import { Tokens } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import {
  maskEmail,
  validateEmail,
} from "@/utils/auth/passwordValidation";
import {
  IBMPlexSans_700Bold,
  useFonts,
} from "@expo-google-fonts/ibm-plex-sans";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const RESEND_COOLDOWN_S = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ IBMPlexSans_700Bold });
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the cooldown down each second; clean up on unmount.
  useEffect(() => {
    if (cooldown <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setCooldown((c) => Math.max(0, c - 1));
      }, 1000);
    }
    return () => {
      if (intervalRef.current && cooldown <= 1) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cooldown]);

  const headlineFont = fontsLoaded
    ? { fontFamily: "IBMPlexSans_700Bold" as const }
    : null;

  const handleBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/sign-in-email");
    }
  };

  const send = async (): Promise<void> => {
    const result = validateEmail(email);
    if (!result.valid) {
      setEmailFieldError(result.message ?? "Enter a valid email.");
      return;
    }
    setEmailFieldError(null);
    setError(null);
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: "https://notecal.app/auth/reset" },
      );
      if (resetError) {
        // Most reset errors are rate-limit related; the actual message is
        // safe to surface (Supabase doesn't disclose existence here).
        setError(resetError.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      setSent(true);
      setCooldown(RESEND_COOLDOWN_S);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Couldn't send. Try again.";
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = () => {
    if (cooldown > 0 || submitting) return;
    void send();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <TouchableOpacity
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {sent ? (
            <View style={styles.successBlock}>
              <View style={styles.iconBubble}>
                <Ionicons
                  name="mail-open"
                  size={36}
                  color={Tokens.accent}
                />
              </View>
              <Text style={[styles.headline, headlineFont]}>Check your inbox</Text>
              <Text style={styles.subtitle}>
                We sent a password-reset link to{"\n"}
                <Text style={styles.maskedEmail}>{maskEmail(email)}</Text>
                {"\n"}The link expires in 1 hour.
              </Text>

              {error ? <ErrorPill message={error} /> : null}

              <Pressable
                onPress={handleResend}
                disabled={cooldown > 0 || submitting}
                hitSlop={12}
                style={styles.resendLink}
              >
                {submitting ? (
                  <ActivityIndicator color={Tokens.textSecondary} />
                ) : (
                  <Text
                    style={[
                      styles.resendText,
                      cooldown > 0 && styles.resendTextDisabled,
                    ]}
                  >
                    {cooldown > 0
                      ? `Send again in ${cooldown}s`
                      : "Send again"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  router.replace("/sign-in-email");
                }}
                style={styles.doneButton}
                accessibilityRole="button"
              >
                <Text style={styles.doneButtonLabel}>Back to sign in</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.headline, headlineFont]}>
                Reset your password
              </Text>
              <Text style={styles.subtitle}>
                Enter your email and we&apos;ll send you a link to set a new
                password.
              </Text>

              <View style={styles.fields}>
                <EmailField
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (emailFieldError) setEmailFieldError(null);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={() => {
                    void send();
                  }}
                  error={emailFieldError}
                  autoFocus
                  editable={!submitting}
                  returnKeyType="send"
                />
              </View>

              {error ? <ErrorPill message={error} /> : null}

              <TouchableOpacity
                onPress={() => {
                  void send();
                }}
                disabled={submitting}
                activeOpacity={0.85}
                accessibilityRole="button"
                style={[styles.submit, submitting && styles.submitDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitLabel}>Send reset link</Text>
                )}
              </TouchableOpacity>
            </>
          )}
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
  flex: { flex: 1 },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 16,
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 16,
  },
  headline: {
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1,
    fontWeight: "700",
    color: Tokens.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
    marginTop: -8,
    lineHeight: 22,
  },
  fields: {
    gap: 12,
    marginTop: 8,
  },
  submit: {
    height: 56,
    borderRadius: 30,
    backgroundColor: Tokens.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  successBlock: {
    alignItems: "center",
    paddingTop: 16,
    gap: 12,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Tokens.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  maskedEmail: {
    color: Tokens.textPrimary,
    fontWeight: "600",
  },
  resendLink: {
    paddingVertical: 14,
    minHeight: 44,
    justifyContent: "center",
  },
  resendText: {
    fontSize: 14,
    color: Tokens.accent,
    fontWeight: "600",
  },
  resendTextDisabled: {
    color: Tokens.textTertiary,
  },
  doneButton: {
    height: 56,
    borderRadius: 30,
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
    paddingHorizontal: 22,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  doneButtonLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
});
