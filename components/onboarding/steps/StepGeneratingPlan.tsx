import { Tokens } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  onComplete: () => void;
}

const TASKS = [
  'Reading your profile',
  'Estimating your metabolism',
  'Calibrating to your activity',
  'Designing your macro plan',
  'Finalizing your daily targets',
];

// Decelerating cadence: shorter early ticks, longer final tick reduces
// perceived wait while keeping the reveal feeling earned.
const TASK_DURATIONS_MS = [1000, 1100, 1100, 1200, 1500];
const FINAL_PAUSE_MS = 400;
const TOTAL_VISUAL_MS = TASK_DURATIONS_MS.reduce((a, b) => a + b, 0);

export function StepGeneratingPlan({ onComplete }: Props) {
  const [completedCount, setCompletedCount] = useState(0);
  const progress = useSharedValue(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: TOTAL_VISUAL_MS,
      easing: Easing.out(Easing.cubic),
    });

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cumulative = 0;
    TASK_DURATIONS_MS.forEach((dur, idx) => {
      cumulative += dur;
      const isLast = idx === TASK_DURATIONS_MS.length - 1;
      timers.push(
        setTimeout(() => {
          if (isLast) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            Haptics.selectionAsync();
          }
          setCompletedCount(idx + 1);
        }, cumulative),
      );
    });

    timers.push(
      setTimeout(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onComplete();
      }, TOTAL_VISUAL_MS + FINAL_PAUSE_MS),
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
        {TASKS.map((label, idx) => {
          const isDone = idx < completedCount;
          const isActive = idx === completedCount;
          const isPending = idx > completedCount;

          return (
            <View
              key={label}
              style={[styles.row, idx === 0 && styles.rowFirst]}
            >
              <View style={styles.iconSlot}>
                {isDone ? (
                  <Animated.View
                    entering={FadeIn.duration(180)}
                    style={[styles.iconCircle, styles.iconCircleDone]}
                  >
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </Animated.View>
                ) : isActive ? (
                  <ActivityIndicator size="small" color={Tokens.accent} />
                ) : (
                  <View style={[styles.iconCircle, styles.iconCirclePending]} />
                )}
              </View>
              <Text
                style={[
                  styles.rowLabel,
                  isPending && styles.rowLabelPending,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressFillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
  },
  card: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.07)',
    ...Tokens.shadowLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Tokens.border,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDone: {
    backgroundColor: Tokens.accent,
  },
  iconCirclePending: {
    borderWidth: 1.5,
    borderColor: Tokens.border,
    backgroundColor: 'transparent',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  rowLabelPending: {
    color: Tokens.textTertiary,
  },
  progressTrack: {
    marginTop: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Tokens.accent,
    borderRadius: 2,
  },
});
