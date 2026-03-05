# Codebase Structure

**Analysis Date:** 2026-03-04

## Directory Layout

```
/Users/edmondyang/Documents/code/notecal/
├── app/                              # Expo Router screens and navigation
│   ├── (tabs)/
│   │   ├── index.tsx                # Main food tracking screen (498 lines)
│   │   ├── explore.tsx              # Info/help screen
│   │   └── _layout.tsx              # Tab layout
│   ├── _layout.tsx                  # Root layout with AuthProvider, GestureHandler
│   ├── auth.tsx                     # Authentication screen (285 lines)
│   └── modal.tsx                    # Modal screen handler
├── components/                       # Reusable React components
│   ├── NotesEditor.tsx              # Food entry text editor (1,219 lines) ⭐
│   ├── NutritionReasoningPopup.tsx  # Nutrition detail popup (2,574 lines) ⭐
│   ├── NutritionGoalsModal.tsx      # Goals management UI (1,093 lines) ⭐
│   ├── WeightTrackingModal.tsx      # Weight tracking interface (1,214 lines) ⭐
│   ├── SettingsModal.tsx            # App settings (689 lines)
│   ├── SavedEntriesPopup.tsx        # Saved entries list (604 lines)
│   ├── AuthModal.tsx                # OAuth/sign-in UI (488 lines)
│   ├── Calendar.tsx                 # Date picker (483 lines)
│   ├── CalendarLegendModal.tsx      # Calendar help (333 lines)
│   ├── GoalsPopup.tsx               # Goals summary display (300 lines)
│   ├── TotalsBar.tsx                # Daily nutrition totals (205 lines) ⭐
│   ├── DatePage.tsx                 # Per-date entry container (Memo)
│   ├── AnimatedDigits.tsx           # Animated number counter (143 lines)
│   ├── AddActionMenu.tsx            # Quick action menu (133 lines)
│   ├── ThinkingIndicator.tsx        # Loading spinner (108 lines)
│   ├── OfflinePill.tsx              # Offline status badge (75 lines)
│   ├── BarcodeScannerModal.tsx      # Barcode scanner (32.6 KB)
│   ├── DatabaseSearchModal.tsx      # Food database search (44 KB)
│   ├── FoodPhotoModal.tsx           # Photo nutrition extraction (15.4 KB)
│   ├── PhotoProcessingToast.tsx     # Toast notification for photo processing
│   ├── PersonalInfoModal.tsx        # Personal metrics editor (24 KB)
│   ├── BmiNumberLine.tsx            # BMI visualization
│   ├── goals/
│   │   ├── GoalsWizard.tsx          # Multi-step goals setup (600 lines)
│   │   ├── ProgressRings.tsx        # Circular progress visualization (686 lines)
│   │   └── WizardSteps/
│   │       ├── Step1Metrics.tsx     # Height/weight input (367 lines)
│   │       ├── Step2Activity.tsx    # Activity level picker (167 lines)
│   │       ├── Step3Goal.tsx        # Goal type selector (159 lines)
│   │       ├── Step4Macros.tsx      # Macro preferences (245 lines)
│   │       ├── Step5Review.tsx      # Confirmation screen (775 lines)
│   │       └── StepWeightTarget.tsx # Weight target input (402 lines)
│   ├── weight/
│   │   └── WeightChart.tsx          # Weight history graph (327 lines)
│   └── ui/                          # Base UI components
│       ├── collapsible.tsx          # Collapsible section
│       ├── icon-symbol.tsx          # Icon wrapper
│       └── icon-symbol.ios.tsx      # Platform-specific icon
├── services/                         # Business logic and API integration
│   ├── nutritionApi.ts              # Nutrition API wrapper (481 lines) ⭐
│   ├── syncService.ts               # Supabase sync engine (565 lines) ⭐
│   ├── nutritionQueue.ts            # Concurrent API queue (79 lines)
│   ├── offlineReconnectService.ts   # Offline recovery handler (88 lines)
│   ├── syncSubscriber.ts            # Store change listener (95 lines)
│   ├── photoSyncService.ts          # Photo upload/sync (12 KB)
│   ├── barcodeService.ts            # Barcode product conversion (7.5 KB)
│   ├── foodSearchApi.ts             # Database search API (4 KB)
│   └── mockApi.ts                   # Test data (189 lines)
├── store/
│   └── app-store.ts                 # Zustand state management (957 lines) ⭐
├── types/
│   └── index.ts                     # TypeScript definitions (207 lines)
├── hooks/
│   ├── useNetworkStatus.ts          # Network status hook
│   ├── usePhotoUri.ts               # Photo URI persistence
│   ├── use-theme-color.ts           # Theme color hook
│   └── use-color-scheme.ts          # Color scheme detection
├── contexts/
│   └── AuthContext.tsx              # Auth state provider (69 lines)
├── lib/
│   ├── supabase.ts                  # Supabase client setup (93 lines)
│   └── mmkv.ts                      # MMKV storage configuration (58 lines)
├── utils/
│   ├── goalsCalculator.ts           # BMR/TDEE calculation (318 lines)
│   ├── formatNumber.ts              # Number formatting (23 lines)
│   └── dateUtils.ts                 # Date parsing/formatting utilities
├── constants/
│   └── theme.ts                     # Colors, fonts, design tokens
├── supabase/
│   ├── functions/
│   │   ├── nutrition-resolve/
│   │   │   └── index.ts             # Gemini AI Edge Function (969 lines) ⭐
│   │   └── food-search/
│   │       └── index.ts             # Food database search function
│   ├── migrations/
│   │   ├── 20260129..._create_user_goals.sql
│   │   └── 20260211..._create_sync_tables.sql
│   └── config.toml
├── __tests__/
│   └── app-store.test.ts            # Store unit tests
├── docs/
│   └── plans/                       # Implementation docs and notes
├── assets/
│   └── images/                      # App icons and images
├── .planning/
│   └── codebase/                    # GSD codebase analysis docs
├── tsconfig.json                    # TypeScript config
├── package.json                     # Dependencies
├── app.json                         # Expo app config
├── jest.config.js                   # Jest testing config
├── jest.setup.js                    # Jest setup (MMKV mock)
└── .env                             # Environment variables (gitignored)
```

