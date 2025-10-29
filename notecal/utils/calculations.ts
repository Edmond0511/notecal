import { NutritionInfo, FoodEntry } from '../types';

export const calculateTotals = (entries: FoodEntry[]): NutritionInfo => {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + entry.nutrition.calories,
      protein: totals.protein + entry.nutrition.protein,
      carbs: totals.carbs + entry.nutrition.carbs,
      fat: totals.fat + entry.nutrition.fat,
      fiber: (totals.fiber || 0) + (entry.nutrition.fiber || 0),
      sugar: (totals.sugar || 0) + (entry.nutrition.sugar || 0),
    }),
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    }
  );
};

export const calculateNutritionForQuantity = (
  baseNutrition: NutritionInfo,
  baseQuantity: number,
  targetQuantity: number
): NutritionInfo => {
  const ratio = targetQuantity / baseQuantity;
  return {
    calories: Math.round(baseNutrition.calories * ratio),
    protein: Math.round((baseNutrition.protein * ratio) * 10) / 10,
    carbs: Math.round((baseNutrition.carbs * ratio) * 10) / 10,
    fat: Math.round((baseNutrition.fat * ratio) * 10) / 10,
    fiber: baseNutrition.fiber ? Math.round((baseNutrition.fiber * ratio) * 10) / 10 : undefined,
    sugar: baseNutrition.sugar ? Math.round((baseNutrition.sugar * ratio) * 10) / 10 : undefined,
  };
};

export const formatNumber = (num: number, decimals: number = 0): string => {
  return num.toFixed(decimals);
};

export const getCurrentDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const generateId = (): string => {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};
