export interface FoodItem {
  id: string;
  entryId: string;
  label: string;
  brand?: string;
  prep?: string;
  qty: number;
  unit: string;
  source: 'FDC' | 'CNF' | 'OFF' | 'fallback';
  sourceId: string;
  macros: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
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
    carbs: number;
  };
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
  // Actions
  addEntry: (rawText: string) => Promise<void>;
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
}