## Directory Purposes

**`app/` (Expo Router):**
- Purpose: File-based routing and screen definitions
- Contains: Screen components, navigation layout
- Key files: `_layout.tsx` (root), `(tabs)/index.tsx` (home), `auth.tsx` (authentication)
- Naming: File structure maps to URL routes; `(tabs)` is a route group

**`components/` (UI Components):**
- Purpose: Reusable React Native components
- Contains: Modals, editors, displays, navigation helpers
- Organized by: Feature area (goals/, weight/, ui/)
- Key files: NotesEditor (food input), TotalsBar (daily summary), ProgressRings (goals visualization)

**`services/` (Business Logic):**
- Purpose: API integration, data transformation, offline coordination
- Contains: Nutrition AI, sync engine, queue manager, network monitor
- Key files: nutritionApi (Gemini), syncService (Supabase), nutritionQueue (concurrency)
- Pattern: Mostly singletons exported as instances (e.g., `export const nutritionQueue = new NutritionQueue()`)

**`store/` (State Management):**
- Purpose: Centralized reactive state with persistence
- Contains: Zustand store definition, action handlers, selectors
- Key files: app-store.ts (957 lines, single file)
- Pattern: All state mutations go through store actions; components use useAppStore(selector)

**`types/` (TypeScript Definitions):**
- Purpose: Shared type definitions
- Contains: Macros, Entry, FoodItem, UserGoals, Document, WeightEntry, SavedEntry
- Key files: index.ts (single file, 207 lines)
- Pattern: No runtime code, only type/interface exports

