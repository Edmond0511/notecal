import { useAuth } from "@/contexts/AuthContext";
import { Tokens } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

const RESEND_COOLDOWN_S = 60;
const WARNING_BG = "#FFF4D6";
const WARNING_BORDER = "#F4D88E";
const WARNING_ICON = "#7A5A00";

/**
 * Renders a single-line warning strip across the top of the tabs screen for
 * email-auth users whose email_confirmed_at is null. Persistent (not
 * dismissable) so users don't lose track of the verification step. Auto-
 * unmounts when isEmailVerified flips true.
 */
export function VerificationBanner() {
  const { user, isEmailVerified } = useAuth();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<"sent" | "error" | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick cooldown each second and clean up.
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

  // Clear "sent" / "error" feedback after a few seconds so the strip returns
  // to its calm state.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleResend = useCallback(async () => {
    if (!user?.email || resending || cooldown > 0) return;
    setResending(true);
    Haptics.selectionAsync();
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
      });
      if (error) {
        setFeedback("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      setFeedback("sent");
      setCooldown(RESEND_COOLDOWN_S);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setFeedback("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setResending(false);
    }
  }, [user?.email, resending, cooldown]);

  // Only show for email-provider users who aren't verified yet. OAuth users
  // are auto-confirmed by Supabase, so this banner is never visible to them.
  const provider = user?.app_metadata?.provider;
  if (!user || isEmailVerified || provider !== "email") return null;

  const rightLabel = (() => {
    if (resending) return null;
    if (feedback === "sent") return "Sent ✓";
    if (feedback === "error") return "Try again";
    if (cooldown > 0) return `${cooldown}s`;
    return "Resend";
  })();

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={styles.container}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="mail-unread" size={16} color={WARNING_ICON} />
      </View>
      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
        Verify your email to unlock Pro
      </Text>
      <Pressable
        onPress={handleResend}
        disabled={resending || cooldown > 0}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.action}
      >
        {resending ? (
          <ActivityIndicator size="small" color={WARNING_ICON} />
        ) : (
          <Text
            style={[
              styles.actionText,
              cooldown > 0 && styles.actionTextDisabled,
            ]}
          >
            {rightLabel}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: WARNING_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WARNING_BORDER,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.1,
  },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: WARNING_ICON,
    letterSpacing: -0.1,
  },
  actionTextDisabled: {
    color: Tokens.textSecondary,
    fontWeight: "500",
  },
});
