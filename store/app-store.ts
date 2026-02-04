import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Entry, DailyTotals, NutritionResolveResponse, Document, UserGoals, UnitSystem, ManualTargets, SavedEntry, Macros } from '@/types';
import { resolveNutrition, correctNutrition, NutritionApiError, NutritionRateLimitError, NutritionQuotaExceededError } from '@/services/nutritionApi';
import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const USE_AI_API = true; // Use AI-powered nutrition API
const EM_DASH = "—"; // U+2014 - Apple Notes-style list marker

// Water entry parsing utilities
// Pattern 1: "water 500ml" or "sparkling water 1l" (water first)
const WATER_FIRST_REGEX = /^((?:sparkling|mineral|soda|fizzy|still)\s+)?(water|agua|h2o)\s*,?\s*(\d+(?:\.\d+)?)\s*(ml|l|oz)?$/i;

// Pattern 2: "500ml water" or "1l sparkling water" (quantity first)
const QTY_FIRST_REGEX = /^(\d+(?:\.\d+)?)\s*(ml|l|oz)?\s*(?:of\s+)?((?:sparkling|mineral|soda|fizzy|still)\s+)?(water|agua|h2o)$/i;

// Conversions to liters
const WATER_CONVERSIONS: Record<string, number> = {
  ml: 0.001,
  l: 1,
  oz: 0.02957,
};

function parseWaterEntry(text: string): { isWater: boolean; amountL: number } {
  // Try water-first pattern: "water 500ml", "sparkling water 1l"
  let match = text.match(WATER_FIRST_REGEX);
  if (match) {
    const amount = parseFloat(match[3]);
    const unit = (match[4] || 'l').toLowerCase();
    return { isWater: true, amountL: Math.round(amount * (WATER_CONVERSIONS[unit] || 1) * 100) / 100 };
  }

  // Try quantity-first pattern: "500ml water", "1l sparkling water"
  match = text.match(QTY_FIRST_REGEX);
  if (match) {
    const amount = parseFloat(match[1]);
    const unit = (match[2] || 'l').toLowerCase();
    return { isWater: true, amountL: Math.round(amount * (WATER_CONVERSIONS[unit] || 1) * 100) / 100 };
  }

  return { isWater: false, amountL: 0 };
}

