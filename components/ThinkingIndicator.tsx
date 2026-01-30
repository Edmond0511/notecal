import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

// Shimmer dimensions
const SHIMMER_WIDTH = 50; // Smaller width for subtle shimmer effect
const TEXT_WIDTH = 70; // Approximate width of "calculating" text

export const ThinkingIndicator: React.FC = React.memo(() => {
  const shimmerTranslate = useRef(new Animated.Value(-SHIMMER_WIDTH)).current;
  const shimmerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Parallel animation for translate and opacity
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        // Sweep across with fade in/out
        Animated.parallel([
          Animated.timing(shimmerTranslate, {
            toValue: TEXT_WIDTH + SHIMMER_WIDTH,
            duration: 2000,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.sequence([
            // Fade in during first quarter
            Animated.timing(shimmerOpacity, {
              toValue: 0.6,
              duration: 500,
              easing: Easing.ease,
              useNativeDriver: true,
            }),
            // Stay visible during middle
            Animated.delay(1000),
            // Fade out during last quarter
            Animated.timing(shimmerOpacity, {
              toValue: 0,
              duration: 500,
              easing: Easing.ease,
              useNativeDriver: true,
            }),
          ]),
        ]),
        // Small delay before next loop (avoids instant reset issues)
        Animated.delay(100),
        // Reset position (instant but with delay buffer)
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
  }, [shimmerTranslate, shimmerOpacity]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Two-layer shimmer: base text + animated overlay */}
        <View style={styles.shimmerContainer}>
          {/* Base layer: always-visible blue text */}
          <Text style={styles.baseText}>calculating</Text>

          {/* Shimmer overlay: animated white highlight */}
          <Animated.View
            style={[
              styles.shimmerOverlay,
              {
                transform: [{ translateX: shimmerTranslate }],
                opacity: shimmerOpacity,
              },
            ]}
          >
            <LinearGradient
              colors={[
                "rgba(255, 255, 255, 0)",
                "rgba(255, 255, 255, 0.8)",
                "rgba(255, 255, 255, 0)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradient}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
});
ThinkingIndicator.displayName = 'ThinkingIndicator';

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2F1",
    borderRadius: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  shimmerContainer: {
    position: "relative",
    overflow: "hidden",
    width: TEXT_WIDTH,
    height: 16,
    justifyContent: "center",
  },
  baseText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "System",
    fontWeight: "500",
    letterSpacing: 0.3,
    color: "#1A6872",
    includeFontPadding: false,
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SHIMMER_WIDTH,
    height: 16,
  },
  gradient: {
    flex: 1,
    width: SHIMMER_WIDTH,
    height: 16,
  },
});

export default ThinkingIndicator;
