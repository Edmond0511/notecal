import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Entry, DailyTotals, NutritionResolveResponse, Document } from '@/types';
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

  addEntry: async (rawText: string) => {
    set({ isLoading: true });

    try {
      // Only process lines that start with "- "
      if (!rawText.trim().startsWith('-')) {
        set({ isLoading: false });
        return;
      }

      const textLine = rawText.trim().substring(1).trim(); // Remove "- " prefix

      // Call AI API to resolve nutrition
      let nutritionData: NutritionResolveResponse;

      if (USE_AI_API) {
        try {
          nutritionData = await resolveNutrition(textLine, {
            // Get current user ID if available (from auth state)
            userId: supabase.auth.getUser().then(({ data }) => data.user?.id).catch(() => undefined)
          });
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

      // Create new entry
      const newEntry: Entry = {
        id: Date.now().toString(),
        date: get().currentDate,
        rawText,
        inlineKcal: nutritionData.totals.kcal,
        status: nutritionData.errors ? 'error' : 'ok',
        items: nutritionData.resolved,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      set((state) => ({
        entries: [...state.entries, newEntry],
        isLoading: false,
      }));
    } catch (error) {
      console.error('Error adding entry:', error);

      // Create entry with error status
      const errorEntry: Entry = {
        id: Date.now().toString(),
        date: get().currentDate,
        rawText,
        inlineKcal: null,
        status: 'error',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      set((state) => ({
        entries: [...state.entries, errorEntry],
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

      // Only process if line starts with "- "
      if (rawText.trim().startsWith('-')) {
        const textLine = rawText.trim().substring(1).trim();

        let nutritionData: NutritionResolveResponse;

        if (USE_MOCK_API) {
          nutritionData = await mockResolveLine(textLine, 'en-US');
        } else {
          const response = await fetch(`${API_BASE_URL}/resolve_line`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              textLine,
              locale: 'en-US',
            }),
          });

          if (response.ok) {
            nutritionData = await response.json();
          } else {
            throw new Error('Failed to resolve nutrition');
          }
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

          return {
            kcal: acc.kcal + entry.inlineKcal,
            protein: acc.protein + protein,
            fat: acc.fat + fat,
          };
        }
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0 }
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
}),
    {
      name: 'note-cal-storage', // unique name for the storage
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the data we need (exclude functions and non-serializable data)
      partialize: (state) => ({
        entries: state.entries,
        documents: state.documents,
        currentDate: state.currentDate,
      }),
      // Handle version migrations if needed in the future
      version: 1,
    }
  )
);