import { truncateNumber } from "@/utils/formatNumber";
import React, { useEffect, useRef, useState, memo } from "react";
import { View, Text, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";

// ─── Types ───────────────────────────────────────────────
export type AnimationMode =
  | "rolling"
  | "fadeSlide"
  | "scalePop"
  | "flip"
  | "crossfade";

interface AnimatedDigitsProps {
  value: number;
  maxDigits?: number;
  style?: TextStyle;
  mode?: AnimationMode;
}

interface CharProps {
  char: string;
  fontSize: number;
  fontWeight: TextStyle["fontWeight"];
  color: string;
  digitHeight: number;
  charWidth: number;
}

// ─── Constants ───────────────────────────────────────────
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

// ─── Shared hook for modes that need old/new char ────────
function useCharTransition(char: string, duration: number) {
  const prevRef = useRef(char);
  const [display, setDisplay] = useState({ old: char, current: char });
  const progress = useSharedValue(1);

  useEffect(() => {
    if (char !== prevRef.current) {
      setDisplay({ old: prevRef.current, current: char });
      progress.value = 0;
      progress.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
      prevRef.current = char;
    }
  }, [char]);

  return { display, progress };
}

// ═══════════════════════════════════════════════════════════
// 1. Rolling / Slot Machine
//    Stack 0-9 vertically, translateY to the target digit.
//    Feels like an odometer or airport departure board.
// ═══════════════════════════════════════════════════════════
const RollingChar = memo(function RollingChar({
  char,
  fontSize,
  fontWeight,
  color,
  digitHeight,
  charWidth,
}: CharProps) {
  const isDigit = char >= "0" && char <= "9";
  const target = isDigit ? -parseInt(char) * digitHeight : 0;
  const translateY = useSharedValue(target);

  useEffect(() => {
    if (isDigit) {
      translateY.value = withTiming(-parseInt(char) * digitHeight, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [char, digitHeight]);

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const textBase: TextStyle = {
    fontSize,
    fontWeight,
    color,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    width: charWidth,
  };

  if (!isDigit) {
    return (
      <View style={{ height: digitHeight, justifyContent: "center" }}>
        <Text style={textBase}>{char}</Text>
      </View>
    );
  }

  return (
    <View style={{ width: charWidth, height: digitHeight, overflow: "hidden" }}>
      <Animated.View style={columnStyle}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            style={[textBase, { height: digitHeight, lineHeight: digitHeight }]}
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
});

// ═══════════════════════════════════════════════════════════
// 2. Fade + Slide Up
//    Old digit fades out while sliding up, new digit fades
//    in while sliding up from below. Modern and subtle.
// ═══════════════════════════════════════════════════════════
const FadeSlideChar = memo(function FadeSlideChar({
  char,
  fontSize,
  fontWeight,
  color,
  digitHeight,
  charWidth,
}: CharProps) {
  const { display, progress } = useCharTransition(char, 300);

  const textBase: TextStyle = {
    fontSize,
    fontWeight,
    color,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    width: charWidth,
    height: digitHeight,
    lineHeight: digitHeight,
  };

  const oldStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [0, -digitHeight * 0.4]
        ),
      },
    ],
  }));

  const newStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [digitHeight * 0.4, 0]
        ),
      },
    ],
  }));

  return (
    <View style={{ width: charWidth, height: digitHeight, overflow: "hidden" }}>
      <Animated.Text style={[textBase, oldStyle]}>
        {display.old}
      </Animated.Text>
      <Animated.Text style={[textBase, newStyle]}>
        {display.current}
      </Animated.Text>
    </View>
  );
});

