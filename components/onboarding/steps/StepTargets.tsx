import { ReviewSummary } from '@/components/goals/ReviewSummary';
import { ActivityLevel, CarbPreference, GoalType, ProteinPreference, Sex, UserGoals } from '@/types';
import { calculateGoals, cmToFeetInches, kgToLbs } from '@/utils/goalsCalculator';
import React, { useMemo } from 'react';

interface Props {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalType;
  heightUnit?: 'metric' | 'imperial';
  weightUnit?: 'metric' | 'imperial';
  targetWeightKg?: number | null;
  timelineWeeks?: number | null;
  proteinPreference?: ProteinPreference;
  carbPreference?: CarbPreference;
  onComputed: (g: UserGoals) => void;
}

export function StepTargets({
  sex,
  age,
  heightCm,
  weightKg,
  activity,
  goal,
  heightUnit = 'metric',
  weightUnit = 'metric',
  targetWeightKg,
  timelineWeeks,
  proteinPreference = 'standard',
  carbPreference = 'standard',
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
        proteinPreference,
        carbPreference,
        targetWeightKg: targetWeightKg ?? undefined,
        timelineWeeks: timelineWeeks ?? undefined,
      }),
    [sex, age, heightCm, weightKg, activity, goal, targetWeightKg, timelineWeeks, proteinPreference, carbPreference],
  );

  React.useEffect(() => {
    onComputed(computed);
  }, [computed, onComputed]);

  const heightDisplay = useMemo(() => {
    if (heightUnit === 'imperial') {
      const { feet, inches } = cmToFeetInches(heightCm);
      return `${feet}'${inches}"`;
    }
    return `${Math.round(heightCm)} cm`;
  }, [heightCm, heightUnit]);

  const weightDisplay =
    weightUnit === 'imperial'
      ? `${Math.round(kgToLbs(weightKg))} lbs`
      : `${Math.round(weightKg)} kg`;

  return (
    <ReviewSummary
      goals={computed}
      heightDisplay={heightDisplay}
      weightDisplay={weightDisplay}
      useImperial={weightUnit === 'imperial'}
    />
  );
}
