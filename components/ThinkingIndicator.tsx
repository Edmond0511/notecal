import { SystemFont, Tokens } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";

// Shimmer dimensions - full container sweep
const SHIMMER_WIDTH = 40;
const CONTAINER_WIDTH = 79; // text width + padding

export const ThinkingIndicator: React.FC = React.memo(() => {
  const shimmerTranslate = useRef(
    new Animated.Value(-SHIMMER_WIDTH),
  ).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        // Sweep left to right across entire container
        Animated.timing(shimmerTranslate, {
          toValue: CONTAINER_WIDTH,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // Pause before next sweep
        Animated.delay(500),
        // Reset position instantly
        Animated.timing(shimmerTranslate, {
          toValue: -SHIMMER_WIDTH,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    shimmerAnimation.start();

    return () => {
      shimmerAnimation.stop();
    };
  }, [shimmerTranslate]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      <Text style={styles.baseText}>calculating</Text>

      {/* Bold shimmer overlay - sweeps across entire container */}
      <Animated.View
        style={[
          styles.shimmerOverlay,
          {
            transform: [{ translateX: shimmerTranslate }],
          },
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(255, 255, 255, 0)",
            "rgba(255, 255, 255, 0.7)",
            "rgba(255, 255, 255, 0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        />
      </Animated.View>
    </Animated.View>
  );
});
ThinkingIndicator.displayName = "ThinkingIndicator";

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: Tokens.accentTint,
    borderRadius: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  baseText: {
    fontSize: Tokens.fontSize.sm,
    lineHeight: 16,
    fontFamily: SystemFont,
    fontWeight: "500",
    letterSpacing: 0.3,
    color: Tokens.accent,
    includeFontPadding: false,
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: SHIMMER_WIDTH,
  },
  gradient: {
    flex: 1,
  },
});

export default ThinkingIndicator;
