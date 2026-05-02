import { Tokens } from '@/constants/theme';
import { GoalType, Sex } from '@/types';
import { calculateGoalAdjustment, kgToLbs, lbsToKg } from '@/utils/goalsCalculator';
import { assessPace } from '@/utils/paceAdvisor';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const WEEKS_PER_MONTH = 52 / 12;
const MIN_MONTHS = 1;
const MAX_MONTHS = 18;
const DEFAULT_MONTHS = 3;
const WEIGHT_RANGE_LBS = 80;
const WEIGHT_RANGE_KG = 36;
const THUMB_SIZE = 28;
const TRACK_HEIGHT = 6;

interface Props {
  goal: Exclude<GoalType, 'maintain'>;
  currentWeightKg: number;
  weightUnit: 'metric' | 'imperial';
  targetWeightKg: number | null;
  timelineWeeks: number | null;
  onChangeTargetWeightKg: (kg: number | null) => void;
  onChangeTimelineWeeks: (weeks: number | null) => void;
  sex?: Sex;
  tdee?: number;
}

export function StepWeightTarget({
  goal,
  currentWeightKg,
  weightUnit,
  targetWeightKg,
  timelineWeeks,
  onChangeTargetWeightKg,
  onChangeTimelineWeeks,
  sex,
  tdee,
}: Props) {
  const isImperial = weightUnit === 'imperial';
  const unitLabel = isImperial ? 'lbs' : 'kg';

  const currentDisplay = isImperial
    ? Math.round(kgToLbs(currentWeightKg))
    : Math.round(currentWeightKg);

  const fromDisplayUnit = (n: number) => (isImperial ? lbsToKg(n) : n);
  const toDisplayUnit = (kg: number) =>
    Math.round(isImperial ? kgToLbs(kg) : kg);

  const weightRange = useMemo(() => {
    const span = isImperial ? WEIGHT_RANGE_LBS : WEIGHT_RANGE_KG;
    if (goal === 'lose') {
      const max = Math.max(1, currentDisplay - 1);
      const min = Math.max(1, currentDisplay - span);
      return { min, max };
    }
    return { min: currentDisplay + 1, max: currentDisplay + span };
  }, [goal, currentDisplay, isImperial]);

  const targetDisplay = useMemo(() => {
    if (targetWeightKg == null) {
      return goal === 'lose' ? currentDisplay - 5 : currentDisplay + 5;
    }
    return toDisplayUnit(targetWeightKg);
  }, [targetWeightKg, currentDisplay, goal, isImperial]);

  // Seed defaults on mount.
  useEffect(() => {
    if (targetWeightKg == null) {
      const seed = clamp(
        goal === 'lose' ? currentDisplay - 5 : currentDisplay + 5,
        weightRange.min,
        weightRange.max,
      );
      onChangeTargetWeightKg(fromDisplayUnit(seed));
    }
    if (timelineWeeks == null) {
      onChangeTimelineWeeks(DEFAULT_MONTHS * WEEKS_PER_MONTH);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWeightChange = (n: number) => {
    onChangeTargetWeightKg(fromDisplayUnit(n));
  };

  const months = useMemo(() => {
    if (timelineWeeks == null) return DEFAULT_MONTHS;
    return clamp(
      Math.round(timelineWeeks / WEEKS_PER_MONTH),
      MIN_MONTHS,
      MAX_MONTHS,
    );
  }, [timelineWeeks]);

  const handleMonthsChange = (m: number) => {
    onChangeTimelineWeeks(m * WEEKS_PER_MONTH);
  };

  const summary = useMemo(() => {
    if (
      targetWeightKg == null ||
      timelineWeeks == null ||
      timelineWeeks <= 0 ||
      currentWeightKg <= 0
    ) {
      return null;
    }

    const weeklyKg = Math.abs((targetWeightKg - currentWeightKg) / timelineWeeks);
    const weeklyDisplay = isImperial
      ? kgToLbs(weeklyKg).toFixed(1)
      : weeklyKg.toFixed(2);

    const date = new Date();
    date.setDate(date.getDate() + Math.round(timelineWeeks * 7));
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return {
      rate: `${weeklyDisplay} ${unitLabel}/week`,
      date: dateStr,
    };
  }, [targetWeightKg, timelineWeeks, currentWeightKg, isImperial, unitLabel]);

  const paceAssessment = useMemo(() => {
    if (
      targetWeightKg == null ||
      timelineWeeks == null ||
      timelineWeeks <= 0 ||
      currentWeightKg <= 0
    ) {
      return null;
    }
    const dailyKcalAdjustment = calculateGoalAdjustment(
      currentWeightKg,
      targetWeightKg,
      timelineWeeks,
    );
    return assessPace({
      goal,
      sex,
      currentWeightKg,
      targetWeightKg,
      timelineWeeks,
      tdee,
      dailyKcalAdjustment,
    });
  }, [
    goal,
    sex,
    currentWeightKg,
    targetWeightKg,
    timelineWeeks,
    tdee,
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.heroBlock}>
        <Text style={styles.heroValue}>{targetDisplay}</Text>
        <Text style={styles.heroUnit}>{unitLabel}</Text>
      </View>

      <View style={styles.sliderSection}>
        <RangeSlider
          value={targetDisplay}
          min={weightRange.min}
          max={weightRange.max}
          onChange={handleWeightChange}
        />
        <View style={styles.scaleRow}>
          <Text style={styles.scaleText}>
            {weightRange.min} {unitLabel}
          </Text>
          <Text style={styles.scaleText}>
            {weightRange.max} {unitLabel}
          </Text>
        </View>
      </View>

      <View style={styles.timelineSection}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineLabel}>Timeline</Text>
          <Text style={styles.timelineValue}>
            {months} {months === 1 ? 'month' : 'months'}
          </Text>
        </View>
        <RangeSlider
          value={months}
          min={MIN_MONTHS}
          max={MAX_MONTHS}
          onChange={handleMonthsChange}
        />
        <View style={styles.scaleRow}>
          <Text style={styles.scaleText}>1 mo</Text>
          <Text style={styles.scaleText}>{MAX_MONTHS} mo</Text>
        </View>
      </View>

      {summary && (
        <View style={styles.summary}>
          <Text style={styles.summaryRate}>About {summary.rate}</Text>
          <Text style={styles.summaryDate}>Reach by {summary.date}</Text>
        </View>
      )}

      {paceAssessment && paceAssessment.level !== 'safe' && paceAssessment.message && (
        <PaceCallout message={paceAssessment.message} />
      )}
    </View>
  );
}

function PaceCallout({ message }: { message: string }) {
  return (
    <View style={styles.calloutBox}>
      <Ionicons
        name="warning"
        size={16}
        color={Tokens.error}
        style={styles.calloutIcon}
      />
      <Text style={styles.calloutText}>{message}</Text>
    </View>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function RangeSlider({ value, min, max, onChange }: SliderProps) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(valueToProgress(value, min, max));
  const lastEmitted = useRef(value);

  useEffect(() => {
    progress.value = withSpring(valueToProgress(value, min, max), {
      damping: 22,
      stiffness: 280,
    });
    lastEmitted.current = value;
  }, [value, min, max, progress]);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const emit = (next: number) => {
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      Haptics.selectionAsync();
      onChange(next);
    }
  };

  const updateFromX = (x: number) => {
    'worklet';
    if (width <= 0 || max <= min) return;
    const clamped = Math.max(0, Math.min(width, x));
    const ratio = clamped / width;
    progress.value = ratio;
    const next = Math.round(min + ratio * (max - min));
    runOnJS(emit)(next);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => updateFromX(e.x))
    .onUpdate((e) => updateFromX(e.x));
  const tap = Gesture.Tap().onEnd((e) => updateFromX(e.x));
  const composed = Gesture.Simultaneous(pan, tap);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: progress.value * Math.max(0, width - THUMB_SIZE),
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.sliderHitArea} onLayout={onLayout}>
        <View style={styles.sliderTrack}>
          <Animated.View style={[styles.sliderFill, fillStyle]} />
        </View>
        <Animated.View style={[styles.sliderThumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

function valueToProgress(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    gap: 28,
  },
  heroBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
  },
  heroValue: {
    fontSize: 56,
    fontWeight: '700',
    color: Tokens.textPrimary,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  heroUnit: {
    fontSize: 20,
    fontWeight: '500',
    color: Tokens.textTertiary,
  },
  sliderSection: {
    gap: 6,
  },
  timelineSection: {
    gap: 6,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timelineLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B6B6B',
    textTransform: 'capitalize',
  },
  timelineValue: {
    fontSize: 17,
    fontWeight: '600',
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  sliderHitArea: {
    height: THUMB_SIZE + 12,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: Tokens.border,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: Tokens.accent,
    borderRadius: TRACK_HEIGHT / 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Tokens.accent,
    marginTop: -THUMB_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleText: {
    fontSize: 12,
    color: Tokens.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  summary: {
    alignItems: 'center',
    gap: 4,
  },
  summaryRate: {
    fontSize: 16,
    fontWeight: '600',
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  summaryDate: {
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  calloutBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Tokens.errorTint,
  },
  calloutIcon: {
    marginTop: 1,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Tokens.error,
  },
});
