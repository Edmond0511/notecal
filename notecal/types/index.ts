export interface NutritionInfo {
  calories: number;
  protein: number; // in grams
  carbs: number;   // in grams
  fat: number;     // in grams
  fiber?: number;  // in grams
  sugar?: number;  // in grams
}

export interface FoodEntry {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  nutrition: NutritionInfo;
  timestamp: Date;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD format
  entries: FoodEntry[];
  totals: NutritionInfo;
}

export interface FoodSearchResult {
  food_name: string;
  brand_name?: string;
  serving_qty: number;
  serving_unit: string;
  nf_calories: number;
  nf_protein: number;
  nf_carbohydrates: number;
  nf_total_fat: number;
  nf_dietary_fiber?: number;
  nf_sugars?: number;
  nf_fiber?: number;
}

export interface AppState {
  currentDate: string;
  dailyLog: DailyLog;
  searchResults: FoodSearchResult[];
  isSearching: boolean;
  searchQuery: string;
  selectedFood: FoodSearchResult | null;
  inputQuantity: string;
  inputUnit: string;
}
