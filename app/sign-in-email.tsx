import { EmailField } from "@/components/auth/EmailField";
import { ErrorPill } from "@/components/auth/ErrorPill";
import { PasswordField } from "@/components/auth/PasswordField";
import { Tokens } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import {
  deriveDisplayName,
  validateEmail,
  validatePassword,
} from "@/utils/auth/passwordValidation";
import {
  oauthRedirectProvider,
  precheckEmail,
} from "@/utils/auth/precheckEmail";
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
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Mode = "signin" | "signup";
type RedirectProvider = "google" | "apple";

export default function SignInEmailScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ IBMPlexSans_700Bold });
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(
    null,
  );
  const [redirectProvider, setRedirectProvider] =
    useState<RedirectProvider | null>(null);
  const [oauthLoading, setOauthLoading] = useState<RedirectProvider | null>(
    null,
  );

  const passwordRef = useRef<TextInput>(null);

  const headlineFont = fontsLoaded
    ? { fontFamily: "IBMPlexSans_700Bold" as const }
    : null;

  const handleBack = () => {
    Haptics.selectionAsync();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/auth");
    }
  };

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    Haptics.selectionAsync();
    setMode(next);
    setError(null);
    setEmailFieldError(null);
    setPasswordFieldError(null);
  };

  const validateForm = (): boolean => {
    const emailResult = validateEmail(email);
    const passwordResult = validatePassword(password);
    setEmailFieldError(emailResult.message ?? null);
    setPasswordFieldError(passwordResult.message ?? null);
    return emailResult.valid && passwordResult.valid;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (!signInError) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // AuthContext.onAuthStateChange handles navigation.
        return;
      }
      // Failure is ambiguous: wrong password, OAuth-only account, or no
      // account at all. Run precheck to disambiguate so the user gets a
      // useful next step instead of "invalid credentials".
      const pre = await precheckEmail(email);
      const provider = oauthRedirectProvider(pre);
      if (provider) {
        setRedirectProvider(provider);
        return;
      }
      if (!pre.exists) {
        setError("No account found. Tap Create account to sign up.");
      } else {
        setError("Email or password is incorrect.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Couldn't sign in. Try again.";
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const pre = await precheckEmail(email);
      if (pre.exists) {
        const provider = oauthRedirectProvider(pre);
        if (provider) {
          setRedirectProvider(provider);
          return;
        }
        // Email already has a password account → nudge to Sign in tab.
        setError("That email already has an account. Switch to Sign in.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { display_name: deriveDisplayName(email) },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // AuthContext picks up SIGNED_IN and routes to /onboarding.
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't create account. Try again.";
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = mode === "signin" ? handleSignIn : handleSignUp;

  // OAuth handlers (for the Pattern A redirect view). Mirror the patterns from
  // app/auth.tsx and components/SignInModal.tsx — duplicating inline rather
  // than extracting a shared lib for v1 to keep this change set focused.
  const handleGoogle = async () => {
    if (oauthLoading !== null) return;
    try {
      setOauthLoading("google");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken ?? null;
      if (!idToken) throw new Error("No identity token received from Google");
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      if (signInError) throw signInError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      if (
        isErrorWithCode(err) &&
        (err as { code?: unknown }).code === statusCodes.SIGN_IN_CANCELLED
      ) {
        return;
      }
      const message =
        err instanceof Error ? err.message : "Failed to sign in with Google";
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleApple = async () => {
    if (oauthLoading !== null) return;
    try {
      setOauthLoading("apple");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
      const message =
        err instanceof Error ? err.message : "Failed to sign in with Apple";
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setOauthLoading(null);
    }
  };

  // ── Pattern A redirect view ─────────────────────────────────────────────
  if (redirectProvider) {
    const providerLabel = redirectProvider === "google" ? "Google" : "Apple";
    const isGoogle = redirectProvider === "google";
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={Tokens.background}
        />
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setRedirectProvider(null);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.redirectContent}>
          <Text style={[styles.redirectTitle, headlineFont]}>
            You already have an account
          </Text>
          <Text style={styles.redirectSubtitle}>
            This email is registered with {providerLabel}. Continue with{" "}
            {providerLabel} to sign in.
          </Text>

          <TouchableOpacity
            onPress={isGoogle ? handleGoogle : handleApple}
            disabled={oauthLoading !== null}
            activeOpacity={0.85}
            style={[
              styles.btn,
              isGoogle ? styles.googleBtn : styles.appleBtn,
              oauthLoading !== null && styles.btnDisabled,
            ]}
          >
            {oauthLoading === redirectProvider ? (
              <ActivityIndicator
                color={isGoogle ? Tokens.textSecondary : "#fff"}
              />
            ) : (
              <>
                <Ionicons
                  name={isGoogle ? "logo-google" : "logo-apple"}
                  size={18}
                  color={isGoogle ? Tokens.textPrimary : "#fff"}
                />
                <Text
                  style={[
                    styles.btnLabel,
                    isGoogle ? styles.googleBtnLabel : styles.appleBtnLabel,
                  ]}
                >
                  Continue with {providerLabel}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {error ? <ErrorPill message={error} /> : null}

          <Pressable
            onPress={() => {
              setRedirectProvider(null);
              setEmail("");
              setPassword("");
              setError(null);
            }}
            hitSlop={12}
            style={styles.useDifferentLink}
          >
            <Text style={styles.useDifferentText}>Use a different email</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
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
          <Text style={[styles.headline, headlineFont]}>
            {mode === "signin" ? "Welcome back" : "Create account"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "signin"
              ? "Sign in to continue tracking."
              : "Start tracking today."}
          </Text>

          <View style={styles.tabs}>
            <Pressable
              onPress={() => handleModeChange("signin")}
              style={[styles.tab, mode === "signin" && styles.tabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "signin" }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  mode === "signin" && styles.tabLabelActive,
                ]}
              >
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleModeChange("signup")}
              style={[styles.tab, mode === "signup" && styles.tabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "signup" }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  mode === "signup" && styles.tabLabelActive,
                ]}
              >
                Create account
              </Text>
            </Pressable>
          </View>

          <View style={styles.fields}>
            <EmailField
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailFieldError) setEmailFieldError(null);
                if (error) setError(null);
              }}
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={emailFieldError}
              autoFocus
              editable={!submitting}
            />
            <PasswordField
              ref={passwordRef}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordFieldError) setPasswordFieldError(null);
                if (error) setError(null);
              }}
              onSubmitEditing={handleSubmit}
              mode={mode}
              error={passwordFieldError}
              editable={!submitting}
              placeholder={mode === "signup" ? "Choose a password" : "Password"}
            />
          </View>

          {error ? <ErrorPill message={error} /> : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[styles.submit, submitting && styles.submitDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitLabel}>
                {mode === "signin" ? "Sign in" : "Create account"}
              </Text>
            )}
          </TouchableOpacity>

          {mode === "signin" && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/forgot-password");
              }}
              hitSlop={12}
              style={styles.forgotLink}
              accessibilityRole="button"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
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
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: Tokens.surface,
    borderRadius: 999,
    padding: 4,
    marginTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: Tokens.surfaceRaised,
    ...Tokens.shadowLight,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: Tokens.textPrimary,
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
  forgotLink: {
    alignSelf: "center",
    paddingVertical: 8,
  },
  forgotText: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: "500",
  },
  legal: {
    fontSize: 12,
    color: Tokens.textTertiary,
    textAlign: "center",
    marginTop: 12,
  },
  legalEmph: {
    color: Tokens.textSecondary,
  },
  // Pattern A redirect view
  redirectContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: "center",
    gap: 12,
  },
  redirectIconBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Tokens.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  redirectTitle: {
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    fontWeight: "700",
    color: Tokens.textPrimary,
    textAlign: "center",
  },
  redirectSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Tokens.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 30,
    paddingHorizontal: 22,
    gap: 12,
    width: "100%",
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
  useDifferentLink: {
    paddingVertical: 16,
  },
  useDifferentText: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: "500",
  },
});
