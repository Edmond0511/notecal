# Architecture

**Analysis Date:** 2026-03-04

## Pattern Overview

**Overall:** Local-first React Native mobile app with offline-capable synchronization to cloud backend. Multi-layer event-driven architecture with Zustand state management, MMKV local storage, Supabase backend, and AI-powered serverless functions.

**Key Characteristics:**
- **Local-first**: MMKV is the source of truth; all state mutations happen locally first
- **Offline-capable**: Queue-based API calls with automatic retry on reconnection
- **Event-driven sync**: Zustand subscriber monitors state changes and triggers deferred syncs
- **Lazy queue processing**: Nutrition API calls queued with max 3 concurrent requests
- **Multi-user support**: User snapshots in MMKV enable seamless account switching

## Layers

**Presentation Layer (React Components):**
- Purpose: Render UI and capture user input
- Location: `app/`, `components/`
- Contains: Screens, modals, input components, date navigation UI
- Depends on: State management (Zustand store), hooks (useNetworkStatus, useAuth), types
- Used by: React Native navigation/rendering engine

**State Management Layer (Zustand + MMKV):**
- Purpose: Centralized app state with persistent local storage
- Location: `store/app-store.ts`, `lib/mmkv.ts`
- Contains: Zustand store definition with persist middleware, MMKV adapters, user snapshot logic
- Depends on: Services (nutrition API, sync service, barcode service), types, utilities (date, goals calculation)
- Used by: All components, services, and contexts

**Service Layer (Business Logic):**
- Purpose: Handle API calls, data transformations, offline coordination
- Location: `services/`
- Contains: nutritionApi, syncService, nutritionQueue, offlineReconnectService, photoSyncService, barcodeService
- Depends on: Zustand store, Supabase client, types, utility functions
- Used by: State management layer (app-store actions), components (direct calls for specialized operations)

**Data Access Layer (Supabase + Sync):**
- Purpose: Bidirectional synchronization with remote database
- Location: `services/syncService.ts`, `services/photoSyncService.ts`, `lib/supabase.ts`
- Contains: Push/pull logic, dirty set tracking, row serialization, photo upload queue
- Depends on: Supabase client, MMKV, types
- Used by: Auth context (on sign-in), root layout (cold-start sync), services (debouncedPush)

**Infrastructure Layer (Auth, Storage, Config):**
- Purpose: Foundation services for auth, storage, API configuration
- Location: `lib/`, `contexts/`
- Contains: Supabase client initialization, MMKV setup, AuthContext provider, environment variables
- Depends on: React Native, Supabase SDK, MMKV, react-native-community/netinfo
- Used by: All other layers

**Serverless Backend (Deno/Supabase Edge Functions):**
- Purpose: AI-powered nutrition resolution without running a traditional server
- Location: `supabase/functions/nutrition-resolve/`
- Contains: Gemini API integration, prompt engineering, response formatting
- Depends on: Gemini API, Supabase client, TypeScript runtime
- Used by: nutritionApi service via supabase.functions.invoke()

## Data Flow

**Food Entry Resolution Flow:**

1. **User Input** → NotesEditor captures raw text (e.g., "- chicken breast, 150g")
2. **Parsing** → app-store.addEntry parses lines starting with "- " or "— "
3. **Queueing** → nutritionQueue.enqueue(item) with userId and text
4. **Concurrent Processing** → max 3 requests queued; drain() processes next item
5. **API Call** → nutritionApi.resolveNutrition() calls Supabase Edge Function via JSON-RPC
6. **Edge Function** → nutrition-resolve/index.ts sends text + locale to Gemini API
7. **Gemini Response** → Structured JSON with items (FoodItem[]) and totals (Macros)
8. **Store Update** → app-store.addEntry callback updates entry.items and entry.status to 'ok'
9. **UI Render** → NotesEditor displays kcal pill inline for each entry
10. **Sync Trigger** → syncSubscriber detects store.entries change → debouncedPush('food_entries', entryId)
11. **Remote Sync** → syncService.push() upserts entry to Supabase food_entries table

