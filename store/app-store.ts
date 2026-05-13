import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  mmkvStateStorage,
  hasFreeCallsRemaining,
  incrementFreeCallsUsed,
} from '@/lib/mmkv';
import { AppState, Entry, DailyTotals, NutritionResolveResponse, Document, UserGoals, UnitSystem, EntryMode, ManualTargets, SavedEntry, Macros, WeightEntry, BarcodeProduct, DatabaseSearchResult, PendingInsertion, MealReminder, FatSecretServing, CustomMeal, CustomMealItem, UserProfile } from '@/types';
import { resolveNutrition, correctNutrition, NutritionApiError, NutritionRateLimitError, NutritionQuotaExceededError, NutritionEntitlementRequiredError } from '@/services/nutritionApi';
import { barcodeProductToFoodItem } from '@/services/barcodeService';
import { nutritionQueue } from '@/services/nutritionQueue';
import { photoSyncService } from '@/services/photoSyncService';
import { supabase } from '@/lib/supabase';
import NetInfo from '@react-native-community/netinfo';

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
    source: item.source === 'brand' ? 'brand' : item.source === 'USDA' ? 'FDC' : item.source || 'ai',
    sourceId: item.sourceId || '',
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
      entryMode: 'freeform' as EntryMode,
      enterOnlyMode: false,
      profile: null,
      savedEntries: [],
      customMeals: [],
      weightEntries: [],
      pendingInsertion: null,
      isPro: false,
      pendingPaywallAfterAuth: false,
      notificationsEnabled: false,
      mealReminders: [
        { id: 'breakfast', name: 'Breakfast', time: '08:00', enabled: true, isDefault: true },
        { id: 'lunch', name: 'Lunch', time: '12:00', enabled: true, isDefault: true },
        { id: 'dinner', name: 'Dinner', time: '18:00', enabled: true, isDefault: true },
      ],

  addEntry: (rawText: string, date?: string) => {
    const trimmed = rawText.trim();
    const isFreeform = get().entryMode === 'freeform';
    const entryDate = date ?? get().currentDate;

    let textLine: string;
    if (isFreeform) {
      // In freeform mode, every non-empty line is a food entry
      textLine = trimmed;
    } else {
      // In dash mode, only process lines that start with "- " or "— " (em-dash)
      if (!trimmed.startsWith('-') && !trimmed.startsWith(EM_DASH)) {
        return;
      }
      textLine = trimmed.substring(1).trim(); // Remove "-" or "—" prefix
    }

    // Don't create an entry if there's no food text
    if (!textLine) {
      return;
    }

    // Check if this is a water entry - handle locally without API call when water tracking is enabled
    const waterTrackingEnabled = get().goals?.manualTargets?.water !== undefined;
    const waterResult = parseWaterEntry(textLine);
    if (waterTrackingEnabled && waterResult.isWater) {
      const entryId = Date.now().toString();
      const waterEntry: Entry = {
        id: entryId,
        date: entryDate,
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

    // Skip if this rawText is already queued or in-flight (dedup)
    if (nutritionQueue.has(rawText)) {
      return;
    }

    const entryId = Date.now().toString();

    // Create entry with pending status immediately (for UI loading indicator)
    const pendingEntry: Entry = {
      id: entryId,
      date: entryDate,
      rawText,
      inlineKcal: null,
      status: 'pending',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add pending entry to state immediately — persists even if offline
    set((state: AppState) => ({
      entries: [...state.entries, pendingEntry],
    }));

    // Check network, then enqueue if online (offline entries drain on reconnect)
    NetInfo.fetch().then((netState) => {
      if (!netState.isConnected) {
        console.log('[addEntry] Offline — entry saved as pending, will resolve on reconnect');
        return;
      }

      supabase.auth.getUser().then(({ data: { user } }) => {
        // Guard: entry may have been deleted while awaiting network/auth
        if (!get().entries.some((e: Entry) => e.id === entryId)) return;

        // Free-tier gate: non-Pro users get a hard cap on lifetime AI calls.
        // We mark the entry as entitlement_required and skip the queue
        // entirely so the inline paywall fires without a server roundtrip.
        // Server-side check still runs as defense-in-depth.
        if (!get().isPro && !hasFreeCallsRemaining(user?.id)) {
          set((state: AppState) => ({
            entries: state.entries.map((entry: Entry) =>
              entry.id === entryId
                ? {
                    ...entry,
                    status: 'error' as const,
                    errorReason: 'entitlement_required' as const,
                    updatedAt: new Date(),
                  }
                : entry
            ),
          }));
          return;
        }

        // Increment the free-call counter for non-Pro users on every accepted
        // enqueue. Pro users skip the counter. Counter persists across the
        // user's installs because RC handles entitlement state separately —
        // no MMKV reset on sign-out.
        if (!get().isPro) {
          incrementFreeCallsUsed(user?.id);
        }

        // Enqueue the API call — queue handles concurrency (max 3)
        nutritionQueue.enqueue({
          entryId,
          rawText,
          textLine,
          userId: user?.id,
          onResolved: (nutritionData) => {
            set((state: AppState) => ({
              entries: state.entries.map((entry: Entry) =>
                entry.id === entryId
                  ? {
                      ...entry,
                      inlineKcal: nutritionData.totals.kcal,
                      status: (nutritionData as any).error ? 'error' as const : 'ok' as const,
                      errorReason: undefined,
                      items: assignItemIds(nutritionData.resolved, entryId),
                      updatedAt: new Date(),
                    }
                  : entry
              ),
            }));
          },
          onError: (error) => {
            console.error('Error resolving entry:', error);
            const errorReason: 'rate_limit' | 'entitlement_required' | 'unknown' =
              error instanceof NutritionRateLimitError ? 'rate_limit'
              : error instanceof NutritionEntitlementRequiredError ? 'entitlement_required'
              : 'unknown';
            set((state: AppState) => ({
              entries: state.entries.map((entry: Entry) =>
                entry.id === entryId
                  ? {
                      ...entry,
                      status: 'error' as const,
                      errorReason,
                      updatedAt: new Date(),
                    }
                  : entry
              ),
            }));
          },
          isEntryDeleted: () => {
            return !get().entries.some((e: Entry) => e.id === entryId);
          },
        });
      });
    });
  },

  updateEntry: async (id: string, rawText: string) => {
    const entries = get().entries;
    const entryIndex = entries.findIndex(e => e.id === id);
    if (entryIndex === -1) return;

    // Cancel any existing queued item for this entry
    nutritionQueue.cancel(id);

    const trimmed = rawText.trim();
    const isFreeform = get().entryMode === 'freeform';
    let textLine: string;
    if (isFreeform) {
      textLine = trimmed;
    } else {
      textLine = (trimmed.startsWith('-') || trimmed.startsWith(EM_DASH))
        ? trimmed.substring(1).trim()
        : '';
    }

    if (!textLine) {
      // No food text — mark as error
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id
            ? { ...e, rawText, inlineKcal: null, status: 'error' as const, items: [], updatedAt: new Date() }
            : e
        ),
      }));
      return;
    }

    // Update rawText and set pending immediately
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id
          ? { ...e, rawText, status: 'pending' as const, errorReason: undefined, updatedAt: new Date() }
          : e
      ),
    }));

    // Check network — if offline, entry stays pending (reconnect service handles later)
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('[updateEntry] Offline — entry updated as pending, will resolve on reconnect');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    // Guard: entry may have been deleted while awaiting network/auth
    if (!get().entries.some((e: Entry) => e.id === id)) return;

    nutritionQueue.enqueue({
      entryId: id,
      rawText,
      textLine,
      userId: user?.id,
      onResolved: (nutritionData) => {
        set((state: AppState) => ({
          entries: state.entries.map((entry: Entry) =>
            entry.id === id
              ? {
                  ...entry,
                  inlineKcal: nutritionData.totals.kcal,
                  status: (nutritionData as any).error ? 'error' as const : 'ok' as const,
                  errorReason: undefined,
                  items: assignItemIds(nutritionData.resolved, id),
                  updatedAt: new Date(),
                }
              : entry
          ),
        }));
      },
      onError: (error) => {
        console.error('Error resolving updated entry:', error);
        const errorReason: 'rate_limit' | 'entitlement_required' | 'unknown' =
          error instanceof NutritionRateLimitError ? 'rate_limit'
          : error instanceof NutritionEntitlementRequiredError ? 'entitlement_required'
          : 'unknown';
        set((state: AppState) => ({
          entries: state.entries.map((entry: Entry) =>
            entry.id === id
              ? { ...entry, status: 'error' as const, errorReason, updatedAt: new Date() }
              : entry
          ),
        }));
      },
      isEntryDeleted: () => {
        return !get().entries.some((e: Entry) => e.id === id);
      },
    });
  },

  deleteEntry: (id: string) => {
    nutritionQueue.cancel(id);
    set((state) => ({
      entries: state.entries.filter(e => e.id !== id),
    }));
  },

  deleteEntries: (ids: string[]) => {
    for (const id of ids) { nutritionQueue.cancel(id); }
    const idSet = new Set(ids);
    set((state) => ({
      entries: state.entries.filter(e => !idSet.has(e.id)),
    }));
  },

  setCurrentDate: (date: string) => {
    set({ currentDate: date });
  },

  navigateToDate: (newDate: string, oldDate: string, docContent: string) => {
    const { documents } = get();
    const trimmed = docContent.trim();
    const existingDocIndex = documents.findIndex(doc => doc.date === oldDate);
    const updatedDocument: Document = {
      date: oldDate,
      content: trimmed,
      lastModified: new Date(),
    };

    let newDocuments: Document[];
    if (existingDocIndex >= 0) {
      newDocuments = documents.map((doc, index) =>
        index === existingDocIndex ? updatedDocument : doc
      );
    } else {
      newDocuments = [...documents, updatedDocument];
    }

    // Single set() call: one MMKV write, one subscriber notification
    set({ currentDate: newDate, documents: newDocuments });
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

  clearUserData: () => {
    set({
      entries: [],
      documents: [],
      goals: null,
      savedEntries: [],
      customMeals: [],
      weightEntries: [],
      profile: null,
    });
  },

  setPreferredUnits: (units: UnitSystem) => {
    set({ preferredUnits: units });
  },

  setEntryMode: (mode: EntryMode) => {
    set({ entryMode: mode });
  },

  setEnterOnlyMode: (enabled: boolean) => {
    set({ enterOnlyMode: enabled });
  },

  setProfile: (profile: UserProfile | null) => {
    set({ profile });
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
    const isFreeform = get().entryMode === 'freeform';

    // In freeform mode, strip dash prefix from saved entry rawText
    const rawText = isFreeform
      ? savedEntry.rawText.replace(/^[-—]\s*/, '')
      : savedEntry.rawText;

    // Create new entry with pre-populated nutrition data
    const newEntry: Entry = {
      id: entryId,
      date: currentDate,
      rawText,
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

  addBarcodeEntry: (product: BarcodeProduct, selectedServingId?: string): Entry => {
    const entryId = Date.now().toString();
    const currentDate = get().currentDate;
    const isFreeform = get().entryMode === 'freeform';

    const item = barcodeProductToFoodItem(product, entryId, selectedServingId);
    const rawText = isFreeform
      ? product.name
      : `— ${product.name}`;

    const newEntry: Entry = {
      id: entryId,
      date: currentDate,
      rawText,
      inlineKcal: item.macros.kcal,
      status: 'ok',
      items: [item],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      entries: [...state.entries, newEntry],
    }));

    return newEntry;
  },

  addDatabaseSearchEntry: (result: DatabaseSearchResult, servingGrams: number, idSuffix?: number, macroOverrides?: Partial<import('@/types').Macros>): Entry => {
    const entryId = `${Date.now()}${idSuffix != null ? `-${idSuffix}` : ''}`;
    const currentDate = get().currentDate;
    const isFreeform = get().entryMode === 'freeform';

    const rawText = isFreeform
      ? result.name
      : `— ${result.name}`;

    let item: import('@/types').FoodItem;

    if (result.source === 'FS' && result.fsServings?.length) {
      // FatSecret path: use native servings
      const defaultServing = result.fsServings.find(s => s.metricUnit === 'g') ?? result.fsServings[0];
      item = {
        id: `${entryId}-dbsearch-0`,
        entryId,
        label: result.name,
        brand: result.brand,
        qty: defaultServing.metricAmount ?? 0,
        unit: defaultServing.metricUnit ?? 'serving',
        source: 'FS',
        sourceId: result.foodId ?? '',
        macros: { ...defaultServing.macros },
        originalMacros: { ...defaultServing.macros },
        confidence: 0.95,
        citations: [
          { provider: 'FatSecret', url: `https://www.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(result.name)}` },
        ],
        reasoning: {
          interpretation: `• Nutrition data from FatSecret database\n• Serving: ${defaultServing.description}`,
          assumptions: [],
          dataSource: '[Powered by FatSecret Platform API](https://platform.fatsecret.com)',
        },
        fsServings: result.fsServings,
        fsSelectedServingId: defaultServing.servingId,
      };
    } else {
      // Legacy FDC/OFF path (for recently-logged items from old data)
      const macros = result.macrosPer100g
        ? {
            kcal: Math.round(result.macrosPer100g.kcal * servingGrams / 100),
            protein: Math.round(result.macrosPer100g.protein * servingGrams / 100 * 10) / 10,
            fat: Math.round(result.macrosPer100g.fat * servingGrams / 100 * 10) / 10,
            carbs: Math.round(result.macrosPer100g.carbs * servingGrams / 100 * 10) / 10,
            ...(result.macrosPer100g.fiber != null && { fiber: Math.round(result.macrosPer100g.fiber * servingGrams / 100 * 10) / 10 }),
            ...(result.macrosPer100g.sugar != null && { sugar: Math.round(result.macrosPer100g.sugar * servingGrams / 100 * 10) / 10 }),
            ...(result.macrosPer100g.sodium != null && { sodium: Math.round(result.macrosPer100g.sodium * servingGrams / 100) }),
            ...(result.macrosPer100g.potassium != null && { potassium: Math.round(result.macrosPer100g.potassium * servingGrams / 100) }),
          }
        : { kcal: 0, protein: 0, fat: 0, carbs: 0 };

      const sourceId = result.source === 'FDC'
        ? String(result.fdcId ?? '')
        : result.offId ?? '';

      const citations = result.source === 'FDC'
        ? [{ provider: 'USDA FoodData Central', url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${result.fdcId}/nutrients` }]
        : [{ provider: 'Open Food Facts', url: `https://world.openfoodfacts.org/product/${result.offId}` }];

      item = {
        id: `${entryId}-dbsearch-0`,
        entryId,
        label: result.name,
        brand: result.brand,
        qty: servingGrams,
        unit: 'g',
        source: result.source,
        sourceId,
        macros,
        confidence: 0.95,
        citations,
        reasoning: {
          interpretation: `Database search: ${result.name}`,
          assumptions: [
            `Nutrition data from ${result.source === 'FDC' ? 'USDA FoodData Central' : 'Open Food Facts'} database`,
            `Serving size: ${servingGrams}g`,
            `Values scaled from per-100g data`,
          ],
          dataSource: result.source === 'FDC' ? 'USDA FoodData Central (FDC)' : 'Open Food Facts (OFF)',
        },
        ...(result.portions?.length ? { commonPortions: result.portions } : {}),
        ...(result.extendedNutrientsPer100g ? { extendedNutrientsPer100g: result.extendedNutrientsPer100g } : {}),
      };
    }

    // Apply manual macro overrides if provided
    if (macroOverrides) {
      if (!item.originalMacros) {
        item.originalMacros = { ...item.macros };
      }
      item.macros = { ...item.macros, ...macroOverrides };
    }

    const newEntry: Entry = {
      id: entryId,
      date: currentDate,
      rawText,
      inlineKcal: item.macros.kcal,
      status: 'ok',
      items: [item],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      entries: [...state.entries, newEntry],
    }));

    return newEntry;
  },

  addPhotoEntry: (items: import('@/types').FoodItem[], totals: import('@/types').Macros): Entry => {
    const entryId = Date.now().toString();
    const currentDate = get().currentDate;
    const isFreeform = get().entryMode === 'freeform';

    const labelText = items.map((i) => i.label).join(', ');
    const rawText = isFreeform ? labelText : `— ${labelText}`;
    const entryItems = items.map((item, index) => ({
      ...item,
      id: `${entryId}-photo-${index}`,
      entryId,
    }));

    const newEntry: Entry = {
      id: entryId,
      date: currentDate,
      rawText,
      inlineKcal: totals.kcal,
      status: 'ok' as const,
      items: entryItems,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      entries: [...state.entries, newEntry],
    }));

    return newEntry;
  },

  createSavedEntry: async (rawText: string): Promise<{ success: boolean; error?: string }> => {
    // Saved entries need immediate resolution — bail if offline
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return { success: false, error: 'No connection — saved entries require network to resolve' };
    }

    // Remove "- " or "— " prefix if present and trim
    const foodText = rawText.replace(/^[-—]\s*/, '').trim();
    if (!foodText) {
      return { success: false, error: 'Empty input' };
    }

    const isFreeform = get().entryMode === 'freeform';

    // Check for duplicates - normalize for comparison
    const normalizedForStorage = isFreeform ? foodText : `- ${foodText}`;
    const normalizedCheck = normalizedForStorage.toLowerCase().trim();
    const existing = get().savedEntries.find(
      (se) => se.rawText.replace(/^[-—]\s*/, '').trim().toLowerCase() === foodText.toLowerCase()
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
        rawText: isFreeform ? foodText : `- ${foodText}`,
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
      if (error instanceof NutritionEntitlementRequiredError) {
        return { success: false, error: 'Upgrade to Pro to save entries.' };
      } else if (error instanceof NutritionQuotaExceededError) {
        return { success: false, error: 'Quota exceeded' };
      } else if (error instanceof NutritionRateLimitError) {
        return { success: false, error: 'Too many requests' };
      }
      return { success: false, error: 'Failed to resolve nutrition' };
    }
  },

  // Custom meals management
  addCustomMeal: (name: string, items: CustomMealItem[]) => {
    const totalMacros = items.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.macros.kcal,
        protein: acc.protein + item.macros.protein,
        fat: acc.fat + item.macros.fat,
        carbs: acc.carbs + item.macros.carbs,
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0 } as Macros,
    );

    const newMeal: CustomMeal = {
      id: Date.now().toString(),
      name,
      items,
      totalMacros,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: new Date(),
      usageCount: 0,
    };

    set((state) => ({
      customMeals: [...state.customMeals, newMeal],
    }));
  },

  updateCustomMeal: (id: string, name: string, items: CustomMealItem[]) => {
    const totalMacros = items.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.macros.kcal,
        protein: acc.protein + item.macros.protein,
        fat: acc.fat + item.macros.fat,
        carbs: acc.carbs + item.macros.carbs,
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0 } as Macros,
    );

    set((state) => ({
      customMeals: state.customMeals.map((meal) =>
        meal.id === id
          ? { ...meal, name, items, totalMacros, updatedAt: new Date() }
          : meal,
      ),
    }));
  },

  deleteCustomMeal: (id: string) => {
    set((state) => ({
      customMeals: state.customMeals.filter((meal) => meal.id !== id),
    }));
  },

  useCustomMeal: (meal: CustomMeal): Entry => {
    const entryId = Date.now().toString();
    const currentDate = get().currentDate;
    const isFreeform = get().entryMode === 'freeform';
    const rawText = isFreeform ? meal.name : `${EM_DASH} ${meal.name}`;

    const newEntry: Entry = {
      id: entryId,
      date: currentDate,
      rawText,
      inlineKcal: meal.totalMacros.kcal,
      status: 'ok',
      items: meal.items.map((item, idx) => {
        const isFatSecret = item.source === 'FS';
        const selectedServing = isFatSecret && item.fsServings?.length
          ? (item.fsServings.find(s => s.servingId === item.fsSelectedServingId) ?? item.fsServings[0])
          : undefined;

        const citations = isFatSecret
          ? [{ provider: 'FatSecret', url: `https://www.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(item.label)}` }]
          : item.source === 'FDC'
            ? [{ provider: 'USDA FoodData Central', url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${item.sourceId}/nutrients` }]
            : [{ provider: 'Open Food Facts', url: `https://world.openfoodfacts.org/product/${item.sourceId}` }];

        const dataSource = isFatSecret
          ? '[Powered by FatSecret Platform API](https://platform.fatsecret.com)'
          : item.source === 'FDC'
            ? 'USDA FoodData Central (FDC)'
            : 'Open Food Facts (OFF)';

        const servingDesc = isFatSecret && selectedServing
          ? `\n• Serving: ${selectedServing.description}`
          : `\n• Serving size: ${Math.round(item.servingGrams)}g`;

        const dbName = isFatSecret
          ? 'FatSecret database'
          : item.source === 'FDC'
            ? 'USDA FoodData Central'
            : 'Open Food Facts';

        return {
          id: `${entryId}-meal-${idx}`,
          entryId,
          label: item.label,
          brand: item.brand,
          qty: item.servingGrams,
          unit: 'g',
          source: item.source,
          sourceId: item.sourceId,
          macros: { ...item.macros },
          confidence: 0.95,
          citations,
          reasoning: {
            interpretation: `${item.label}\n• Nutrition data from ${dbName}${servingDesc}`,
            assumptions: [],
            dataSource,
          },
          fsServings: item.fsServings,
          fsSelectedServingId: item.fsSelectedServingId,
        };
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      entries: [...state.entries, newEntry],
      customMeals: state.customMeals.map((m) =>
        m.id === meal.id
          ? { ...m, lastUsedAt: new Date(), usageCount: m.usageCount + 1 }
          : m,
      ),
    }));

    return newEntry;
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

  updateEntryItemQuantity: (entryId: string, itemId: string, newServings: number, newQty?: number, newUnit?: string, macroScale?: number) => {
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== entryId) return entry;

        const updatedItems = entry.items.map((item) => {
          if (item.id !== itemId) return item;

          // Get current servings (default to 1 if not set)
          const currentServings = item.servings ?? 1;

          // Prevent division by zero
          if (currentServings <= 0) return item;

          // Macro scale factor: explicit override (used when rebasing qty/unit
          // independently of the stored servings value), else derived from servings change.
          const scaleFactor = macroScale ?? (newServings / currentServings);

          // Scale all macros proportionally
          const scaledMacros = {
            kcal: Math.round(item.macros.kcal * scaleFactor),
            protein: Math.round(item.macros.protein * scaleFactor * 10) / 10,
            fat: Math.round(item.macros.fat * scaleFactor * 10) / 10,
            carbs: Math.round(item.macros.carbs * scaleFactor * 10) / 10,
            // Scale optional micros if they exist
            ...(item.macros.fiber !== undefined && {
              fiber: Math.round(item.macros.fiber * scaleFactor * 10) / 10,
            }),
            ...(item.macros.sugar !== undefined && {
              sugar: Math.round(item.macros.sugar * scaleFactor * 10) / 10,
            }),
            ...(item.macros.sodium !== undefined && {
              sodium: Math.round(item.macros.sodium * scaleFactor),
            }),
            ...(item.macros.potassium !== undefined && {
              potassium: Math.round(item.macros.potassium * scaleFactor),
            }),
            ...(item.macros.water !== undefined && {
              water: Math.round(item.macros.water * scaleFactor * 100) / 100,
            }),
          };

          return {
            ...item,
            servings: newServings,
            macros: scaledMacros,
            // Clear originalMacros since quantity change is a deliberate recalculation
            originalMacros: undefined,
            ...(newQty !== undefined && { qty: newQty }),
            ...(newUnit !== undefined && { unit: newUnit }),
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

  setFoodItemServing: (entryId: string, itemId: string, servingId: string) => {
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const updatedItems = entry.items.map((item) => {
          if (item.id !== itemId || !item.fsServings) return item;
          const serving = item.fsServings.find((s) => s.servingId === servingId);
          if (!serving) return item;
          return {
            ...item,
            macros: { ...serving.macros },
            originalMacros: { ...serving.macros },
            qty: serving.metricAmount ?? 0,
            unit: serving.metricUnit ?? 'serving',
            fsSelectedServingId: servingId,
          };
        });
        const newInlineKcal = updatedItems.reduce((sum, item) => sum + item.macros.kcal, 0);
        return {
          ...entry,
          updatedAt: new Date(),
          items: updatedItems,
          inlineKcal: newInlineKcal,
        };
      }),
    }));
  },

  // Weight tracking CRUD
  addWeightEntry: (entry: Omit<WeightEntry, 'id' | 'createdAt'>) => {
    const newEntry: WeightEntry = {
      ...entry,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      weightEntries: [...state.weightEntries, newEntry],
    }));

    // Queue photo uploads for any local URIs
    const photos = newEntry.photoUris ?? (newEntry.photoUri ? [newEntry.photoUri] : []);
    photos.forEach((uri, index) => {
      if (photoSyncService.isLocalUri(uri)) {
        photoSyncService.queueUpload(uri, newEntry.id, index);
      }
    });
    if (photos.some(uri => photoSyncService.isLocalUri(uri))) {
      photoSyncService.flushUploadQueue();
    }
  },

  updateWeightEntry: (id: string, updates: Partial<Pick<WeightEntry, 'date' | 'weightKg' | 'note' | 'photoUri' | 'photoUris'>>) => {
    // Capture old photos before updating (for deletion of removed storage paths)
    const oldEntry = get().weightEntries.find(e => e.id === id);
    const oldPhotos = oldEntry
      ? (oldEntry.photoUris ?? (oldEntry.photoUri ? [oldEntry.photoUri] : []))
      : [];

    set((state) => ({
      weightEntries: state.weightEntries.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }));

    // Queue uploads for new local URIs
    const newPhotos = updates.photoUris ?? (updates.photoUri ? [updates.photoUri] : []);
    newPhotos.forEach((uri, index) => {
      if (photoSyncService.isLocalUri(uri) && !oldPhotos.includes(uri)) {
        photoSyncService.queueUpload(uri, id, index);
      }
    });
    if (newPhotos.some(uri => photoSyncService.isLocalUri(uri) && !oldPhotos.includes(uri))) {
      photoSyncService.flushUploadQueue();
    }

    // Delete removed storage-path photos
    const removedPaths = oldPhotos.filter(
      p => photoSyncService.isStoragePath(p) && !newPhotos.includes(p)
    );
    if (removedPaths.length > 0) {
      photoSyncService.deletePhotos(removedPaths);
    }
  },

  deleteWeightEntry: (id: string) => {
    // Clean up storage photos before removing entry
    const entry = get().weightEntries.find(e => e.id === id);
    if (entry) {
      const photos = entry.photoUris ?? (entry.photoUri ? [entry.photoUri] : []);
      const storagePaths = photos.filter(p => photoSyncService.isStoragePath(p));
      if (storagePaths.length > 0) {
        photoSyncService.deletePhotos(storagePaths);
      }
    }

    set((state) => ({
      weightEntries: state.weightEntries.filter((e) => e.id !== id),
    }));
  },

  enqueuePendingEntries: () => {
    const pendingEntries = get().entries.filter((e) => {
      if (e.status !== 'pending') return false;
      // Skip water entries (already resolved locally as 'ok', but just in case)
      if (e.items.length === 1 && e.items[0].source === 'local') return false;
      // Skip entries already in queue
      if (nutritionQueue.has(e.rawText) || nutritionQueue.hasById(e.id)) return false;
      return true;
    });

    if (pendingEntries.length === 0) return;

    console.log(`[enqueuePendingEntries] Found ${pendingEntries.length} pending entries to drain`);

    // Fetch user once, then enqueue all pending entries
    // userId is optional — enqueue even if auth fails
    supabase.auth.getUser()
      .then(({ data: { user } }) => user?.id)
      .catch(() => undefined)
      .then((userId: string | undefined) => {
        for (const entry of pendingEntries) {
          // Re-check: entry may have been deleted/resolved while awaiting auth
          if (!get().entries.some((e) => e.id === entry.id && e.status === 'pending')) continue;

          // Read current rawText from state (user may have edited while offline)
          const current = get().entries.find((e) => e.id === entry.id);
          if (!current) continue;

          const trimmed = current.rawText.trim();
          const isFreeform = get().entryMode === 'freeform';
          let textLine: string;
          if (isFreeform) {
            textLine = trimmed;
          } else {
            textLine = (trimmed.startsWith('-') || trimmed.startsWith(EM_DASH))
              ? trimmed.substring(1).trim()
              : '';
          }
          if (!textLine) continue;

          console.log(`[enqueuePendingEntries] Enqueuing: "${textLine}" (id=${entry.id})`);

          nutritionQueue.enqueue({
            entryId: entry.id,
            rawText: current.rawText,
            textLine,
            userId,
            onResolved: (nutritionData) => {
              set((state: AppState) => ({
                entries: state.entries.map((e: Entry) =>
                  e.id === entry.id
                    ? {
                        ...e,
                        inlineKcal: nutritionData.totals.kcal,
                        status: (nutritionData as any).error ? 'error' as const : 'ok' as const,
                        errorReason: undefined,
                        items: assignItemIds(nutritionData.resolved, entry.id),
                        updatedAt: new Date(),
                      }
                    : e
                ),
              }));
            },
            onError: (error) => {
              console.error('[enqueuePendingEntries] Error resolving entry:', error);
              const errorReason: 'rate_limit' | 'entitlement_required' | 'unknown' =
              error instanceof NutritionRateLimitError ? 'rate_limit'
              : error instanceof NutritionEntitlementRequiredError ? 'entitlement_required'
              : 'unknown';
              set((state: AppState) => ({
                entries: state.entries.map((e: Entry) =>
                  e.id === entry.id
                    ? { ...e, status: 'error' as const, errorReason, updatedAt: new Date() }
                    : e
                ),
              }));
            },
            isEntryDeleted: () => {
              return !get().entries.some((e: Entry) => e.id === entry.id);
            },
          });
        }
      });
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
              // Update qty/unit if corrected
              qty: result.correctedQty ?? i.qty,
              unit: result.correctedUnit ?? i.unit,
              // Update macros with corrected values
              macros: result.correctedMacros,
              // Clear originalMacros - AI-corrected values become the new "truth"
              // (revert button only shows for manual edits, not AI corrections)
              originalMacros: undefined,
              // Update confidence if provided
              confidence: result.confidence ?? i.confidence,
              // Update reasoning with new reasoning or fallback to explanation
              // Always preserve original dataSource — correction mode shouldn't change it
              reasoning: {
                ...(result.reasoning || {
                  ...i.reasoning,
                  interpretation: result.explanation,
                }),
                dataSource: i.reasoning?.dataSource,
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

  setNotificationsEnabled: (enabled: boolean) => {
    set({ notificationsEnabled: enabled });
  },

  setMealReminders: (reminders: MealReminder[]) => {
    set({ mealReminders: reminders });
  },

  toggleMealReminder: (id: string) => {
    set((state) => ({
      mealReminders: state.mealReminders.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  },

  updateMealReminderTime: (id: string, time: string) => {
    set((state) => ({
      mealReminders: state.mealReminders.map((r) =>
        r.id === id ? { ...r, time } : r
      ),
    }));
  },

  addMealReminder: (name: string, time: string) => {
    const newReminder: MealReminder = {
      id: Date.now().toString(),
      name,
      time,
      enabled: true,
      isDefault: false,
    };
    set((state) => ({
      mealReminders: [...state.mealReminders, newReminder],
    }));
  },

  deleteMealReminder: (id: string) => {
    set((state) => ({
      mealReminders: state.mealReminders.filter((r) => r.id !== id),
    }));
  },

  setPendingInsertion: (insertion: PendingInsertion) => {
    set({ pendingInsertion: insertion });
  },

  clearPendingInsertion: () => {
    set({ pendingInsertion: null });
  },

  setIsPro: (isPro: boolean) => {
    set({ isPro });
  },

  setPendingPaywallAfterAuth: (pending: boolean) => {
    set({ pendingPaywallAfterAuth: pending });
  },

  retryEntitlementBlockedEntries: () => {
    const blocked = get().entries.filter(
      (e: Entry) => e.errorReason === 'entitlement_required',
    );
    if (blocked.length === 0) return;
    set((state: AppState) => ({
      entries: state.entries.map((entry: Entry) =>
        entry.errorReason === 'entitlement_required'
          ? {
              ...entry,
              status: 'pending' as const,
              errorReason: undefined,
              updatedAt: new Date(),
            }
          : entry,
      ),
    }));
    get().enqueuePendingEntries();
  },
}),
    {
      name: 'note-cal-storage', // unique name for the storage
      storage: createJSONStorage(() => mmkvStateStorage),
      // Only persist the data we need (exclude functions and non-serializable data)
      partialize: (state) => ({
        entries: state.entries,
        documents: state.documents,
        goals: state.goals,
        preferredUnits: state.preferredUnits,
        entryMode: state.entryMode,
        enterOnlyMode: state.enterOnlyMode,
        savedEntries: state.savedEntries,
        customMeals: state.customMeals,
        weightEntries: state.weightEntries,
        notificationsEnabled: state.notificationsEnabled,
        mealReminders: state.mealReminders,
        pendingPaywallAfterAuth: state.pendingPaywallAfterAuth,
        profile: state.profile,
      }),
      // Handle version migrations
      version: 8,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          persistedState = {
            ...persistedState,
            savedEntries: persistedState.savedEntries || [],
          };
        }
        if (version < 3) {
          persistedState = {
            ...persistedState,
            weightEntries: persistedState.weightEntries || [],
          };
        }
        if (version < 4) {
          persistedState = {
            ...persistedState,
            entryMode: persistedState.entryMode || 'freeform',
          };
        }
        if (version < 5) {
          persistedState = {
            ...persistedState,
            notificationsEnabled: persistedState.notificationsEnabled ?? false,
            mealReminders: persistedState.mealReminders ?? [
              { id: 'breakfast', name: 'Breakfast', time: '08:00', enabled: true, isDefault: true },
              { id: 'lunch', name: 'Lunch', time: '12:00', enabled: true, isDefault: true },
              { id: 'dinner', name: 'Dinner', time: '18:00', enabled: true, isDefault: true },
            ],
          };
        }
        if (version < 6) {
          persistedState = {
            ...persistedState,
            enterOnlyMode: persistedState.enterOnlyMode ?? false,
          };
        }
        if (version < 7) {
          persistedState = {
            ...persistedState,
            customMeals: persistedState.customMeals || [],
          };
        }
        if (version < 8) {
          persistedState = {
            ...persistedState,
            profile: persistedState.profile ?? null,
          };
        }
        return persistedState;
      },
      // Ensure proper merge with initial state
      merge: (persistedState: any, currentState: any) => ({
        ...currentState,
        ...persistedState,
        currentDate: currentState.currentDate, // Always reset to today on cold start
        // Ensure savedEntries is always an array
        savedEntries: persistedState?.savedEntries ?? currentState.savedEntries ?? [],
        // Ensure weightEntries is always an array
        weightEntries: persistedState?.weightEntries ?? currentState.weightEntries ?? [],
        // Ensure customMeals is always an array
        customMeals: persistedState?.customMeals ?? currentState.customMeals ?? [],
        // Ensure mealReminders is always an array
        mealReminders: persistedState?.mealReminders ?? currentState.mealReminders ?? [],
      }),
    }
  )
);