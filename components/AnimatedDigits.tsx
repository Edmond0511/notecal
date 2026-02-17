import { truncateNumber } from "@/utils/formatNumber";
import React, { useEffect, useRef, useState, memo } from "react";
import { View, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";

interface AnimatedDigitsProps {
  value: number;
  maxDigits?: number;
  maxWidth?: number;
  minimumFontScale?: number;
  style?: TextStyle;
}

interface CharProps {
  char: string;
  fontSize: number;
  fontWeight: TextStyle["fontWeight"];
  color: string;
  digitHeight: number;
  charWidth: number;
}

function useCharTransition(char: string) {
  const prevRef = useRef(char);
  const [display, setDisplay] = useState({ old: char, current: char });
  const progress = useSharedValue(1);

  useEffect(() => {
    if (char !== prevRef.current) {
      setDisplay({ old: prevRef.current, current: char });
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      prevRef.current = char;
    }
  }, [char]);

  return { display, progress };
}

const FadeSlideChar = memo(function FadeSlideChar({
  char,
  fontSize,
  fontWeight,
  color,
  digitHeight,
  charWidth,
}: CharProps) {
  const { display, progress } = useCharTransition(char);

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

export const AnimatedDigits = memo(function AnimatedDigits({
  value,
  maxDigits = 5,
  maxWidth,
  minimumFontScale = 0.6,
  style,
}: AnimatedDigitsProps) {
  const displayStr = truncateNumber(Math.round(value), maxDigits);
  const chars = displayStr.split("");

  const baseFontSize = (style?.fontSize as number) || 16;
  const fontWeight =
    (style?.fontWeight as TextStyle["fontWeight"]) || "600";
  const color = (style?.color as string) || "#222";

  // Scale font down if total width exceeds maxWidth
  let fontSize = baseFontSize;
  if (maxWidth) {
    const totalWidth = chars.length * Math.ceil(baseFontSize * 0.62);
    if (totalWidth > maxWidth) {
      const scale = Math.max(maxWidth / totalWidth, minimumFontScale);
      fontSize = Math.floor(baseFontSize * scale);
    }
  }

  const digitHeight = Math.ceil(fontSize * 1.3);
  const charWidth = Math.ceil(fontSize * 0.62);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        ...(maxWidth ? { maxWidth, overflow: "hidden" as const } : {}),
      }}
    >
      {chars.map((char, i) => (
        <FadeSlideChar
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