**Offline Entry Resolution Flow:**

1. User enters food text while offline
2. nutritionQueue.enqueue() is called but API call fails (network error)
3. Error callback updates entry.status to 'error' or 'pending'
4. offlineReconnectService monitors NetInfo and AppState
5. On connectivity restored, offlineReconnectService.scheduleDrain() fires
6. store.enqueuePendingEntries() re-queues all pending entries
7. nutritionQueue drains again; entries now resolve successfully

**Bidirectional Sync Flow:**

**Push (Local → Remote):**
1. Component updates state via app-store action (e.g., addEntry, updateEntry, setGoals)
2. Zustand subscriber in syncSubscriber.ts detects state change
3. syncService.debouncedPush('table', id) queues push (500ms debounce)
4. syncService.push() runs at debounce deadline
5. Dirty set in MMKV marks record as needing sync
6. syncService.push() batches all dirty records per table and upserts to Supabase
7. Dirty set cleared after successful push

**Pull (Remote → Local):**
1. syncService.fullSync() called on auth sign-in or reconnection
2. syncService.pull() queries Supabase for rows updated since lastPullTimestamp
3. MMKV stores lastPullTimestamp after each pull
4. Fetched rows deserialized back to local types (Entry, Document, SavedEntry, etc.)
5. app-store replaces entries array with fresh data (merge with dirty entries)
6. Soft deletes handled via deleted_at column (tombstones)

**State Management:**

Zustand store maintains in-memory state with MMKV persistence:
- `entries`: Food entries indexed by (date, id)
- `documents`: Per-date text documents (editor content)
- `goals`: User nutrition targets (calculated from Mifflin-St Jeor equation)
- `savedEntries`: Frequently used pre-resolved entries
- `weightEntries`: Weight history with photo support
- `currentDate`: Selected date in YYYYMMDD format
- `pendingInsertion`: Cross-component communication for new entry insertion

All mutations are:
1. Instantly applied to in-memory state
2. Persisted to MMKV via Zustand persist middleware
3. Queued for remote sync via syncSubscriber

## Key Abstractions

**Macros (Nutrition Data):**
- Purpose: Represents nutritional values for food
- Examples: `entry.items[0].macros`, `dailyTotals`
- Pattern: Always includes kcal, protein, fat, carbs; optionally fiber, sugar, sodium, potassium, water

**FoodItem (Resolved Food):**
- Purpose: Single food item with full nutritional metadata
- Examples: `services/nutritionApi.ts`, `store/app-store.ts`
- Pattern: Created by Gemini API, stored in Entry.items[], includes confidence, reasoning, source, citations

**Entry (Daily Food Entry):**
- Purpose: Container for multiple food items logged at a specific time
- Examples: `app/(tabs)/index.tsx` renders Entry[], store manages Entry[]
- Pattern: Identified by (id, date), contains raw text and resolved FoodItem[]

**Document (Daily Text):**
- Purpose: Raw text content for a date (complete editor state)
- Examples: DatePage saves document when swiped away
- Pattern: Key is (userId, date), persisted to MMKV and Supabase documents table

**DailyTotals (Aggregated Nutrition):**
- Purpose: Sum of all nutrition for a date
- Examples: TotalsBar displays DailyTotals for currentDate
- Pattern: Computed on-demand via store.getDailyTotals(date)

**UserGoals (Nutrition Targets):**
- Purpose: Personalized daily nutrition targets
- Examples: Progress rings in GoalsWizard, NutritionGoalsModal
- Pattern: Created by goalsCalculator (Mifflin-St Jeor + TDEE), includes BMR, TDEE, macro targets

**NutritionReasoning (Confidence Explanation):**
- Purpose: AI-generated explanation of nutrition resolution confidence
- Examples: NutritionReasoningPopup displays per-item reasoning
- Pattern: Returned from Gemini, includes interpretation, assumptions, confidence analysis

## Entry Points

**App Root (`app/_layout.tsx`):**
- Location: `app/_layout.tsx`
- Triggers: App launch
- Responsibilities: Initialize AuthProvider, set up gesture handler, sync services, navigation structure

