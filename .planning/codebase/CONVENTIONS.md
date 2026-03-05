# Coding Conventions

**Analysis Date:** 2026-03-04

## Naming Patterns

**Files:**
- React components: PascalCase, e.g. `NotesEditor.tsx`, `NutritionReasoningPopup.tsx`
- Services: camelCase with descriptive suffix, e.g. `nutritionApi.ts`, `syncService.ts`, `offlineReconnectService.ts`
- Utilities: camelCase descriptive names, e.g. `goalsCalculator.ts`, `formatNumber.ts`
- Hooks: `use` prefix in camelCase, e.g. `useNetworkStatus.ts`, `useSwipeDateNavigation.ts`
- Types: Index exports from centralized `types/index.ts`
- Constants: UPPERCASE_SNAKE_CASE for constants, e.g. `DELAY_COMPLETE_ENTRY`, `EM_DASH`

**Functions:**
- Async handlers: Start with action verb, end with `Async` if not self-evident, e.g. `resolveNutrition`, `correctNutrition`
- Helper functions: Descriptive action verbs, e.g. `parseWaterEntry`, `calculateBMR`, `truncateNumber`
- Getters/calculators: Start with `get` or `calculate`, e.g. `getDailyTotals`, `calculateTDEE`
- Type checkers: Start with `is` or verb, e.g. `isWater`

**Variables:**
- State variables: camelCase, descriptive, e.g. `entries`, `currentDate`, `isLoading`
- Constants: UPPERCASE_SNAKE_CASE, e.g. `WATER_CONVERSIONS`, `MIN_CARBS_G`
- Booleans: Prefix with `is`, `has`, `should`, e.g. `isOnline`, `isFreeform`, `waterTrackingEnabled`
- Temporary/derived: camelCase, short-lived scope, e.g. `match`, `result`, `trimmed`

**Types:**
- Interfaces: PascalCase, descriptive, e.g. `Entry`, `FoodItem`, `Macros`, `UserGoals`
- Type aliases: PascalCase, e.g. `UnitSystem`, `EntryMode`, `GoalType`
- Database rows: snake_case in schema, converted to camelCase in code via serialization functions (`entryToRow`, `rowToEntry`)
- API interfaces: Exported from service modules, e.g. `NutritionApiOptions` in `nutritionApi.ts`

## Code Style

**Formatting:**
- No explicit linter/formatter configured in ESLint config
- TypeScript strict mode enabled (`strict: true` in `tsconfig.json`)
- Indentation: 2 spaces (inferred from source files)
- Line length: Flexible, no hard limit observed
- Semicolons: Used consistently

**Linting:**
- Tool: `eslint-config-expo` (~10.0.0)
- Run: `npm run lint`
- Config: Extends expo ESLint preset (no custom config file in root)
- Type safety: TypeScript `strict: true` enforces full type safety

**Comments:**
- Single-line comments: `//` for inline explanations
- Section headers: `// ──────────────────────────────────` (e.g., in `syncService.ts`)
- Block separators: Used to organize large files by responsibility (e.g., in `app-store.ts`, `syncService.ts`)

## Import Organization

**Order:**
1. React/React Native imports (core framework)
2. Third-party libraries (@supabase, zustand, expo-*, react-native-*)
3. Internal imports (@/, relative paths)
4. Types imports (inline with other internal imports)

**Examples:**

```typescript
// Pattern from NotesEditor.tsx
import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import { Entry } from "@/types";
import { truncateNumber } from "@/utils/formatNumber";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dimensions, Keyboard, Animated as RNAnimated, ... } from "react-native";
```

**Path Aliases:**
- `@/*` maps to project root (configured in `tsconfig.json`)
- Prefer `@/store`, `@/services`, `@/types`, `@/utils`, `@/constants` over relative `../../../`
- All service imports use full path: `@/services/nutritionApi`, `@/services/syncService`

## Error Handling

**Patterns:**
- Custom error classes extend `Error`: `NutritionApiError`, `NutritionRateLimitError`, `NutritionQuotaExceededError`
- Error class constructor includes message, optional status code, optional original error
- Set `name` property in constructor for debugging: `this.name = 'NutritionApiError'`
- Validation errors thrown early with descriptive messages, e.g., `if (!foodText) throw new NutritionApiError(...)`
- API errors caught and re-thrown as specific error types based on status code (429 → rate limit, 403 → quota)

**Example from `nutritionApi.ts`:**

```typescript
export class NutritionApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'NutritionApiError';
  }
}

if (error) {
  throw new NutritionApiError(
    error.message || 'Failed to resolve nutrition',
    (error as any).status
  );
}
```

**Async/Await:**
- Prefer `async/await` over `.then()` chains (modern pattern)
- Used consistently in store actions, services, and hooks
- Errors caught at service layer, rarely caught at component layer
- Promise chains acceptable for simple subscriptions: `NetInfo.addEventListener`, `supabase.auth.getUser().then(...)`

## Logging

**Framework:** `console.*` (no third-party logger)

**Patterns:**
- Development logging gated behind `__DEV__`: `if (__DEV__) console.log(...)`
- Prefixed with module identifier: `[nutritionApi] REQ:`, `[nutritionApi] ERR:`, `[nutritionApi] RES:`
- Log request/response structures: `JSON.stringify({ ...data })`
- Used in: `nutritionApi.ts` for API calls, Edge Functions for debugging
- No console logs in production (gated by `__DEV__`)

