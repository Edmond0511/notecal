import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Entry, DailyTotals, NutritionResolveResponse, Document, UserGoals, UnitSystem, ManualTargets } from '@/types';
import { resolveNutrition, NutritionApiError, NutritionRateLimitError, NutritionQuotaExceededError } from '@/services/nutritionApi';
import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const USE_AI_API = true; // Use AI-powered nutrition API

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      entries: [],
      documents: [],
      currentDate: new Date().toISOString().split('T')[0].replace(/-/g, ''), // YYYYMMDD
      isLoading: false,
      goals: null,
      preferredUnits: 'metric' as UnitSystem,

  addEntry: async (rawText: string) => {
    // Only process lines that start with "- "
    if (!rawText.trim().startsWith('-')) {
      return;
    }

    const textLine = rawText.trim().substring(1).trim(); // Remove "- " prefix

    // Don't create an entry if there's no food text after the dash
    if (!textLine) {
      return;
    }

    const entryId = Date.now().toString();

    // Create entry with pending status immediately (for UI loading indicator)
    const pendingEntry: Entry = {
      id: entryId,
      date: get().currentDate,
      rawText,
      inlineKcal: null,
      status: 'pending',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add pending entry to state immediately
    set((state) => ({
      entries: [...state.entries, pendingEntry],
      isLoading: true,
    }));

    try {
      // Call AI API to resolve nutrition
      let nutritionData: NutritionResolveResponse;

      if (USE_AI_API) {
        try {
          // Get current user ID if available (from auth state)
          const { data: { user } } = await supabase.auth.getUser();
          console.log('🔍 Calling nutrition API for:', textLine);
          nutritionData = await resolveNutrition(textLine, {
            userId: user?.id
          });
          console.log('✅ Nutrition API response:', nutritionData);
        } catch (error) {
          if (error instanceof NutritionQuotaExceededError) {
            // Handle quota exceeded with user-friendly message
            console.warn('Quota exceeded:', error.message);
            throw new Error('Monthly quota exceeded. Please upgrade your plan or try again next month.');
          } else if (error instanceof NutritionRateLimitError) {
            // Handle rate limiting with retry suggestion
            console.warn('Rate limited:', error.message);
            throw new Error('Too many requests. Please try again in a moment.');
          } else {
            // Handle other API errors
            console.error('AI API error:', error);
            throw new Error('Unable to process nutrition data. Please try again.');
          }
        }
      } else {
        // Fallback to a simple estimation (you could keep mockResolveLine as fallback)
        throw new Error('AI API is disabled. Please enable AI-powered nutrition analysis.');
      }

      // Update entry with resolved nutrition data
      console.log('📝 Updating entry to ok:', {
        id: entryId,
        rawText: rawText,
        inlineKcal: nutritionData.totals.kcal,
        itemsCount: nutritionData.resolved.length,
        totals: nutritionData.totals
      });

      set((state) => ({
        entries: state.entries.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                inlineKcal: nutritionData.totals.kcal,
                status: nutritionData.errors ? 'error' : 'ok',
                items: nutritionData.resolved,
                updatedAt: new Date(),
              }
            : entry
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('Error resolving entry:', error);

      // Update entry to error status
      set((state) => ({
        entries: state.entries.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                status: 'error',
                updatedAt: new Date(),
              }
            : entry
        ),
        isLoading: false,
      }));
    }
  },

  updateEntry: async (id: string, rawText: string) => {
    set({ isLoading: true });

    try {
      const entries = get().entries;
      const entryIndex = entries.findIndex(e => e.id === id);

      if (entryIndex === -1) {
        set({ isLoading: false });
        return;
      }

      let updatedEntry = { ...entries[entryIndex], rawText, updatedAt: new Date() };

      // Only process if line starts with "- " and has food text after the dash
      const textLine = rawText.trim().startsWith('-')
        ? rawText.trim().substring(1).trim()
        : '';

      if (textLine) {
        let nutritionData: NutritionResolveResponse;

        if (USE_AI_API) {
          try {
            // Get current user ID if available (from auth state)
            const { data: { user } } = await supabase.auth.getUser();
            nutritionData = await resolveNutrition(textLine, {
              userId: user?.id
            });
          } catch (error) {
            if (error instanceof NutritionQuotaExceededError) {
              console.warn('Quota exceeded:', error.message);
              throw new Error('Monthly quota exceeded. Please upgrade your plan or try again next month.');
            } else if (error instanceof NutritionRateLimitError) {
              console.warn('Rate limited:', error.message);
              throw new Error('Too many requests. Please try again in a moment.');
            } else {
              console.error('AI API error:', error);
              throw new Error('Unable to process nutrition data. Please try again.');
            }
          }
        } else {
          throw new Error('AI API is disabled. Please enable AI-powered nutrition analysis.');
        }

        updatedEntry.inlineKcal = nutritionData.totals.kcal;
        updatedEntry.status = nutritionData.errors ? 'error' : 'ok';
        updatedEntry.items = nutritionData.resolved;
      } else {
        updatedEntry.inlineKcal = null;
        updatedEntry.status = 'error';
        updatedEntry.items = [];
      }

      set((state) => ({
        entries: state.entries.map((e, index) =>
          index === entryIndex ? updatedEntry : e
        ),
        isLoading: false,
      }));
    } catch (error) {
      console.error('Error updating entry:', error);
      set({ isLoading: false });
    }
  },

  deleteEntry: (id: string) => {
    set((state) => ({
      entries: state.entries.filter(e => e.id !== id),
    }));
  },

  setCurrentDate: (date: string) => {
    set({ currentDate: date });
  },

  getEntriesForDate: (date: string) => {
    return get().entries.filter(entry => entry.date === date);
  },

  getDailyTotals: (date: string): DailyTotals => {
    const entries = get().getEntriesForDate(date);
    const totals = entries.reduce(
      (acc, entry) => {
        if (entry.status === 'ok' && entry.inlineKcal) {
          const protein = entry.items.reduce((sum, item) => sum + item.macros.protein, 0);
          const fat = entry.items.reduce((sum, item) => sum + item.macros.fat, 0);
          const carbs = entry.items.reduce((sum, item) => sum + item.macros.carbs, 0);

          return {
            kcal: acc.kcal + entry.inlineKcal,
            protein: acc.protein + protein,
            fat: acc.fat + fat,
            carbs: acc.carbs + carbs,
          };
        }
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    );

    return {
      date,
      ...totals,
    };
  },

  // Document management functions
  saveDocument: (date: string, content: string) => {
    const { documents } = get();
    const existingDocIndex = documents.findIndex(doc => doc.date === date);

    const updatedDocument: Document = {
      date,
      content,
      lastModified: new Date(),
    };

    if (existingDocIndex >= 0) {
      // Update existing document
      set((state) => ({
        documents: state.documents.map((doc, index) =>
          index === existingDocIndex ? updatedDocument : doc
        ),
      }));
    } else {
      // Add new document
      set((state) => ({
        documents: [...state.documents, updatedDocument],
      }));
    }
  },

  getDocument: (date: string) => {
    const { documents } = get();
    return documents.find(doc => doc.date === date);
  },

  getAllDocuments: () => {
    return get().documents;
  },

  deleteDocument: (date: string) => {
    set((state) => ({
      documents: state.documents.filter(doc => doc.date !== date),
    }));
  },

  // Goals management
  setGoals: (goals: UserGoals) => {
    set({ goals: { ...goals, updatedAt: new Date() } });
  },

  clearGoals: () => {
    set({ goals: null });
  },

  setPreferredUnits: (units: UnitSystem) => {
    set({ preferredUnits: units });
  },

  setManualTargets: (targets: ManualTargets | null) => {
    const currentGoals = get().goals;
    if (currentGoals) {
      set({
        goals: {
          ...currentGoals,
          manualTargets: targets,
          updatedAt: new Date(),
        },
      });
    }
  },
}),
    {
      name: 'note-cal-storage', // unique name for the storage
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the data we need (exclude functions and non-serializable data)
      partialize: (state) => ({
        entries: state.entries,
        documents: state.documents,
        currentDate: state.currentDate,
        goals: state.goals,
        preferredUnits: state.preferredUnits,
      }),
      // Handle version migrations if needed in the future
      version: 1,
    }
  )
);