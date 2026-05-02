import { Sex } from '@/types';

export type PaceLevel = 'safe' | 'aggressive' | 'tooFast';
export type PaceReason = 'pace' | 'kcalFloor';

export interface PaceAssessment {
  level: PaceLevel;
  weeklyKg: number;
  weeklyPctBW: number;
  recommendedMinWeeks: number;
  message: string | null;
  reasonCode: PaceReason | null;
}

export interface PaceInput {
  goal: 'lose' | 'gain';
  sex?: Sex;
  currentWeightKg: number;
  targetWeightKg: number;
  timelineWeeks: number;
  tdee?: number;
  dailyKcalAdjustment?: number;
}

// Lenient thresholds (% of body weight per week). Most users dial in fast goals;
// we only nag when they're past widely-used safe-pace ceilings.
// Loss: aggressive >1%, too fast >1.5% or >1.5 kg/week absolute.
// Gain: aggressive >0.75%, too fast >1.25%.
export const LOSE_AGGRESSIVE_PCT = 0.01;
export const LOSE_TOO_FAST_PCT = 0.015;
export const LOSE_ABS_CAP_KG = 1.5;
export const GAIN_AGGRESSIVE_PCT = 0.0075;
export const GAIN_TOO_FAST_PCT = 0.0125;

// Mirror MIN_CALORIES from goalsCalculator (private there; duplicated to avoid export churn).
const MIN_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  other: 1350,
};

export function assessPace(input: PaceInput): PaceAssessment {
  const {
    goal,
    sex,
    currentWeightKg,
    targetWeightKg,
    timelineWeeks,
    tdee,
    dailyKcalAdjustment,
  } = input;

  if (
    !currentWeightKg ||
    currentWeightKg <= 0 ||
    !targetWeightKg ||
    targetWeightKg <= 0 ||
    !timelineWeeks ||
    timelineWeeks <= 0
  ) {
    return {
      level: 'safe',
      weeklyKg: 0,
      weeklyPctBW: 0,
      recommendedMinWeeks: 0,
      message: null,
      reasonCode: null,
    };
  }

  const weeklyKg = Math.abs(targetWeightKg - currentWeightKg) / timelineWeeks;
  const weeklyPctBW = weeklyKg / currentWeightKg;

  // Pace tier
  let level: PaceLevel;
  if (goal === 'lose') {
    if (weeklyPctBW > LOSE_TOO_FAST_PCT || weeklyKg > LOSE_ABS_CAP_KG) {
      level = 'tooFast';
    } else if (weeklyPctBW > LOSE_AGGRESSIVE_PCT) {
      level = 'aggressive';
    } else {
      level = 'safe';
    }
  } else {
    if (weeklyPctBW > GAIN_TOO_FAST_PCT) {
      level = 'tooFast';
    } else if (weeklyPctBW > GAIN_AGGRESSIVE_PCT) {
      level = 'aggressive';
    } else {
      level = 'safe';
    }
  }

  // Calorie feasibility — only relevant for loss goals.
  let reasonCode: PaceReason | null = level === 'safe' ? null : 'pace';
  let kcalFloorTriggered = false;
  if (
    goal === 'lose' &&
    sex != null &&
    tdee != null &&
    dailyKcalAdjustment != null
  ) {
    const projectedDailyKcal = tdee + dailyKcalAdjustment;
    const floor = MIN_KCAL[sex];
    if (projectedDailyKcal < floor) {
      level = 'tooFast';
      reasonCode = 'kcalFloor';
      kcalFloorTriggered = true;
    }
  }

  // Recommended minimum weeks to reach the 'safe' tier (next tier down from aggressive).
  // safeMaxKg is the upper bound of the 'aggressive' tier — staying under it lands in 'safe'.
  let safeMaxKgPerWeek: number;
  if (goal === 'lose') {
    safeMaxKgPerWeek = Math.min(
      currentWeightKg * LOSE_AGGRESSIVE_PCT,
      LOSE_ABS_CAP_KG,
    );
  } else {
    safeMaxKgPerWeek = currentWeightKg * GAIN_AGGRESSIVE_PCT;
  }
  const totalDeltaKg = Math.abs(targetWeightKg - currentWeightKg);
  const recommendedMinWeeks =
    safeMaxKgPerWeek > 0 ? Math.ceil(totalDeltaKg / safeMaxKgPerWeek) : 0;

  if (level === 'safe') {
    return {
      level,
      weeklyKg,
      weeklyPctBW,
      recommendedMinWeeks,
      message: null,
      reasonCode: null,
    };
  }

  const message = buildMessage({
    goal,
    kcalFloorTriggered,
  });

  return {
    level,
    weeklyKg,
    weeklyPctBW,
    recommendedMinWeeks,
    message,
    reasonCode,
  };
}

interface BuildMessageArgs {
  goal: 'lose' | 'gain';
  kcalFloorTriggered: boolean;
}

function buildMessage(args: BuildMessageArgs): string {
  const { goal, kcalFloorTriggered } = args;
  if (kcalFloorTriggered) {
    return 'We recommend a longer timeline to keep daily intake sustainable.';
  }
  if (goal === 'lose') {
    return 'We recommend a longer timeline to reduce muscle loss.';
  }
  return 'We recommend a longer timeline to reduce fat gain.';
}
