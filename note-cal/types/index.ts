export interface FoodItem {
  id: string;
  entryId: string;
  label: string;
  brand?: string;
  prep?: string;
  qty: number;
  unit: string;
  source: 'FDC' | 'CNF' | 'OFF';
  sourceId: string;
  macros: {
    kcal: number;
    protein: number;
    fat: number;
  };
  confidence: number; // 0-1 scale
  citations: {
    provider: string;
    url: string;
  }[];
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

export interface DailyTotals {
  date: string;
  kcal: number;
  protein: number;
  fat: number;
}

export interface NutritionResolveRequest {
  textLine: string;
  locale?: 'en-CA' | 'en-US';
}

export interface NutritionResolveResponse {
  resolved: FoodItem[];
  totals: {
    kcal: number;
    protein: number;
    fat: number;
  };
  errors?: string[];
}

export interface AppState {
  entries: Entry[];
  currentDate: string;
  isLoading: boolean;
  // Actions
  addEntry: (rawText: string) => Promise<void>;
  updateEntry: (id: string, rawText: string) => Promise<void>;
  deleteEntry: (id: string) => void;
  setCurrentDate: (date: string) => void;
  getEntriesForDate: (date: string) => Entry[];
  getDailyTotals: (date: string) => DailyTotals;
}