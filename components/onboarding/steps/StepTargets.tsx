import { Tokens } from '@/constants/theme';
import { ActivityLevel, GoalType, Sex, UserGoals } from '@/types';
import { calculateGoals } from '@/utils/goalsCalculator';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MacroChip } from '../MacroChip';

interface Props {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalType;
  targetWeightKg?: number | null;
  timelineWeeks?: number | null;
  onComputed: (g: UserGoals) => void;
}

const RING_SIZE = 200;
const RING_STROKE = 14;

export function StepTargets({
  sex,
  age,
  heightCm,
  weightKg,
  activity,
  goal,
  targetWeightKg,
  timelineWeeks,
  onComputed,
}: Props) {
  const computed = useMemo(
    () =>
      calculateGoals({
        sex,
        age,
        heightCm,
        weightKg,
        activityLevel: activity,
        goalType: goal,
        proteinPreference: 'standard',
        carbPreference: 'standard',
        targetWeightKg: targetWeightKg ?? undefined,
        timelineWeeks: timelineWeeks ?? undefined,
      }),
    [sex, age, heightCm, weightKg, activity, goal, targetWeightKg, timelineWeeks],
  );

  React.useEffect(() => {
    onComputed(computed);
  }, [computed, onComputed]);

  const radius = (RING_SIZE - RING_STROKE) / 2;

  return (
    <View style={styles.container}>
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke={Tokens.macroKcal}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.kcalValue}>{computed.targetKcal}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>
      </View>
      <View style={styles.chips}>
        <MacroChip color={Tokens.macroProtein} label={`${computed.targetProtein}g protein`} />
        <MacroChip color={Tokens.macroFat} label={`${computed.targetFat}g fat`} />
        <MacroChip color={Tokens.macroCarbs} label={`${computed.targetCarbs}g carbs`} />
      </View>
      <Text style={styles.caption}>You can change these anytime in Settings.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 24,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kcalValue: {
    fontFamily: 'IBMPlexSans_700Bold',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    color: Tokens.textPrimary,
  },
  kcalUnit: {
    fontSize: 14,
    color: Tokens.textSecondary,
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  caption: {
    fontSize: 13,
    color: Tokens.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
