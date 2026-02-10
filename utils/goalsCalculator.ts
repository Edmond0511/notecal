import {
  Sex,
  ActivityLevel,
  GoalType,
  ProteinPreference,
  CarbPreference,
  UserGoalsInput,
  UserGoals,
} from '@/types';

// Activity level multipliers for TDEE calculation
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  extra_active: 1.9,
};

// Default calorie adjustments for goals (used when no weight target is set)
const GOAL_ADJUSTMENTS: Record<GoalType, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

// Protein multipliers (g per kg body weight) anchored to goal type
const PROTEIN_MULTIPLIERS: Record<GoalType, number> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
};

// Protein preference adjustments (g/kg)
const PROTEIN_PREF_ADJUSTMENTS: Record<ProteinPreference, number> = {
  low: -0.4,
  standard: 0,
  high: 0.2,
};

// Fat percentage of total calories based on carb preference
const FAT_PERCENTAGE: Record<CarbPreference, number> = {
  low: 35,
  standard: 25,
  high: 20,
};

const MAX_PROTEIN_G = 220;
const MIN_CARBS_G = 50;

// Minimum calorie floors for safety
const MIN_CALORIES: Record<Sex, number> = {
  male: 1500,
  female: 1200,
};

/**
 * Calculate Basal Metabolic Rate using Mifflin-St Jeor equation
 */
export function calculateBMR(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number
): number {
  // Mifflin-St Jeor equation
  const baseBMR = 10 * weightKg + 6.25 * heightCm - 5 * age;

  if (sex === 'male') {
    return Math.round(baseBMR + 5);
  } else {
    return Math.round(baseBMR - 161);
  }
}

/**
 * Calculate Total Daily Energy Expenditure
 * TDEE = BMR x Activity Multiplier
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  return Math.round(bmr * multiplier);
}

/**
 * Calculate calorie adjustment based on weight target and timeline.
 * Uses 7700 kcal per kg of body weight change.
 * Returns raw value — calorie floor in calculateTargetCalories prevents dangerous targets.
 */
export function calculateGoalAdjustment(
  currentWeightKg: number,
  targetWeightKg: number,
  timelineWeeks: number
): number {
  const weeklyChangeKg = (targetWeightKg - currentWeightKg) / timelineWeeks;
  return Math.round((weeklyChangeKg * 7700) / 7);
}

/**
 * Calculate target calories based on TDEE and goal type
 * When targetWeightKg and timelineWeeks are provided, uses dynamic adjustment.
 * Otherwise uses default GOAL_ADJUSTMENTS.
 * Applies safety floor to prevent dangerously low calorie targets.
 */
export function calculateTargetCalories(
  tdee: number,
  goalType: GoalType,
  sex: Sex,
  targetWeightKg?: number,
  currentWeightKg?: number,
  timelineWeeks?: number
): number {
  let adjustment: number;

  if (targetWeightKg != null && currentWeightKg != null && timelineWeeks != null && timelineWeeks > 0) {
    adjustment = calculateGoalAdjustment(currentWeightKg, targetWeightKg, timelineWeeks);
  } else {
    adjustment = GOAL_ADJUSTMENTS[goalType];
  }

  let targetCalories = tdee + adjustment;

  // Enforce minimum calorie floor for safety
  const minCalories = MIN_CALORIES[sex];
  return Math.max(targetCalories, minCalories);
}

/**
 * Calculate macro targets using the "Protein Anchor" method:
 * 1. Protein is anchored to body weight (g/kg), not calorie percentage
 * 2. Fat is set as a percentage of calories with a hormonal health floor
 * 3. Carbs fill the remaining calories
 */
