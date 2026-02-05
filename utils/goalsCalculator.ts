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

// Calorie adjustments for different goals
const GOAL_ADJUSTMENTS: Record<GoalType, number> = {
  lose_fast: -1000,
  lose: -500,
  maintain: 0,
  gain: 250,
  gain_fast: 500,
};

// Macro percentages based on goal type
// Format: { protein: %, fat: %, carbs: % }
const MACRO_PERCENTAGES: Record<GoalType, { protein: number; fat: number; carbs: number }> = {
  lose_fast: { protein: 35, fat: 30, carbs: 35 },
  lose: { protein: 30, fat: 30, carbs: 40 },
  maintain: { protein: 25, fat: 30, carbs: 45 },
  gain: { protein: 30, fat: 25, carbs: 45 },
  gain_fast: { protein: 25, fat: 25, carbs: 50 },
};

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
 * Calculate target calories based on TDEE and goal type
 * Applies safety floor to prevent dangerously low calorie targets
 */
export function calculateTargetCalories(
  tdee: number,
  goalType: GoalType,
  sex: Sex
): number {
  const adjustment = GOAL_ADJUSTMENTS[goalType];
  const targetCalories = tdee + adjustment;
  const minCalories = MIN_CALORIES[sex];

  // Enforce minimum calorie floor for safety
  return Math.max(targetCalories, minCalories);
}

/**
 * Calculate macro targets in grams based on calorie target and goal type
 * Optionally adjusts based on protein/carb preferences
 */
export function calculateMacros(
  targetKcal: number,
  goalType: GoalType,
  proteinPref: ProteinPreference = 'standard',
  carbPref: CarbPreference = 'standard'
): { protein: number; fat: number; carbs: number } {
  let { protein: proteinPct, fat: fatPct, carbs: carbsPct } = MACRO_PERCENTAGES[goalType];

  // Adjust protein based on preference
  if (proteinPref === 'high') {
    proteinPct += 10;
    carbsPct -= 10;
  } else if (proteinPref === 'low') {
    proteinPct -= 5;
    carbsPct += 5;
  }

  // Adjust carbs based on preference
  if (carbPref === 'low') {
    carbsPct -= 15;
    fatPct += 15;
  } else if (carbPref === 'high') {
    carbsPct += 10;
    fatPct -= 10;
  }

  // Convert percentages to grams
  // Protein: 4 cal/g, Carbs: 4 cal/g, Fat: 9 cal/g
  const proteinGrams = Math.round((targetKcal * (proteinPct / 100)) / 4);
  const fatGrams = Math.round((targetKcal * (fatPct / 100)) / 9);
  const carbsGrams = Math.round((targetKcal * (carbsPct / 100)) / 4);

  return {
    protein: proteinGrams,
    fat: fatGrams,
    carbs: carbsGrams,
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
  } = input;

  // Step 1: Calculate BMR
  const bmr = calculateBMR(sex, weightKg, heightCm, age);

  // Step 2: Calculate TDEE
  const tdee = calculateTDEE(bmr, activityLevel);

  // Step 3: Calculate target calories
  const targetKcal = calculateTargetCalories(tdee, goalType, sex);

  // Step 4: Calculate macros
  const macros = calculateMacros(targetKcal, goalType, proteinPreference, carbPreference);

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
      description: 'Little to no regular exercise',
    },
    light: {
      title: 'Lightly Active',
      description: 'Light exercise 1-3 days/week',
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
    lose_fast: {
      title: 'Lose Fast',
      description: 'Aggressive calorie deficit',
      weeklyChange: '~2 lb/week loss',
    },
    lose: {
      title: 'Lose Weight',
      description: 'Moderate calorie deficit',
      weeklyChange: '~1 lb/week loss',
    },
    maintain: {
      title: 'Maintain',
      description: 'Keep current weight',
      weeklyChange: 'Weight stable',
    },
    gain: {
      title: 'Gain Weight',
      description: 'Lean muscle building',
      weeklyChange: '~0.5 lb/week gain',
    },
    gain_fast: {
      title: 'Gain Fast',
      description: 'Bulk phase',
      weeklyChange: '~1 lb/week gain',
    },
  };
  return descriptions[goal];
}