**`hooks/` (Custom React Hooks):**
- Purpose: Reusable logic for components
- Contains: Network status monitoring, photo URI persistence, theme detection
- Key files: useNetworkStatus.ts, usePhotoUri.ts
- Pattern: Wrap native modules or external services; return state/callbacks

**`contexts/` (React Context):**
- Purpose: Auth state and user session management
- Contains: AuthProvider wrapping entire app
- Key files: AuthContext.tsx (auth state, sign-in/sign-out, user snapshots)
- Pattern: Uses Supabase auth; subscribes to onAuthStateChange()

**`lib/` (Infrastructure):**
- Purpose: Initialize and configure third-party services
- Contains: Supabase client, MMKV setup, storage adapters
- Key files: supabase.ts (client), mmkv.ts (MMKV + snapshot logic)
- Pattern: No logic, only setup/configuration; re-exported for dependency injection

**`utils/` (Utility Functions):**
- Purpose: Pure functions for calculation and formatting
- Contains: BMR/TDEE calculator, number formatting, date utilities
- Key files: goalsCalculator.ts (Mifflin-St Jeor), formatNumber.ts (truncation)
- Pattern: Stateless, testable; imported by store and components

**`supabase/` (Backend Infrastructure):**
- Purpose: Edge functions and migrations for remote backend
- Contains: Deno-based serverless functions, SQL migrations, config
- Key files: nutrition-resolve/index.ts (Gemini integration), migrations (create tables)
- Pattern: Edge functions are HTTP endpoints invoked via supabase.functions.invoke()

**`__tests__/` (Tests):**
- Purpose: Unit and integration tests
- Contains: Store tests, mock setup for MMKV
- Key files: app-store.test.ts
- Pattern: Jest with in-memory MMKV mock in jest.setup.js

**`.planning/codebase/` (Documentation):**
- Purpose: GSD codebase analysis and implementation guides
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, STACK.md, INTEGRATIONS.md
- Pattern: Read by /gsd:plan-phase and /gsd:execute-phase commands

## Key File Locations

**Entry Points:**
- `app/_layout.tsx`: Root app wrapper; auth check, sync initialization, navigation structure
- `app/(tabs)/index.tsx`: Home screen; infinite pager for date navigation, modal management
- `supabase/functions/nutrition-resolve/index.ts`: Edge function entrypoint for Gemini AI
- `contexts/AuthContext.tsx`: Auth state initialization on cold start

**Configuration:**
- `app.json`: Expo app metadata, build config, permissions
- `tsconfig.json`: TypeScript compiler options (strict mode)
- `.env`: Environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY)
- `supabase/config.toml`: Supabase project configuration
- `lib/mmkv.ts`: MMKV initialization and storage adapter setup
- `lib/supabase.ts`: Supabase client initialization with MMKV auth storage

**Core Logic:**
- `store/app-store.ts`: All app state mutations (entries, documents, goals, weight, saved entries)
- `services/nutritionApi.ts`: Calls Supabase Edge Function, handles rate limits, validates responses
- `services/syncService.ts`: Bidirectional sync (push/pull) to Supabase with dirty set tracking
- `services/nutritionQueue.ts`: Max 3 concurrent nutrition API requests with offline queueing
- `utils/goalsCalculator.ts`: Mifflin-St Jeor BMR equation, TDEE multipliers, macro split

**Presentation:**
- `components/NotesEditor.tsx`: Main food entry UI; parses "- " lines, queues API, displays pills
- `components/TotalsBar.tsx`: Daily nutrition totals display (kcal, protein, fat, carbs)
- `components/DatePage.tsx`: Per-date container; wraps NotesEditor, manages document text
- `components/NutritionGoalsModal.tsx`: Goals configuration and manual target editing
- `components/ProgressRings.tsx`: Circular progress visualization for macro targets

**Testing:**
- `__tests__/app-store.test.ts`: Jest tests for store actions
- `jest.setup.js`: MMKV mock (in-memory Map) for test environment
- `jest.config.js`: Jest configuration (preset, moduleNameMapper for path aliases)