export function calculateMacros(
  targetKcal: number,
  goalType: GoalType,
  weightKg: number,
  proteinPref: ProteinPreference = 'standard',
  carbPref: CarbPreference = 'standard'
): { protein: number; fat: number; carbs: number } {
  // Step A: Protein (anchored to body weight)
  const baseMultiplier = PROTEIN_MULTIPLIERS[goalType];
  const prefAdjustment = PROTEIN_PREF_ADJUSTMENTS[proteinPref];
  let proteinG = Math.round(weightKg * (baseMultiplier + prefAdjustment));
  proteinG = Math.min(proteinG, MAX_PROTEIN_G);

  // Step B: Fat (percentage of calories with hormonal floor)
  const fatPct = FAT_PERCENTAGE[carbPref];
  const fatFromPct = Math.round((targetKcal * (fatPct / 100)) / 9);
  const fatFloor = Math.round(weightKg * 0.8);
  let fatG = Math.max(fatFromPct, fatFloor);

  // Step C: Carbs (fill remaining calories)
  let remainingCal = targetKcal - (proteinG * 4) - (fatG * 9);
  let carbsG = Math.round(remainingCal / 4);

  // If carbs go below minimum, reduce fat to 20% first, then reduce protein
  if (carbsG < MIN_CARBS_G) {
    const fatAt20Pct = Math.round((targetKcal * 0.20) / 9);
    fatG = Math.max(fatAt20Pct, fatFloor);
    remainingCal = targetKcal - (proteinG * 4) - (fatG * 9);
    carbsG = Math.round(remainingCal / 4);

    if (carbsG < MIN_CARBS_G) {
      // Reduce protein to make room for minimum carbs
      const calForProtein = targetKcal - (fatG * 9) - (MIN_CARBS_G * 4);
      proteinG = Math.max(Math.round(calForProtein / 4), 0);
      carbsG = MIN_CARBS_G;
    }
  }

  return {
    protein: proteinG,
    fat: fatG,
    carbs: carbsG,
  };
}

/**
 * Calculate complete goals from user input
 * Returns UserGoals with all calculated values
 */
export function calculateGoals(input: UserGoalsInput): UserGoals {
  const {
    sex,
    age,
    heightCm,
    weightKg,
    activityLevel,
    goalType,
    proteinPreference = 'standard',
    carbPreference = 'standard',
    targetWeightKg,
    timelineWeeks,
  } = input;

  // Step 1: Calculate BMR
  const bmr = calculateBMR(sex, weightKg, heightCm, age);

  // Step 2: Calculate TDEE
  const tdee = calculateTDEE(bmr, activityLevel);

  // Step 3: Calculate target calories (with optional weight-based adjustment)
  const targetKcal = calculateTargetCalories(
    tdee, goalType, sex, targetWeightKg, weightKg, timelineWeeks
  );

  // Step 4: Calculate macros
  const macros = calculateMacros(targetKcal, goalType, weightKg, proteinPreference, carbPreference);

  const now = new Date();

  return {
    ...input,
    proteinPreference,
    carbPreference,
    bmr,
    tdee,
    targetKcal,
    targetProtein: macros.protein,
    targetFat: macros.fat,
    targetCarbs: macros.carbs,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert height from feet/inches to centimeters
 */
export function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54 * 10) / 10;
}

/**
 * Convert height from centimeters to feet/inches
 */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches: inches === 12 ? 0 : inches };
}

/**
 * Convert weight from pounds to kilograms
 */
export function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.453592 * 10) / 10;
}

/**
 * Convert weight from kilograms to pounds
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

/**
 * Get human-readable activity level description
 */
export function getActivityLevelDescription(level: ActivityLevel): {
  title: string;
  description: string;
} {
  const descriptions: Record<ActivityLevel, { title: string; description: string }> = {
    sedentary: {
      title: 'Sedentary',
      description: 'Office job, mostly sitting',
    },
    light: {
      title: 'Light Activity',
      description: 'Exercise 1-3 days OR standing job',
    },
    moderate: {
      title: 'Moderately Active',
      description: 'Moderate exercise 3-5 days/week',
    },
    active: {
      title: 'Very Active',
      description: 'Hard exercise 6-7 days/week',
    },
    extra_active: {
      title: 'Extra Active',
      description: 'Physical job + daily exercise',
    },
  };
  return descriptions[level];
}

/**
 * Get human-readable goal type description
 */
export function getGoalTypeDescription(goal: GoalType): {
  title: string;
  description: string;
  weeklyChange: string;
} {
  const descriptions: Record<GoalType, { title: string; description: string; weeklyChange: string }> = {
    lose: {
      title: 'Lose Weight',
      description: 'Calorie deficit to lose weight',
      weeklyChange: 'Set your own target',
    },
    maintain: {
      title: 'Maintain',
      description: 'Keep current weight',
      weeklyChange: 'Weight stable',
    },
    gain: {
      title: 'Gain Weight',
      description: 'Calorie surplus to build muscle',
      weeklyChange: 'Set your own target',
    },
  };
  return descriptions[goal];
}