**Example:**

```typescript
if (__DEV__) {
  console.log('[nutritionApi] REQ:', JSON.stringify(requestBody));
}
```

## JSDoc/TSDoc

**Usage:**
- Functions exported from services and utilities include JSDoc
- Parameters documented with `@param`, return type with `@returns`
- Not applied to internal helper functions or store actions
- Not applied to React component props (rely on TypeScript inline typing)

**Example from `nutritionApi.ts`:**

```typescript
/**
 * Resolve nutrition information using Supabase Edge Functions with Gemini AI
 * @param foodText The food text to analyze
 * @param options Optional configuration including user ID
 * @returns NutritionResolveResponse with calculated nutrition data
 */
export async function resolveNutrition(
  foodText: string,
  options: NutritionApiOptions = {}
): Promise<NutritionResolveResponse> {
```

## Function Design

**Size:**
- Small functions preferred for helpers and transformations
- Large functions acceptable for complex state management (e.g., `addEntry` in store is multi-step)
- Component lifecycle functions kept concise (extract logic to helpers)

**Parameters:**
- Prefer explicit parameters over options objects for 1-2 args
- Use options objects for 3+ related parameters: `NutritionApiOptions { userId? }`
- Date parameters: YYYYMMDD format string (not Date objects) for storage consistency
- Quantity/amount: Stored in canonical units (kg for weight, liters for water)

**Return Values:**
- Explicit return types in all function signatures
- Promise-based functions return typed responses: `Promise<NutritionResolveResponse>`
- Void functions: used for Zustand store mutations that update state directly
- Boolean predicates: return `true/false` from validation checks

**Example from `goalsCalculator.ts`:**

```typescript
export function calculateBMR(
  sex: Sex,
  ageYears: number,
  heightCm: number,
  weightKg: number
): number {
  // ... calculation
}
```

## Module Design

**Exports:**
- Default exports: None used (all named exports)
- Named exports: Functions, classes, types, constants
- Each file has single responsibility: services export API client, utilities export helpers
- Types re-exported from centralized `types/index.ts` to avoid circular imports

**Examples:**

```typescript
// nutritionApi.ts
export class NutritionApiError extends Error { ... }
export async function resolveNutrition(...) { ... }

// goalsCalculator.ts
export function calculateBMR(...) { ... }
export function calculateTDEE(...) { ... }
```

**Barrel Files:**
- Used in `components/goals/WizardSteps/index.ts` to export step components
- Not used elsewhere (prefer explicit imports)

## Store Pattern (Zustand)

**State structure** in `store/app-store.ts`:
- Flat state object with arrays and simple types
- Complex nested data (FoodItem, Entry) stored as JSON strings in MMKV, deserialized on retrieval
- Mutable state directly in store object

**Actions pattern:**
- Store actions are synchronous mutations with async helpers
- Data fetching delegated to services (nutritionApi, syncService)
- Async actions marked with `async` keyword, return `Promise`
- Actions use `get()` to read current state, `set()` to update

**Example:**

```typescript
addEntry: (rawText: string, date?: string) => {
  const trimmed = rawText.trim();
  const isFreeform = get().entryMode === 'freeform';
  // ... synchronous logic, then update state
  set((state) => ({
    entries: [...state.entries, newEntry]
  }));
}

updateEntry: async (id: string, rawText: string) => {
  // ... fetch data async
  const result = await resolveNutrition(...);
  // ... then update state
  set((state) => ({
    entries: [...]
  }));
}
```

**MMKV Persistence:**
- All state persisted to MMKV via Zustand adapter (`mmkvStateStorage`)
- Serialization handled by Zustand automatically (via JSON stringify)
- Manual JSON serialization for nested objects in database: `items: JSON.stringify(entry.items)`

## Naming Data Structures

**Entry format** (user food entries):
- Stored with unique ID: UUID-like or timestamp-based
- Date: YYYYMMDD string (normalized format, no time component)
- Raw text: user's original input (e.g., "- chicken breast, 150g")
- Items: array of FoodItem (resolved nutrition)
- Status: 'pending' | 'ok' | 'error'
- Timestamps: createdAt/updatedAt as Date objects in code, ISO strings in DB

**FoodItem format** (individual resolved food):
- ID: unique identifier per item (e.g., `${entryId}-item-${index}-${Date.now()}`)
- Label: resolved food name (e.g., "Chicken Breast")
- Qty/Unit: quantity and unit (e.g., 150, "g")
- Servings: multiplier (1 = as entered, 2 = double portion)
- Source: 'FDC' | 'CNF' | 'OFF' | 'fallback' | 'local'
- Macros: Macros object with kcal, protein, fat, carbs, and optional micronutrients
- Confidence: 0-1 scale for AI certainty

**Document format** (per-date text):
- Key: date (YYYYMMDD)
- Content: user's raw text input (multiple lines)
- Stored per user/date in `documents` table

## Macro/Nutrition Calculations

**Servings multiplier:**
- `servings` field in FoodItem: defaults to 1
- Applied at display time: `macros.kcal * servings`
- Stored with entry (not recalculated)

**Macro ratios:**
- Stored as absolute grams (not percentages)
- Calculated from TDEE and preferences in `goalsCalculator.ts`
- Manual targets override auto-calculated values

---

*Conventions analysis: 2026-03-04*
