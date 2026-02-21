import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type PhotoToastState =
  | { type: "idle" }
  | { type: "analyzing" }
  | { type: "success"; itemCount: number }
  | { type: "error"; message: string };

interface PhotoProcessingToastProps {
  state: PhotoToastState;
  onDismiss: () => void;
  onAutoHide: () => void;
}

const DISMISS_THRESHOLD = 60;

export function PhotoProcessingToast({
  state,
  onDismiss,
  onAutoHide,
}: PhotoProcessingToastProps) {
  const translateY = useSharedValue(100);
  const isVisible = useRef(false);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();

    if (state.type === "idle") {
      if (isVisible.current) {
        translateY.value = withTiming(100, { duration: 200 });
        isVisible.current = false;
      }
      return;
    }

    // Show toast
    isVisible.current = true;
    translateY.value = withTiming(0, { duration: 250 });

    if (state.type === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      autoHideTimer.current = setTimeout(() => {
        translateY.value = withTiming(100, { duration: 200 });
        onAutoHide();
      }, 3000);
    } else if (state.type === "error") {
      autoHideTimer.current = setTimeout(() => {
        translateY.value = withTiming(100, { duration: 200 });
        onAutoHide();
      }, 3000);
    }

    return clearTimer;
  }, [state]);

  const handleDismiss = useCallback(() => {
    clearTimer();
    translateY.value = withTiming(100, { duration: 200 });
    onDismiss();
  }, [onDismiss, clearTimer]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (
        event.translationY > DISMISS_THRESHOLD ||
        event.velocityY > 500
      ) {
        translateY.value = withTiming(100, { duration: 200 });
        runOnJS(handleDismiss)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [0, 100], [1, 0]),
  }));

  if (state.type === "idle") return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <View style={styles.pill}>
          {state.type === "analyzing" && (
            <>
              <ActivityIndicator size="small" color="#0a7ea4" />
              <Text style={styles.text}>Analyzing photo...</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleDismiss}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color="#999" />
              </TouchableOpacity>
            </>
          )}

          {state.type === "success" && (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#2B8A3E" />
              <Text style={styles.text}>
                Added {state.itemCount} item{state.itemCount !== 1 ? "s" : ""}
              </Text>
            </>
          )}

          {state.type === "error" && (
            <>
              <Ionicons name="alert-circle" size={20} color="#E8590C" />
              <Text style={styles.text}>{state.message}</Text>
            </>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 130,
    left: 16,
    right: 16,
    zIndex: 20,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffffee",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  text: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
});
