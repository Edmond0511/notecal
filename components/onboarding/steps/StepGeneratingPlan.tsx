import { Tokens } from "@/constants/theme";
import {
  ActivityLevel,
  CarbPreference,
  GoalType,
  ProteinPreference,
  Sex,
} from "@/types";
import { calculateGoals } from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface Props {
  onComplete: () => void;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalType;
  targetWeightKg?: number | null;
  timelineWeeks?: number | null;
  proteinPreference?: ProteinPreference;
  carbPreference?: CarbPreference;
  headlineFontFamily?: string;
  boldNumericFontFamily?: string;
  semiBoldFontFamily?: string;
}

const ROTATE_MS = 900;
const FINAL_PAUSE_MS = 500;
const TICK_MS = 80;

const STEP_KEYS = [
  "calories",
  "carbs",
  "protein",
  "fats",
  "metabolism",
] as const;
type StepKey = (typeof STEP_KEYS)[number];

// Variable durations so step transitions match the perceived deceleration —
// every step takes a distinct, monotonically-increasing amount of time so the
// gradient bar visibly slows as it approaches 100%. The Metabolism step holds
// the 80→100% range the longest for a deliberate, premium-feeling finish.
// Cumulative ≈ 7.9s.
const STEP_DURATIONS_MS: Record<StepKey, number> = {
  calories: 700,
  carbs: 1050,
  protein: 1450,
  fats: 1900,
  metabolism: 2800,
};
const STEP_OFFSETS_MS: number[] = (() => {
  let acc = 0;
  return STEP_KEYS.map((k) => {
    const start = acc;
    acc += STEP_DURATIONS_MS[k];
    return start;
  });
})();
const TOTAL_MS = STEP_KEYS.reduce((acc, k) => acc + STEP_DURATIONS_MS[k], 0);

const MACRO: Record<StepKey, string> = {
  calories: Tokens.macroKcal,
  carbs: Tokens.macroCarbs,
  protein: Tokens.macroProtein,
  fats: Tokens.macroFat,
  metabolism: Tokens.accent,
};

const MESSAGES: Record<StepKey, string[]> = {
  calories: [
    "Estimating your basal metabolic rate…",
    "Applying activity multiplier…",
    "Solving Mifflin–St Jeor for your profile…",
    "Finalizing daily calorie target…",
  ],
  carbs: [
    "Distributing carbohydrate energy…",
    "Reserving glycogen for activity windows…",
    "Modeling fiber-to-net-carb ratio…",
  ],
  protein: [
    "Calibrating protein per kg lean mass…",
    "Cross-checking with goal trajectory…",
    "Locking minimum daily intake…",
  ],
  fats: [
    "Balancing essential fatty acids…",
    "Allocating remaining caloric budget…",
  ],
  metabolism: [
    "Estimating your basal metabolic rate…",
    "Applying activity multiplier…",
    "Calculating total daily energy needs…",
  ],
};

const formatCalories = (n: number) => `${n.toLocaleString("en-US")} cal`;

