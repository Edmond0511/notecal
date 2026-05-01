import { ActivityLevel, GoalType, Sex } from '@/types';

export interface OnboardingData {
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  heightUnit: 'metric' | 'imperial';
  weightUnit: 'metric' | 'imperial';
  activity: ActivityLevel | null;
  goal: GoalType | null;
  targetWeightKg: number | null;
  timelineWeeks: number | null;
}

export function canAdvance(step: number, data: OnboardingData): boolean {
  switch (step) {
    case 0:
      return data.sex !== null;
    case 1:
      return data.age !== null && data.age >= 13 && data.age <= 100;
    case 2:
      return (data.heightCm ?? 0) > 0 && (data.weightKg ?? 0) > 0;
    case 3:
      return data.activity !== null;
    case 4:
      return data.goal !== null;
    case 5: {
      // Weight target step (only reached when goal is lose/gain)
      if (
        data.targetWeightKg == null ||
        data.targetWeightKg <= 0 ||
        data.timelineWeeks == null ||
        data.timelineWeeks <= 0 ||
        data.weightKg == null
      ) {
        return false;
      }
      if (data.goal === 'lose') return data.targetWeightKg < data.weightKg;
      if (data.goal === 'gain') return data.targetWeightKg > data.weightKg;
      return true;
    }
    case 6:
      return true;
    default:
      return false;
  }
}
