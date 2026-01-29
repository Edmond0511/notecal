import React, { useEffect, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Color palette inspired by the reference design
const COLORS = {
  calories: {
    primary: "#FF6B35",
    secondary: "#FFE5D9",
    track: "#FFD4C4",
    gradient: ["#FF8C5A", "#FF6B35"],
  },
  protein: {
    primary: "#4A90D9",
    secondary: "#E3F2FD",
    track: "#C5DCFA",
    gradient: ["#64B5F6", "#4A90D9"],
  },
  fat: {
    primary: "#F5A623",
    secondary: "#FFF8E7",
    track: "#FFE8B8",
    gradient: ["#FFD54F", "#F5A623"],
  },
  carbs: {
    primary: "#9B6B9E",
    secondary: "#F3E5F5",
    track: "#E1C4E4",
    gradient: ["#BA68C8", "#9B6B9E"],
  },
};

interface CircularProgressProps {
  current: number;
  target: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  gradientId: string;
  animationDelay?: number;
}

function CircularProgress({
  current,
  target,
  size,
  strokeWidth,
  color,
  trackColor,
  gradientId,
  animationDelay = 0,
}: CircularProgressProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - animatedPercentage / 100);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(percentage, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, [percentage]);

  useDerivedValue(() => {
    runOnJS(setAnimatedPercentage)(progress.value);
  });

  return (
    <Svg
      width={size}
      height={size}
      style={{ transform: [{ rotate: "-90deg" }] }}
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.8" />
          <Stop offset="100%" stopColor={color} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      {/* Background circle */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      {/* Progress circle */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="transparent"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface CalorieRingProps {
  current: number;
  target: number;
}

function CalorieRing({ current, target }: CalorieRingProps) {
  const remaining = Math.max(target - current, 0);
  const isOver = current > target;

  const fadeIn = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 600 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ scale: interpolate(fadeIn.value, [0, 1], [0.9, 1]) }],
  }));

  return (
    <Animated.View style={[styles.calorieCard, animatedStyle]}>
      <View style={styles.calorieContent}>
        <View style={styles.calorieRingContainer}>
          <CircularProgress
            current={current}
            target={target}
            size={140}
            strokeWidth={12}
            color={COLORS.calories.primary}
            trackColor={COLORS.calories.track}
            gradientId="calorieGradient"
          />
          <View style={styles.calorieCenter}>
            <Text style={styles.calorieValue}>{Math.round(current)}</Text>
            <Text style={styles.calorieUnit}>kcal</Text>
          </View>
        </View>

        <View style={styles.calorieInfo}>
          <View style={styles.calorieTargetRow}>
            <Text style={styles.calorieTargetLabel}>of</Text>
            <Text style={styles.calorieTargetValue}>{target}</Text>
            <Text style={styles.calorieTargetLabel}>daily goal</Text>
          </View>

          <View style={styles.calorieRemainingContainer}>
            {isOver ? (
              <Text style={styles.calorieOverText}>
                {Math.round(current - target)} over target
              </Text>
            ) : (
              <Text style={styles.calorieRemainingText}>
                {Math.round(remaining)} remaining
              </Text>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

interface MacroCardProps {
  label: string;
  current: number;
  target: number;
  color: typeof COLORS.protein;
  delay: number;
}

function MacroCard({ label, current, target, color, delay }: MacroCardProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const remaining = Math.max(target - current, 0);
  const isOver = current > target;

  const fadeIn = useSharedValue(0);

  useEffect(() => {
    setTimeout(() => {
      fadeIn.value = withTiming(1, { duration: 500 });
    }, delay);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [
      { translateY: interpolate(fadeIn.value, [0, 1], [20, 0]) },
      { scale: interpolate(fadeIn.value, [0, 1], [0.95, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.macroCard,
        { backgroundColor: color.secondary },
        animatedStyle,
      ]}
    >
      <View style={styles.macroRingContainer}>
        <CircularProgress
          current={current}
          target={target}
          size={70}
          strokeWidth={6}
          color={color.primary}
          trackColor={color.track}
          gradientId={`${label}Gradient`}
          animationDelay={delay}
        />
        <View style={styles.macroCenter}>
          <Text style={[styles.macroValue, { color: color.primary }]}>
            {Math.round(current)}
          </Text>
        </View>
      </View>

      <Text style={styles.macroLabel}>{label}</Text>

      <View style={styles.macroTargetContainer}>
        <Text style={styles.macroTargetText}>
          {isOver ? (
            <Text style={styles.macroOverText}>
              +{Math.round(current - target)}g
            </Text>
          ) : (
            `${Math.round(remaining)}g left`
          )}
        </Text>
      </View>

      <View
        style={[
          styles.macroProgressBg,
          { backgroundColor: `${color.primary}20` },
        ]}
      >
        <Animated.View
          style={[
            styles.macroProgressFill,
            {
              width: `${percentage}%`,
              backgroundColor: color.primary,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

interface ProgressRingsProps {
  consumed: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  targets: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
}

export function ProgressRings({ consumed, targets }: ProgressRingsProps) {
  return (
    <View style={styles.container}>
      {/* Main Calorie Ring */}
      <CalorieRing current={consumed.kcal} target={targets.kcal} />

      {/* Macro Cards Row */}
      <View style={styles.macrosRow}>
        <MacroCard
          label="Protein"
          current={consumed.protein}
          target={targets.protein}
          color={COLORS.protein}
          delay={100}
        />
        <MacroCard
          label="Fat"
          current={consumed.fat}
          target={targets.fat}
          color={COLORS.fat}
          delay={200}
        />
        <MacroCard
          label="Carbs"
          current={consumed.carbs}
          target={targets.carbs}
          color={COLORS.carbs}
          delay={300}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },

  // Calorie Ring Styles
  calorieCard: {
    backgroundColor: COLORS.calories.secondary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  calorieContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calorieRingContainer: {
    position: "relative",
    width: 140,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
  },
  calorieCenter: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  calorieValue: {
    fontSize: 32,
    fontWeight: "700",
    color: COLORS.calories.primary,
    letterSpacing: -1,
  },
  calorieUnit: {
    fontSize: 12,
    color: "#999",
    fontWeight: "500",
    marginTop: -2,
  },
  calorieInfo: {
    flex: 1,
    marginLeft: 16,
    alignItems: "flex-start",
  },
  calorieTargetRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  calorieTargetLabel: {
    fontSize: 14,
    color: "#888",
    marginHorizontal: 4,
  },
  calorieTargetValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
  },
  calorieRemainingContainer: {
    marginBottom: 12,
  },
  calorieRemainingText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  calorieOverText: {
    fontSize: 14,
    color: "#EF5350",
    fontWeight: "600",
  },

  // Macro Card Styles
  macrosRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  macroCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
  },
  macroRingContainer: {
    position: "relative",
    width: 70,
    height: 70,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  macroCenter: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  macroValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  macroUnit: {
    fontSize: 10,
    color: "#888",
  },
  macroLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
    marginBottom: 4,
  },
  macroTargetContainer: {
    marginBottom: 8,
  },
  macroTargetText: {
    fontSize: 11,
    color: "#888",
  },
  macroOverText: {
    color: "#EF5350",
    fontWeight: "600",
  },
  macroProgressBg: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  macroProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
});