**Home Screen (`app/(tabs)/index.tsx`):**
- Location: `app/(tabs)/index.tsx` (498 lines)
- Triggers: Tab navigation to home
- Responsibilities: Infinite pager for date navigation, TotalsBar display, modal management (settings, goals, weight, barcode, food photo, saved entries)

**Food Entry (`components/NotesEditor.tsx`):**
- Location: `components/NotesEditor.tsx` (1,219 lines)
- Triggers: Rendered by DatePage for active date
- Responsibilities: Multi-line text input, parse "- " prefixed lines, enqueue nutrition API calls, display inline kcal pills, handle servings/macro editing

**Date Navigation (`components/DatePage.tsx`):**
- Location: `components/DatePage.tsx` (Memo component)
- Triggers: InfinitePager page change (swipe left/right)
- Responsibilities: Render NotesEditor and entries for a date, manage document text state, save document on unmount

**Nutrition Resolution (`services/nutritionApi.ts`):**
- Location: `services/nutritionApi.ts` (481 lines)
- Triggers: nutritionQueue.executeItem()
- Responsibilities: Call Supabase Edge Function, handle rate limits, validate response, return FoodItem[]

**Edge Function Entrypoint (`supabase/functions/nutrition-resolve/index.ts`):**
- Location: `supabase/functions/nutrition-resolve/index.ts` (969 lines)
- Triggers: supabase.functions.invoke('nutrition-resolve')
- Responsibilities: Call Gemini API (flash or lite model), handle rate limiting with fallback, format response, correction mode support

**Authentication (`contexts/AuthContext.tsx`):**
- Location: `contexts/AuthContext.tsx` (69 lines)
- Triggers: App cold start, auth state change (sign-in/sign-out)
- Responsibilities: Check persistent session, restore user snapshot on sign-in, sync on sign-in, clear data on sign-out

## Error Handling

**Strategy:** Graceful degradation with user feedback and offline fallbacks

**Patterns:**

**Nutrition API Errors:**
- `NutritionApiError`: Generic error with status code
- `NutritionRateLimitError` (429): Triggers queue backoff; client retries on reconnect
- `NutritionQuotaExceededError` (403): Marks entry as error; user can retry manually
- `NutritionNotFoodError` (422): Photo doesn't contain food; show error toast
- Caught in nutritionQueue.executeItem() → calls item.onError() → updates entry.status

**Network Errors:**
- Offline detected by NetInfo listener
- API calls fail → catch in queue → mark entry pending
- offlineReconnectService monitors reconnection
- On reconnect: enqueuePendingEntries() re-queues all pending entries

**Sync Errors:**
- Push errors: debouncedPush retried after 5s delay
- Pull errors: caught in fullSync(), logged but doesn't block UI
- RLS policy violations: Silent failure (caught but no user notification)

**Auth Errors:**
- Session expired: supabase.auth auto-refreshes token via mmkv storage
- Sign-in failure: AuthModal shows error message
- Sign-out: Clear all local data via clearUserData()

## Cross-Cutting Concerns

**Logging:**

- `console.log()` throughout for development
- Prefixed logs in services: `[queue]`, `[reconnect]`, `[sync]`, `[nutritionApi]`
- Conditional __DEV__ guards for verbose output

**Validation:**

- Type safety via TypeScript interfaces (strict mode)
- Zustand store validates on state updates
- Supabase RLS policies validate on remote access
- nutritionApi.resolveNutrition() validates response structure

**Authentication:**

- Supabase Auth with OAuth (Google, Apple) and session persistence via MMKV
- AuthContext checks session on cold start and monitors onAuthStateChange
- syncService.setUser(userId) gates all sync operations

**Offline/Online Coordination:**

- NetInfo monitors connectivity; hooks expose useNetworkStatus()
- nutritionQueue gracefully handles offline API calls
- offlineReconnectService drains queues on reconnection
- syncSubscriber rate-limits pushes with debouncedPush

---

*Architecture analysis: 2026-03-04*