// Helper to assign unique IDs to items received from the API
// This ensures items can be individually targeted for corrections
function assignItemIds(items: any[], entryId: string): any[] {
  return items.map((item, index) => ({
    ...item,
    id: item.id || `${entryId}-item-${index}-${Date.now()}`,
    entryId: entryId,
  }));
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      entries: [],
      documents: [],
      currentDate: new Date().toISOString().split('T')[0].replace(/-/g, ''), // YYYYMMDD
      isLoading: false,
      goals: null,
      preferredUnits: 'metric' as UnitSystem,
      savedEntries: [],

  addEntry: async (rawText: string) => {
    // Only process lines that start with "- " or "— " (em-dash)
    const trimmed = rawText.trim();
    if (!trimmed.startsWith('-') && !trimmed.startsWith(EM_DASH)) {
      return;
    }

    const textLine = trimmed.substring(1).trim(); // Remove "-" or "—" prefix

    // Don't create an entry if there's no food text after the dash
    if (!textLine) {
      return;
    }

    // Check if this is a water entry - handle locally without API call
    const waterResult = parseWaterEntry(textLine);
    if (waterResult.isWater) {
      const entryId = Date.now().toString();
      const waterEntry: Entry = {
        id: entryId,
        date: get().currentDate,
        rawText,
        inlineKcal: 0, // Water has no calories
        status: 'ok',
        items: [{
          id: `${entryId}-water`,
          entryId,
          label: 'Water',
          qty: waterResult.amountL,
          unit: 'L',
          source: 'local',
          sourceId: 'water',
          macros: { kcal: 0, protein: 0, fat: 0, carbs: 0, water: waterResult.amountL },
          confidence: 1.0,
          citations: [],
        }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      set((state) => ({
        entries: [...state.entries, waterEntry],
      }));
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
                status: nutritionData.error ? 'error' : 'ok',
                items: assignItemIds(nutritionData.resolved, entryId),
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

      // Only process if line starts with "- " or "— " and has food text after the marker
      const trimmed = rawText.trim();
      const textLine = (trimmed.startsWith('-') || trimmed.startsWith(EM_DASH))
        ? trimmed.substring(1).trim()
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
        updatedEntry.status = nutritionData.error ? 'error' : 'ok';
        updatedEntry.items = assignItemIds(nutritionData.resolved, id);
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
        if (entry.status === 'ok') {
          const kcal = entry.inlineKcal ?? 0;
          const protein = entry.items.reduce((sum, item) => sum + item.macros.protein, 0);
          const fat = entry.items.reduce((sum, item) => sum + item.macros.fat, 0);
          const carbs = entry.items.reduce((sum, item) => sum + item.macros.carbs, 0);
          const fiber = entry.items.reduce((sum, item) => sum + (item.macros.fiber ?? 0), 0);
          const sugar = entry.items.reduce((sum, item) => sum + (item.macros.sugar ?? 0), 0);
          const sodium = entry.items.reduce((sum, item) => sum + (item.macros.sodium ?? 0), 0);
          const potassium = entry.items.reduce((sum, item) => sum + (item.macros.potassium ?? 0), 0);
          const water = entry.items.reduce((sum, item) => sum + (item.macros.water ?? 0), 0);

          return {
            kcal: acc.kcal + kcal,
            protein: acc.protein + protein,
            fat: acc.fat + fat,
            carbs: acc.carbs + carbs,
            fiber: acc.fiber + fiber,
            sugar: acc.sugar + sugar,
            sodium: acc.sodium + sodium,
            potassium: acc.potassium + potassium,
            water: acc.water + water,
          };
        }
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, sodium: 0, potassium: 0, water: 0 }
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

  // Saved entries management
  saveEntry: (entry: Entry) => {
    console.log('📌 saveEntry called with:', {
      status: entry.status,
      itemsCount: entry.items?.length,
      rawText: entry.rawText
    });

    // Only save entries that are resolved with items
    if (entry.status !== 'ok' || !entry.items.length) {
      console.log('📌 saveEntry skipped - not ok or no items');
      return;
    }

    const { savedEntries } = get();
    console.log('📌 Current savedEntries count:', savedEntries.length);

    // Normalize rawText for duplicate check (lowercase, trim)
    const normalizedText = entry.rawText.toLowerCase().trim();

    // Check if this entry already exists
    const existingIndex = savedEntries.findIndex(
      (se) => se.rawText.toLowerCase().trim() === normalizedText
    );

    if (existingIndex !== -1) {
      // Update existing: increment usage count and update lastUsedAt
      console.log('📌 Updating existing saved entry at index:', existingIndex);
      set((state) => ({
        savedEntries: state.savedEntries.map((se, idx) =>
          idx === existingIndex
            ? {
                ...se,
                lastUsedAt: new Date(),
                usageCount: se.usageCount + 1,
              }
            : se
        ),
      }));
    } else {
      // Create new saved entry
      const newSavedEntry: SavedEntry = {
        id: Date.now().toString(),
        rawText: entry.rawText,
        items: entry.items.map((item) => ({
          ...item,
          entryId: '', // Clear the entryId since this is a template
        })),
        totalKcal: entry.inlineKcal ?? 0,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: 1,
      };

      console.log('📌 Creating new saved entry:', newSavedEntry.rawText);
      set((state) => ({
        savedEntries: [...state.savedEntries, newSavedEntry],
      }));
      console.log('📌 New savedEntries count:', get().savedEntries.length);
    }
  },

  deleteSavedEntry: (id: string) => {
    set((state) => ({
      savedEntries: state.savedEntries.filter((se) => se.id !== id),
    }));
  },

  useSavedEntry: (savedEntry: SavedEntry): Entry => {
    const entryId = Date.now().toString();
    const currentDate = get().currentDate;

    // Create new entry with pre-populated nutrition data
    const newEntry: Entry = {
      id: entryId,
      date: currentDate,
      rawText: savedEntry.rawText,
      inlineKcal: savedEntry.totalKcal,
      status: 'ok',
      items: savedEntry.items.map((item) => ({
        ...item,
        id: `${entryId}-${item.id}`,
        entryId: entryId,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Update savedEntry's lastUsedAt and usageCount
    set((state) => ({
      entries: [...state.entries, newEntry],
      savedEntries: state.savedEntries.map((se) =>
        se.id === savedEntry.id
          ? {
              ...se,
              lastUsedAt: new Date(),
              usageCount: se.usageCount + 1,
            }
          : se
      ),
    }));

    return newEntry;
  },

  createSavedEntry: async (rawText: string): Promise<{ success: boolean; error?: string }> => {
    // Remove "- " or "— " prefix if present and trim
    const foodText = rawText.replace(/^[-—]\s*/, '').trim();
    if (!foodText) {
      return { success: false, error: 'Empty input' };
    }

    // Check for duplicates (normalize to "- foodText" format for comparison)
    const normalizedText = `- ${foodText}`.toLowerCase().trim();
    const existing = get().savedEntries.find(
      (se) => se.rawText.toLowerCase().trim() === normalizedText
    );
    if (existing) {
      return { success: false, error: 'Already saved' };
    }

    try {
      // Get current user ID if available
      const { data: { user } } = await supabase.auth.getUser();

      // Call nutrition API to resolve the food
      const response = await resolveNutrition(foodText, {
        userId: user?.id
      });

      if (!response.resolved?.length) {
        return { success: false, error: 'Could not resolve nutrition' };
      }

      // Create SavedEntry from the response
      const savedEntryId = Date.now().toString();
      const newSavedEntry: SavedEntry = {
        id: savedEntryId,
        rawText: `- ${foodText}`,
        items: response.resolved.map((item, index) => ({
          ...item,
          id: item.id || `saved-${savedEntryId}-item-${index}`,
          entryId: '', // Clear entryId since this is a template
        })),
        totalKcal: response.totals?.kcal ?? 0,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        usageCount: 0,
      };

      set((state) => ({
        savedEntries: [...state.savedEntries, newSavedEntry],
      }));

      return { success: true };
    } catch (error) {
      console.error('Error creating saved entry:', error);
      if (error instanceof NutritionQuotaExceededError) {
        return { success: false, error: 'Quota exceeded' };
      } else if (error instanceof NutritionRateLimitError) {
        return { success: false, error: 'Too many requests' };
      }
      return { success: false, error: 'Failed to resolve nutrition' };
    }
  },

  updateEntryItemMacro: (entryId: string, itemId: string, macroKey: keyof Macros, value: number) => {
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== entryId) return entry;

        // Update the specific item's macro
        const updatedItems = entry.items.map((item) => {
          if (item.id !== itemId) return item;

          // Save original macros on first edit if not already saved
          const originalMacros = item.originalMacros ?? { ...item.macros };

          return {
            ...item,
            originalMacros,
            macros: {
              ...item.macros,
              [macroKey]: value,
            },
          };
        });

        // Recalculate inlineKcal if calories were updated
        const newInlineKcal = macroKey === 'kcal'
          ? updatedItems.reduce((sum, item) => sum + item.macros.kcal, 0)
          : entry.inlineKcal;

        return {
          ...entry,
          items: updatedItems,
          inlineKcal: newInlineKcal,
          updatedAt: new Date(),
        };
      }),
    }));
  },

  revertEntryItemSingleMacro: (entryId: string, itemId: string, macroKey: keyof Macros) => {
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== entryId) return entry;

        const updatedItems = entry.items.map((item) => {
          if (item.id !== itemId) return item;

          // Revert single macro to original if available
          if (!item.originalMacros || item.originalMacros[macroKey] === undefined) return item;

          const newMacros = {
            ...item.macros,
            [macroKey]: item.originalMacros[macroKey],
          };

          // Check if all macros are now back to original - if so, clear originalMacros
          const allReverted =
            newMacros.kcal === item.originalMacros.kcal &&
            newMacros.protein === item.originalMacros.protein &&
            newMacros.fat === item.originalMacros.fat &&
            newMacros.carbs === item.originalMacros.carbs &&
            newMacros.fiber === item.originalMacros.fiber &&
            newMacros.sugar === item.originalMacros.sugar &&
            newMacros.sodium === item.originalMacros.sodium &&
            newMacros.potassium === item.originalMacros.potassium &&
            newMacros.water === item.originalMacros.water;

          return {
            ...item,
            macros: newMacros,
            originalMacros: allReverted ? undefined : item.originalMacros,
          };
        });

        // Recalculate inlineKcal if calories were reverted
        const newInlineKcal = macroKey === 'kcal'
          ? updatedItems.reduce((sum, item) => sum + item.macros.kcal, 0)
          : entry.inlineKcal;

        return {
          ...entry,
          items: updatedItems,
          inlineKcal: newInlineKcal,
          updatedAt: new Date(),
        };
      }),
    }));
  },

  revertEntryItemMacros: (entryId: string, itemId: string) => {
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== entryId) return entry;

        const updatedItems = entry.items.map((item) => {
          if (item.id !== itemId) return item;

          // Revert to original macros if available
          if (!item.originalMacros) return item;

          return {
            ...item,
            macros: { ...item.originalMacros },
            originalMacros: undefined, // Clear since we've reverted
          };
        });

        // Recalculate inlineKcal
        const newInlineKcal = updatedItems.reduce((sum, item) => sum + item.macros.kcal, 0);

        return {
          ...entry,
          items: updatedItems,
          inlineKcal: newInlineKcal,
          updatedAt: new Date(),
        };
      }),
    }));
  },

  correctEntryItem: async (entryId: string, itemId: string, feedback: string) => {
    const entry = get().entries.find((e) => e.id === entryId);
    const item = entry?.items.find((i) => i.id === itemId);

    if (!entry || !item) {
      console.error('[correctEntryItem] Entry or item not found');
      return;
    }

    try {
      // Get current user ID if available
      const { data: { user } } = await supabase.auth.getUser();

      console.log('[correctEntryItem] Calling correction API for:', item.label, '| Feedback:', feedback);

      // Call the correction API
      const result = await correctNutrition(item, feedback, {
        userId: user?.id
      });

      console.log('[correctEntryItem] Correction result:', result);

      // Update the item with corrected values
      set((state) => ({
        entries: state.entries.map((e) => {
          if (e.id !== entryId) return e;

          const updatedItems = e.items.map((i) => {
            if (i.id !== itemId) return i;

            return {
              ...i,
              // Update label if corrected
              label: result.correctedLabel || i.label,
              // Update macros with corrected values
              macros: result.correctedMacros,
              // Clear originalMacros - AI-corrected values become the new "truth"
              // (revert button only shows for manual edits, not AI corrections)
              originalMacros: undefined,
              // Update confidence if provided
              confidence: result.confidence ?? i.confidence,
              // Update reasoning with new reasoning or fallback to explanation
              reasoning: result.reasoning || {
                ...i.reasoning,
                interpretation: result.explanation,
              },
            };
          });

          // Recalculate inlineKcal
          const newInlineKcal = updatedItems.reduce((sum, item) => sum + item.macros.kcal, 0);

          return {
            ...e,
            items: updatedItems,
            inlineKcal: newInlineKcal,
            updatedAt: new Date(),
          };
        }),
      }));
    } catch (error) {
      console.error('[correctEntryItem] Error:', error);
      throw error; // Re-throw so the UI can handle it
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
        savedEntries: state.savedEntries,
      }),
      // Handle version migrations
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // Add savedEntries if it doesn't exist
          return {
            ...persistedState,
            savedEntries: persistedState.savedEntries || [],
          };
        }
        return persistedState;
      },
      // Ensure proper merge with initial state
      merge: (persistedState: any, currentState: any) => ({
        ...currentState,
        ...persistedState,
        // Ensure savedEntries is always an array
        savedEntries: persistedState?.savedEntries ?? currentState.savedEntries ?? [],
      }),
    }
  )
);