// ═══════════════════════════════════════════════════════════
// 3. Scale Pop
//    Digit briefly scales up then settles back on change.
//    Works well for score counters, gamification elements.
// ═══════════════════════════════════════════════════════════
const ScalePopChar = memo(function ScalePopChar({
  char,
  fontSize,
  fontWeight,
  color,
  digitHeight,
  charWidth,
}: CharProps) {
  const scale = useSharedValue(1);
  const prevRef = useRef(char);

  useEffect(() => {
    if (char !== prevRef.current) {
      scale.value = withSequence(
        withTiming(1.25, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(1.0, {
          duration: 180,
          easing: Easing.inOut(Easing.cubic),
        })
      );
      prevRef.current = char;
    }
  }, [char]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const textBase: TextStyle = {
    fontSize,
    fontWeight,
    color,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    width: charWidth,
    height: digitHeight,
    lineHeight: digitHeight,
  };

  return (
    <View
      style={{
        width: charWidth,
        height: digitHeight,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.Text style={[textBase, animStyle]}>{char}</Animated.Text>
    </View>
  );
});

// ═══════════════════════════════════════════════════════════
// 4. Flip (3D-ish)
//    Simulates a flip-clock by animating rotateX.
//    Old digit rotates away, new digit rotates in.
// ═══════════════════════════════════════════════════════════
const FlipChar = memo(function FlipChar({
  char,
  fontSize,
  fontWeight,
  color,
  digitHeight,
  charWidth,
}: CharProps) {
  const { display, progress } = useCharTransition(char, 400);

  const textBase: TextStyle = {
    fontSize,
    fontWeight,
    color,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    width: charWidth,
    height: digitHeight,
    lineHeight: digitHeight,
  };

  const oldStyle = useAnimatedStyle(() => {
    const rotateX = interpolate(
      progress.value,
      [0, 0.5],
      [0, 90],
      "clamp"
    );
    return {
      position: "absolute" as const,
      opacity: progress.value < 0.5 ? 1 : 0,
      transform: [{ perspective: 300 }, { rotateX: `${rotateX}deg` }],
      backfaceVisibility: "hidden" as const,
    };
  });

  const newStyle = useAnimatedStyle(() => {
    const rotateX = interpolate(
      progress.value,
      [0.5, 1],
      [-90, 0],
      "clamp"
    );
    return {
      opacity: progress.value >= 0.5 ? 1 : 0,
      transform: [{ perspective: 300 }, { rotateX: `${rotateX}deg` }],
      backfaceVisibility: "hidden" as const,
    };
  });

  return (
    <View
      style={{
        width: charWidth,
        height: digitHeight,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.Text style={[textBase, oldStyle]}>
        {display.old}
      </Animated.Text>
      <Animated.Text style={[textBase, newStyle]}>
        {display.current}
      </Animated.Text>
    </View>
  );
});

// ═══════════════════════════════════════════════════════════
// 5. Crossfade
//    Simplest — old digit fades out while new digit fades in
//    simultaneously. Minimal but elegant.
// ═══════════════════════════════════════════════════════════
const CrossfadeChar = memo(function CrossfadeChar({
  char,
  fontSize,
  fontWeight,
  color,
  digitHeight,
  charWidth,
}: CharProps) {
  const { display, progress } = useCharTransition(char, 250);

  const textBase: TextStyle = {
    fontSize,
    fontWeight,
    color,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    width: charWidth,
    height: digitHeight,
    lineHeight: digitHeight,
  };

  const oldStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
  }));

  const newStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  return (
    <View style={{ width: charWidth, height: digitHeight }}>
      <Animated.Text style={[textBase, oldStyle]}>
        {display.old}
      </Animated.Text>
      <Animated.Text style={[textBase, newStyle]}>
        {display.current}
      </Animated.Text>
    </View>
  );
});

// ─── Mode dispatch ───────────────────────────────────────
const CHAR_COMPONENTS: Record<AnimationMode, React.ComponentType<CharProps>> = {
  rolling: RollingChar,
  fadeSlide: FadeSlideChar,
  scalePop: ScalePopChar,
  flip: FlipChar,
  crossfade: CrossfadeChar,
};

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════
export const AnimatedDigits = memo(function AnimatedDigits({
  value,
  maxDigits = 5,
  style,
  mode = "rolling",
}: AnimatedDigitsProps) {
  const displayStr = truncateNumber(Math.round(value), maxDigits);
  const chars = displayStr.split("");

  const fontSize = (style?.fontSize as number) || 16;
  const fontWeight =
    (style?.fontWeight as TextStyle["fontWeight"]) || "600";
  const color = (style?.color as string) || "#222";
  const digitHeight = Math.ceil(fontSize * 1.3);
  const charWidth = Math.ceil(fontSize * 0.62);

  const CharComponent = CHAR_COMPONENTS[mode];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {chars.map((char, i) => (
        <CharComponent
          key={chars.length - 1 - i}
          char={char}
          fontSize={fontSize}
          fontWeight={fontWeight}
          color={color}
          digitHeight={digitHeight}
          charWidth={charWidth}
        />
      ))}
    </View>
  );
});