export function StepGeneratingPlan({
  onComplete,
  sex,
  age,
  heightCm,
  weightKg,
  activity,
  goal,
  targetWeightKg,
  timelineWeeks,
  proteinPreference = "standard",
  carbPreference = "standard",
  headlineFontFamily,
  boldNumericFontFamily,
  semiBoldFontFamily,
}: Props) {
  const reducedMotion = useReducedMotion();
  const goals = useMemo(
    () =>
      calculateGoals({
        sex,
        age,
        heightCm,
        weightKg,
        activityLevel: activity,
        goalType: goal,
        proteinPreference,
        carbPreference,
        targetWeightKg: targetWeightKg ?? undefined,
        timelineWeeks: timelineWeeks ?? undefined,
      }),
    [
      sex,
      age,
      heightCm,
      weightKg,
      activity,
      goal,
      proteinPreference,
      carbPreference,
      targetWeightKg,
      timelineWeeks,
    ],
  );

  const finalValues: Record<StepKey, string> = useMemo(
    () => ({
      calories: formatCalories(goals.targetKcal),
      carbs: `${goals.targetCarbs} g`,
      protein: `${goals.targetProtein} g`,
      fats: `${goals.targetFat} g`,
      metabolism: `${goals.bmr.toLocaleString("en-US")} → ${goals.tdee.toLocaleString("en-US")} cal`,
    }),
    [goals],
  );

  const [elapsed, setElapsed] = useState(0);
  const completedRef = useRef(false);
  const lastStepIdxRef = useRef(-1);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const next = Math.min(TOTAL_MS, Date.now() - startedAt);
      setElapsed(next);
      if (next >= TOTAL_MS) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Step index by cumulative offsets — later steps occupy more time.
  let stepIndex = STEP_KEYS.length - 1;
  for (let i = 0; i < STEP_KEYS.length; i += 1) {
    const start = STEP_OFFSETS_MS[i];
    const end = start + STEP_DURATIONS_MS[STEP_KEYS[i]];
    if (elapsed < end) {
      stepIndex = i;
      break;
    }
  }
  const intoStep = elapsed - STEP_OFFSETS_MS[stepIndex];
  // Once the timer hits TOTAL_MS, mark every row as done so the Health row
  // also checks off during the closing pause before onComplete fires.
  const allDone = elapsed >= TOTAL_MS;

  // Non-linear percentage: each step contributes an equal 20% to the bar even
  // though its duration is longer, so the visible bar speed slows step over
  // step — most pronounced in the 80→100% range (the final, longest step).
  const stepShare = 100 / STEP_KEYS.length;
  const stepDuration = STEP_DURATIONS_MS[STEP_KEYS[stepIndex]];
  const intraFrac = Math.min(1, intoStep / stepDuration);
  const pct = Math.min(
    100,
    Math.round(stepIndex * stepShare + intraFrac * stepShare),
  );

  // Selection haptic on each step check-off; success haptic on final.
  useEffect(() => {
    if (stepIndex <= lastStepIdxRef.current) return;
    lastStepIdxRef.current = stepIndex;
    if (stepIndex > 0) {
      Haptics.selectionAsync();
    }
  }, [stepIndex]);

  useEffect(() => {
    if (elapsed < TOTAL_MS || completedRef.current) return;
    completedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setTimeout(() => onComplete(), FINAL_PAUSE_MS);
    return () => clearTimeout(t);
  }, [elapsed, onComplete]);

  const activeKey = STEP_KEYS[stepIndex];
  const subMessages = MESSAGES[activeKey];
  const subIndex = Math.min(
    subMessages.length - 1,
    Math.floor(intoStep / ROTATE_MS),
  );
  const subMessage = subMessages[subIndex];

  // Progress bar fill — animated width.
  const fillProgress = useSharedValue(0);
  useEffect(() => {
    fillProgress.value = withTiming(pct / 100, {
      duration: reducedMotion ? 0 : 180,
      easing: Easing.linear,
    });
  }, [pct, reducedMotion, fillProgress]);

  const [trackWidth, setTrackWidth] = useState(0);
  const fillStyle = useAnimatedStyle(() => ({
    width: fillProgress.value * trackWidth,
  }));

  const plexBold = boldNumericFontFamily;
  const plexSemi = semiBoldFontFamily;
  const headlineFont = headlineFontFamily ?? plexSemi;

  return (
    <View style={styles.container}>
      {/* Hero — percentage, headline, gradient progress bar */}
      <View style={styles.hero}>
        <Text
          style={[
            styles.percentage,
            plexBold ? { fontFamily: plexBold } : null,
          ]}
          accessibilityLiveRegion="polite"
        >
          {pct}%
        </Text>
        <Text
          style={[
            styles.headline,
            headlineFont ? { fontFamily: headlineFont } : null,
          ]}
        >
          We&apos;re setting{"\n"}everything up for you
        </Text>
        <View
          style={styles.progressTrack}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.progressFillWrap, fillStyle]}>
            {trackWidth > 0 ? (
              <LinearGradient
                colors={["#E5535C", "#FF6B35", "#F5A623"]}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: trackWidth, height: "100%" }}
              />
            ) : null}
          </Animated.View>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.timeline}>
        {STEP_KEYS.map((key, i) => {
          const state: TimelineState =
            allDone || i < stepIndex
              ? "done"
              : i === stepIndex
                ? "active"
                : "pending";
          return (
            <TimelineRow
              key={key}
              state={state}
              color={MACRO[key]}
              label={LABELS[key]}
              value={finalValues[key]}
              subMessage={state === "active" ? subMessage : ""}
              isLast={i === STEP_KEYS.length - 1}
              reducedMotion={reducedMotion}
              valueFontFamily={plexSemi}
            />
          );
        })}
      </View>
    </View>
  );
}

const LABELS: Record<StepKey, string> = {
  calories: "Calories",
  carbs: "Carbs",
  protein: "Protein",
  fats: "Fats",
  metabolism: "Metabolism",
};

type TimelineState = "done" | "active" | "pending";

