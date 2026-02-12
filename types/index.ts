export interface NutritionReasoning {
  interpretation: string;
  assumptions: string[];
  portionNotes?: string;
  dataSource?: string;
  confidenceExplanation?: string;
  confidenceAnalysis?: string; // Detailed paragraph explaining confidence calculation
}

export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
  water?: number;
}

export interface FoodItem {
  id: string;
  entryId: string;
  label: string;
  brand?: string;
  prep?: string;
  qty: number;
  unit: string;
  servings?: number; // Multiplier for the portion (1 = as entered, 2 = double, etc.)
  source: 'FDC' | 'CNF' | 'OFF' | 'fallback' | 'local';
  sourceId: string;
  macros: Macros;
  originalMacros?: Macros; // Original AI-calculated values for revert
  confidence: number; // 0-1 scale
  citations: {
    provider: string;
    url: string;
  }[];
  reasoning?: NutritionReasoning;
}

export interface Entry {
  id: string;
  date: string; // YYYYMMDD format
  rawText: string;
  inlineKcal?: number | null;
  status: 'pending' | 'ok' | 'error';
  items: FoodItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedEntry {
  id: string;
  rawText: string;         // Original text (e.g., "- chicken breast, 150g")
  items: FoodItem[];       // Pre-resolved nutrition data
  totalKcal: number;       // Cached total calories for quick display
  createdAt: Date;
  lastUsedAt: Date;
  usageCount: number;
}

export interface WeightEntry {
  id: string;
  date: string;        // YYYYMMDD
  weightKg: number;    // always stored in kg
  note?: string;
  photoUri?: string;   // local file URI
  createdAt: string;   // ISO string
}

export interface DailyTotals {
  date: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
  water?: number;
}

// Goals Feature Types
export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'      // Desk job, no exercise (1.2)
  | 'light'          // 1-3 days/week (1.375)
  | 'moderate'       // 3-5 days/week (1.55)
  | 'active'         // 6-7 days/week (1.725)
  | 'extra_active';  // Physical job + exercise (1.9)

export type GoalType = 'lose' | 'maintain' | 'gain';

export type ProteinPreference = 'low' | 'standard' | 'high';
export type CarbPreference = 'low' | 'standard' | 'high';
export type UnitSystem = 'metric' | 'imperial';

export interface UserGoalsInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  proteinPreference?: ProteinPreference;
  carbPreference?: CarbPreference;
  targetWeightKg?: number;
  timelineWeeks?: number;
}

export interface ManualTargets {
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
  water?: number;
}

export interface UserGoals extends UserGoalsInput {
  // Calculated targets
  bmr: number;
  tdee: number;
  targetKcal: number;
  targetProtein: number;
  targetFat: number;
  targetCarbs: number;
  // Optional manual overrides
  manualTargets?: ManualTargets | null;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface NutritionResolveRequest {
  textLine: string;
  locale?: 'en-CA' | 'en-US';
}

export interface NutritionResolveResponse {
  resolved: FoodItem[];
  totals: Macros;
  errors?: string[];
}

export interface Document {
  date: string; // YYYYMMDD format
  content: string; // Complete document text including non-food content
  lastModified: Date;
}

export interface AppState {
  entries: Entry[];
  documents: Document[];
  currentDate: string;
  isLoading: boolean;
  // Goals state
  goals: UserGoals | null;
  preferredUnits: UnitSystem;
  // Saved entries state
  savedEntries: SavedEntry[];
  // Weight tracking state
  weightEntries: WeightEntry[];
  // Actions
  addEntry: (rawText: string) => void;
  updateEntry: (id: string, rawText: string) => Promise<void>;
  deleteEntry: (id: string) => void;
  setCurrentDate: (date: string) => void;
  getEntriesForDate: (date: string) => Entry[];
  getDailyTotals: (date: string) => DailyTotals;
  // Document actions
  saveDocument: (date: string, content: string) => void;
  getDocument: (date: string) => Document | undefined;
  getAllDocuments: () => Document[];
  deleteDocument: (date: string) => void;
  // Goals actions
  setGoals: (goals: UserGoals) => void;
  clearGoals: () => void;
  setPreferredUnits: (units: UnitSystem) => void;
  setManualTargets: (targets: ManualTargets | null) => void;
  // Saved entries actions
  saveEntry: (entry: Entry) => void;
  deleteSavedEntry: (id: string) => void;
  useSavedEntry: (savedEntry: SavedEntry) => Entry;
  createSavedEntry: (rawText: string) => Promise<{ success: boolean; error?: string }>;
  // Item editing actions
  updateEntryItemMacro: (entryId: string, itemId: string, macroKey: keyof Macros, value: number) => void;
  revertEntryItemSingleMacro: (entryId: string, itemId: string, macroKey: keyof Macros) => void;
  revertEntryItemMacros: (entryId: string, itemId: string) => void;
  // Quantity editing action (servings multiplier)
  updateEntryItemQuantity: (entryId: string, itemId: string, newServings: number) => void;
  // Correction action
  correctEntryItem: (entryId: string, itemId: string, feedback: string) => Promise<void>;
  // Weight tracking actions
  addWeightEntry: (entry: Omit<WeightEntry, 'id' | 'createdAt'>) => void;
  updateWeightEntry: (id: string, updates: Partial<Pick<WeightEntry, 'date' | 'weightKg' | 'note' | 'photoUri'>>) => void;
  deleteWeightEntry: (id: string) => void;
  // Offline queue drain
  enqueuePendingEntries: () => void;
}