## Naming Conventions

**Files:**

- **Screens:** CamelCase.tsx (e.g., `SettingsModal.tsx`, `NotesEditor.tsx`)
- **Utilities:** camelCase.ts (e.g., `goalsCalculator.ts`, `formatNumber.ts`)
- **Services:** camelCase.ts (e.g., `nutritionApi.ts`, `syncService.ts`)
- **Hooks:** use + PascalCase.ts (e.g., `useNetworkStatus.ts`, `usePhotoUri.ts`)
- **Types/Interfaces:** index.ts (single file per directory)
- **Tests:** filename.test.ts or filename.spec.ts

**Directories:**

- **Feature areas:** lowercase (e.g., `goals/`, `weight/`, `ui/`, `components/`)
- **Route groups:** (parentheses) (e.g., `(tabs)/`, indicating non-route folder)
- **Nested features:** lowercase with feature-specific components (e.g., `goals/WizardSteps/`)

**Exports:**

- **Components:** Named export (e.g., `export function NotesEditor()` or `export const NotesEditor = React.memo(...)`)
- **Services:** Singleton instance export (e.g., `export const nutritionQueue = new NutritionQueue()`)
- **Utilities:** Named function export (e.g., `export function calculateBMR()`)
- **Hooks:** Named function export (e.g., `export function useNetworkStatus()`)
- **Types:** Named interface/type export (e.g., `export interface Entry {...}`)

## Where to Add New Code

**New Feature:**
- Primary code: `components/NewFeatureName.tsx` or feature folder `components/newFeature/`
- Store actions: Add methods to `store/app-store.ts` in relevant section (entries, goals, weight, etc.)
- Tests: `__tests__/newFeature.test.ts`
- Types: Add to `types/index.ts`

**New Component/Modal:**
- Implementation: `components/NewModalName.tsx` (single file) or `components/newFeature/NewComponent.tsx`
- Integration: Import in `app/(tabs)/index.tsx` or relevant parent component
- Store integration: If needs state, add actions to store
- Styling: Use Tokens from `constants/theme.ts` for colors, fonts, spacing

**Utilities:**
- Shared helpers: `utils/newUtilName.ts`
- Calculation logic: `utils/calculationName.ts` (similar to goalsCalculator.ts)
- Import pattern: `import { helperFn } from '@/utils/helperName'`

**Services:**
- New API: `services/newApiName.ts` export singleton (e.g., `export const newApi = new NewApi()`)
- New offline feature: Extend `offlineReconnectService.ts` or create `services/newOfflineFeature.ts`
- Integration pattern: Import into store for use in actions; subscribe via syncSubscriber for remote sync

**Edge Functions:**
- New function: `supabase/functions/new-function-name/index.ts` (deno module structure)
- Invocation: `supabase.functions.invoke('new-function-name', { body: {...} })`
- Secrets: Set via `npx supabase secrets set API_KEY=value`

**New Store State:**
- Add field to AppState interface in `types/index.ts`
- Add to initial state in app-store.ts getter function
- Add action handler for mutation
- Register with syncSubscriber for remote sync (if applicable)
- Add MMKV serialization if custom type

## Special Directories

**`dist/` (Generated):**
- Purpose: Build output for web/expo builds
- Generated: Yes (by Expo prebuild)
- Committed: No (.gitignored)

**`ios/` and `android/` (Native Code):**
- Purpose: Native platform code generated by `npx expo prebuild`
- Generated: Yes
- Committed: No (regenerated on rebuild)

**`supabase/.temp/` (Temporary):**
- Purpose: Supabase CLI temporary files
- Generated: Yes
- Committed: No

**`.expo/` (Expo Config):**
- Purpose: Expo CLI cache and config
- Generated: Yes
- Committed: No

**`node_modules/` (Dependencies):**
- Purpose: npm package installation
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-04*