function TimelineRow({
  state,
  color,
  label,
  value,
  subMessage,
  isLast,
  reducedMotion,
  valueFontFamily,
}: {
  state: TimelineState;
  color: string;
  label: string;
  value: string;
  subMessage: string;
  isLast: boolean;
  reducedMotion: boolean;
  valueFontFamily?: string;
}) {
  const spineProgress = useSharedValue(state === "done" ? 1 : 0);
  const labelProgress = useSharedValue(state === "pending" ? 0 : 1);

  useEffect(() => {
    spineProgress.value = withTiming(state === "done" ? 1 : 0, {
      duration: reducedMotion ? 0 : 380,
      easing: Easing.out(Easing.cubic),
    });
  }, [state, reducedMotion, spineProgress]);

  useEffect(() => {
    labelProgress.value = withTiming(state === "pending" ? 0 : 1, {
      duration: reducedMotion ? 0 : 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [state, reducedMotion, labelProgress]);

  const spineStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      spineProgress.value,
      [0, 1],
      [Tokens.border, Tokens.textPrimary],
    ),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      labelProgress.value,
      [0, 1],
      [Tokens.textTertiary, Tokens.textPrimary],
    ),
  }));

  const checkEntering = reducedMotion
    ? undefined
    : FadeIn.duration(620).easing(Easing.out(Easing.cubic));
  const activeEntering = reducedMotion
    ? undefined
    : FadeIn.duration(260).easing(Easing.out(Easing.quad));
  const activeExiting = reducedMotion
    ? undefined
    : FadeOut.duration(520).easing(Easing.inOut(Easing.quad));
  const valueEntering = reducedMotion
    ? undefined
    : FadeIn.duration(420).delay(220).easing(Easing.out(Easing.quad));
  const subMessageEntering = reducedMotion
    ? undefined
    : FadeIn.duration(360).easing(Easing.out(Easing.quad));

  return (
    <View style={styles.row}>
      {!isLast ? <Animated.View style={[styles.spine, spineStyle]} /> : null}

      <View style={styles.iconSlot}>
        {state === "pending" ? <View style={styles.emptyDot} /> : null}
        {state === "active" ? (
          <Animated.View
            entering={activeEntering}
            exiting={activeExiting}
            style={[
              styles.activeBg,
              styles.iconLayer,
              { backgroundColor: color + "22" },
            ]}
          >
            <Spinner color={color} reducedMotion={reducedMotion} />
          </Animated.View>
        ) : null}
        {state === "done" ? (
          <Animated.View
            entering={checkEntering}
            style={[styles.checkCircle, styles.iconLayer]}
          >
            <Ionicons name="checkmark" size={13} color="#fff" />
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Animated.Text
            style={[styles.rowLabel, labelStyle]}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
          {state === "done" ? (
            <Animated.Text
              entering={valueEntering}
              style={[
                styles.rowValue,
                valueFontFamily ? { fontFamily: valueFontFamily } : null,
                { color },
              ]}
              numberOfLines={1}
            >
              {value}
            </Animated.Text>
          ) : null}
        </View>
        {state === "active" && subMessage ? (
          <Animated.Text
            key={subMessage}
            entering={subMessageEntering}
            style={styles.subMessage}
            numberOfLines={2}
          >
            {subMessage}
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

function Spinner({
  color,
  reducedMotion,
}: {
  color: string;
  reducedMotion: boolean;
}) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [reducedMotion, rotation]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: color + "33",
          borderTopColor: color,
        },
        animStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  hero: {
    alignItems: "center",
  },
  percentage: {
    fontSize: 64,
    fontWeight: "700",
    letterSpacing: -2.4,
    lineHeight: 64,
    color: Tokens.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  headline: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.7,
    lineHeight: 27,
    color: Tokens.textPrimary,
    textAlign: "center",
    marginTop: 10,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: Tokens.border,
    overflow: "hidden",
    marginTop: 22,
  },
  progressFillWrap: {
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  timeline: {
    marginTop: 28,
    flexShrink: 1,
  },
  row: {
    position: "relative",
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  spine: {
    position: "absolute",
    left: 11,
    top: 32,
    bottom: -8,
    width: 1.5,
  },
  iconSlot: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    marginTop: 1,
  },
  iconLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Tokens.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  activeBg: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Tokens.border,
    backgroundColor: "transparent",
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  rowLabelPending: {
    color: Tokens.textTertiary,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  subMessage: {
    marginTop: 6,
    fontSize: 13,
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: Tokens.textTertiary,
    paddingTop: 8,
    paddingBottom: 8,
    marginTop: "auto",
  },
});
