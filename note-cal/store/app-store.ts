import { create } from 'zustand';
import { AppState, Entry, DailyTotals, NutritionResolveResponse } from '@/types';
import { mockResolveLine } from '@/services/mockApi';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const USE_MOCK_API = true; // Set to false when real API is ready

export const useAppStore = create<AppState>((set, get) => ({
  entries: [],
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

      // Call API to resolve nutrition
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
            locale: 'en-US', // Default to US, can be made configurable
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to resolve nutrition');
        }

        nutritionData = await response.json();
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
}));