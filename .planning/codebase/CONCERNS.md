# Codebase Concerns

**Analysis Date:** 2026-03-04

## Tech Debt

**Large Component Files (>1000 lines):**
- Issue: Several key components exceed 1200 lines, making them difficult to maintain and test
- Files affected: `components/NutritionReasoningPopup.tsx` (2,876 lines), `components/DatabaseSearchModal.tsx` (1,446 lines), `components/WeightTrackingModal.tsx` (1,339 lines), `supabase/functions/nutrition-resolve/index.ts` (1,271 lines), `store/app-store.ts` (1,222 lines), `components/NotesEditor.tsx` (1,161 lines)
- Impact: Harder to debug, higher cognitive load, increased risk of bugs during refactoring
- Fix approach: Break into smaller sub-components with clear responsibilities. For `NutritionReasoningPopup.tsx`, consider extracting item breakdown, macro editor, and reasoning display into separate components. Split Edge Function logic into utility modules.

**Missing Sync Triggering on Entry Deletion:**
- Issue: `deleteEntry()` in `store/app-store.ts` removes entries locally but doesn't mark them dirty for sync or call `syncService.pushDelete()`
- Files: `store/app-store.ts` (line 295), `services/syncService.ts`
- Impact: Deleted entries may not propagate to remote Supabase on other devices. The CLAUDE.md explicitly lists "Deletion sometimes doesn't sync with TotalsBar values" as a current issue.
- Fix approach: Add `syncService.pushDelete('food_entries', id)` call in `deleteEntry()`. Similarly check `deleteEntries()`, `deleteWeightEntry()`, `deleteSavedEntry()` - all should trigger sync.

**TotalsBar Not Updating After Deletion:**
- Issue: When entries are deleted, `TotalsBar` displays stale totals
- Files: `components/TotalsBar.tsx` (memoized with shallow comparison), `app/(tabs)/index.tsx` (how entries are passed), `store/app-store.ts` (getDailyTotals calculation)
- Impact: User sees incorrect daily nutrition totals after deleting entries. Known issue in CLAUDE.md.
- Root cause: Likely that `getDailyTotals()` is not being recalculated or entries filtered by date are not triggering re-render
- Fix approach: Verify `getDailyTotals()` is called after deletion. Check if the `entries` selector in main screen properly filters and updates. May need to remove or adjust memoization in `TotalsBar` to ensure re-render on data change.

**Weight Chart Not Updating for 30/60/90 Day Views:**
- Issue: `WeightChart` doesn't visibly update when switching between time ranges
- Files: `components/weight/WeightChart.tsx` (useMemo on line 67, dependency array includes `range`)
- Impact: User can't see filtered weight history for different time periods
- Root cause: Chart may be memoized incorrectly or date range calculation has logic error
- Fix approach: Verify `range` changes trigger `useMemo` recalculation. Check date cutoff calculation on line 78-79 (ensure proper zero-padding). Add console logging to verify `filteredEntries` changes.

**Missing Error Handling in capturePhoto Lock Release:**
- Issue: `handleCapture()` in `FoodPhotoModal.tsx` sets `captureLockRef.current = true` but only clears it implicitly via `onClose()`
- Files: `components/FoodPhotoModal.tsx` (lines 91-106)
- Impact: If photo capture errors and `onClose()` doesn't fire, lock persists and prevents future photo captures
- Fix approach: Always reset lock in finally block: `finally { captureLockRef.current = false; }`

**Photo Permission Handling Missing Fallback UI:**
- Issue: When `expo-camera` is not available (not built), FoodPhotoModal shows stub UI with no explanation
- Files: `components/FoodPhotoModal.tsx` (lines 31-43, uses lazy loading)
- Impact: User gets cryptic blank camera screen instead of helpful error message
- Fix approach: Show informative error message when camera isn't available: "Camera not available. Please rebuild the app with native dependencies."

## Known Bugs

**App Crashes When Attempting to Take a Photo:**
- Symptoms: App crashes when user taps capture button in camera modal
- Files: `components/FoodPhotoModal.tsx` (lines 90-106), potentially expo-camera integration
- Trigger: User opens camera -> attempts to capture photo
- Likely cause: Missing native module binding for expo-camera v17.0.10 or race condition in photo capture
- Workaround: None documented
- Fix approach:
  1. Ensure development build is used (not Expo Go)
  2. Verify `npx expo prebuild --clean && npx expo run:ios` was run after installing expo-camera
  3. Add try-catch around `takePictureAsync` with detailed error logging
  4. Implement graceful fallback if native module unavailable

**Syncing Can Log User Out on Other Device:**
- Symptoms: User signed in on Device A, syncs data. Device B shows logged out after sync.
- Files: `services/syncService.ts` (pull logic), `contexts/AuthContext.tsx` (session handling)
- Trigger: Full sync operation, possibly during pull of user_goals or auth state mismatch
- Impact: Data loss of current session state, requires re-authentication
- Fix approach: Audit sync pull operations to ensure they don't overwrite auth session. Check if pulling `user_goals` with null value clears auth state. Verify RLS policies don't conflict with multi-device sync.

**"Last Synced" Timestamp Only Updates on Login/Logout:**
- Symptoms: Last sync time shown in settings doesn't update during normal sync operations
- Files: `services/syncService.ts`, `components/SettingsModal.tsx` (where last synced is displayed)
- Trigger: Sync occurs via `enqueuePendingEntries()` or reconnection, but timestamp doesn't change
- Impact: User has no visibility into sync freshness during regular use
- Fix approach: Add timestamp update in `syncService.fullSync()` completion. Store in MMKV key like `sync-last-timestamp`.

## Security Considerations

**Supabase Project URL Exposed in Frontend Code:**
- Risk: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are embedded in client code
- Files: `lib/supabase.ts`, `.env` (gitignored but values in source)
- Current mitigation: RLS policies restrict direct table access to authenticated users only
- Recommendations:
  1. Verify all Supabase tables have RLS enabled and restrict operations to `auth.uid()`
  2. Review `user_goals`, `food_entries`, `documents`, `saved_entries`, `weight_entries` RLS policies
  3. Consider additional API endpoint for sensitive operations (e.g., quota checks)
  4. Monitor for unauthorized access patterns in Supabase dashboard

**Gemini API Key Stored in Edge Function Secrets:**
- Risk: If Edge Function is compromised, API key is exposed
- Files: `supabase/functions/nutrition-resolve/index.ts` uses `Deno.env.get('GEMINI_API_KEY')`
- Current mitigation: Secrets set via `npx supabase secrets set` (not in code)
- Recommendations:
  1. Implement per-user quota tracking (already attempted in `checkUserQuota()`)
  2. Add request signing to verify requests come from authenticated app
  3. Rate limit by user_id or IP to prevent API abuse
  4. Monitor Gemini API usage for anomalies

**No Request Authentication for Edge Function:**
- Risk: `nutrition-resolve` Edge Function accepts requests from any origin
- Files: `supabase/functions/nutrition-resolve/index.ts` (line 4-8, CORS headers allow `*`)
- Impact: Anyone can call the nutrition API and incur Gemini costs
- Fix approach:
  1. Verify `userId` parameter matches authenticated user (check Supabase auth token)
  2. Add request signing or JWT validation
  3. Implement per-user quota enforcement with hard limits
  4. Rate limit by user_id before calling Gemini

**Photo URIs May Be Signed Supabase URLs (Expiring):**
- Risk: If weight entry photos are stored in Supabase and signed URLs are used, links expire after period
- Files: `components/WeightTrackingModal.tsx`, `services/photoSyncService.ts`
- Impact: Old weight photos may become inaccessible
- Fix approach: Store raw photo data or use permanent public URLs. Document photo retention policy.

## Performance Bottlenecks

**Large State Tree Causing Unnecessary Re-renders:**
- Problem: `app-store.ts` merges entries, documents, goals, weight entries into single state object (957 lines)
- Files: `store/app-store.ts`, `app/(tabs)/index.tsx` (uses selectors to filter by date)
- Cause: No normalization of state structure. Zustand subscribers re-render on any store change.
- Impact: Adding a single entry re-renders all components subscribed to any store slice, even if on different date
- Improvement path:
  1. Split into separate stores for `entries`, `documents`, `goals`, `weightEntries`
  2. Use `useShallow()` selector (already used in main screen line 73-77) more widely
  3. Profile with React DevTools to measure re-render count

**Nutrition Queue Processing Sequential Calls:**
- Problem: Processes max 3 concurrent requests but each still awaits fully before moving to next
- Files: `services/nutritionQueue.ts` (lines 50-56)
- Cause: Architecture is correct but no batching of similar food items
- Impact: If user enters 100 unique foods, takes ~33 API rounds
- Improvement path:
  1. Cache common food items locally before API call (fallback DB in nutritionApi.ts has only 14 items)
  2. Expand fallback database with 500+ common foods
  3. Implement fuzzy matching to reuse cached results for similar entries (e.g., "2 eggs" vs "egg")

**Edge Function Cold Starts:**
- Problem: Supabase Edge Functions may have startup latency
- Files: `supabase/functions/nutrition-resolve/index.ts`
- Impact: First nutrition request per session may take 2-5 seconds
- Improvement path:
  1. Add warming request on app launch (pre-heat function)
  2. Monitor Edge Function execution times in Supabase dashboard
  3. Consider migration to long-running service if response times unacceptable

**Expensive Store Hydration on App Launch:**
- Problem: `app-store.ts` hydrates entire MMKV on startup, deserializing all entries/documents for all dates
- Files: `lib/mmkv.ts`, `store/app-store.ts` (persist config)
- Cause: Local-first architecture requires loading all state to ensure offline capability
- Impact: App may freeze briefly on launch with large datasets (1000+ entries)
- Improvement path:
  1. Lazy-load documents by date (hydrate only current date on launch)
  2. Load other dates on-demand as user navigates
  3. Implement MMKV pagination for large datasets
  4. Profile startup time with `console.time()` in root layout

## Fragile Areas

**Entry ID Generation Using Timestamp:**
- Files: `store/app-store.ts` (line 100, 124), `assignItemIds()` function
- Why fragile: `Date.now()` as ID source can collide if multiple entries created in same millisecond
- Safe modification: Add random suffix or use UUID library (more reliable)
- Test coverage: No unit tests for ID uniqueness under high-frequency entry creation
- Fix: `const id = `${Date.now()}-${Math.random().toString(36).slice(2)}``

**Sync State Machine Without Explicit Synchronization:**
- Files: `services/syncService.ts` (line 229, `syncing = false` flag never used)
- Why fragile: `syncing` property exists but never checked. Multiple sync operations can run concurrently, causing race conditions
- Safe modification: Implement proper sync locking using `syncing` flag to prevent overlapping push/pull
- Test coverage: No tests for concurrent sync scenarios
- Example problem: If user modifies entry while push is in-flight, dirty set may be cleared incorrectly

**JSON Parsing Errors in Sync Deserialization:**
- Files: `syncService.ts` (lines 79, 119, 144) use unsafe `JSON.parse()` with fallback to empty array
- Why fragile: If cached JSONB data is corrupted, silently becomes empty instead of erroring
- Safe modification: Add logging and monitoring for parse failures. Consider strict mode.
- Example: `items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items ?? [])`
- Fix: Add try-catch with error reporting to identify data corruption

**Manual Targets Feature Lacks Validation:**
- Files: `store/app-store.ts`, `components/NutritionGoalsModal.tsx`
- Why fragile: Manual target macros (protein/fat/carbs) can be set to invalid values (0, negative, too high)
- Safe modification: Add validation in setter to ensure targets are within reasonable ranges
- Test coverage: No validation unit tests
- Example: User sets protein target to -100 and crashes nutrition calculations

**Photo URI Hardcoded as String Field:**
- Files: `types/index.ts` (WeightEntry), migration files
- Why fragile: Migration from `photo_uri` (single) to `photo_uris` (array) not fully complete. Dual fields can cause sync conflicts.
- Safe modification: Complete migration by removing legacy `photo_uri` field and backfilling old entries
- Test coverage: No tests for photo_uri vs photo_uris compatibility
- Risk: Syncing from old code path writes to `photo_uri`, new code reads `photo_uris`, causing data loss

## Scaling Limits

**MMKV Storage Size:**
- Current capacity: Not documented, but React Native MMKV on iOS is limited by available RAM
- Limit: ~50-100 MB practical limit before slowdowns occur
- With current data: ~1000 food entries × 1KB each ≈ 1MB (plenty of headroom)
- Scaling path:
  1. Implement paginated hydration (load only recent 90 days by default)
  2. Archive old entries to remote-only storage
  3. Monitor MMKV size with `mmkv.getAllKeys().length`

**Gemini API Monthly Quota:**
- Current capacity: Depends on Google project tier (not documented in code)
- Limit: Rate limit will trigger at some point (fallback to Flash Lite helps)
- Scaling path:
  1. Implement stricter quota checks (currently in `checkUserQuota()` but may not be enforced)
  2. Add user quotas per tier (free vs premium)
  3. Implement caching more aggressively (7-day cache exists but only at server level)

**Supabase Database Row Limits:**
- Current capacity: ~1 year × 3 entries/day = ~1000 food entries per user (well under Supabase free tier)
- Limit: Database will eventually hit storage limits (~1GB for free tier)
- Scaling path:
  1. Implement data archival (move entries >2 years old to separate table)
  2. Clean up soft-deleted entries (currently just marked with `deleted_at`)
  3. Monitor database size in Supabase dashboard

## Dependencies at Risk

**expo-camera Native Binding Issues:**
- Risk: expo-camera v17.0.10 requires native rebuild and has reported crashes
- Impact: Photo-based nutrition resolution unavailable, known crash in CLAUDE.md
- Migration plan:
  1. Test upgrade to latest expo-camera (currently pinned to v17)
  2. Consider alternative camera library if issues persist
  3. Add feature flag to disable photo feature if native module unavailable

**Supabase Edge Functions Deno Runtime:**
- Risk: Deno is newer ecosystem, smaller community than Node.js
- Impact: Harder to find libraries, potential breaking changes in Deno versions
- Migration plan: Document Deno version requirements, monitor Supabase announcements for runtime updates

**React Native Reanimated 4.1.1:**
- Risk: Major version with breaking changes, gesture handler integration can be fragile
- Impact: Animations may break on updates, swipe navigation could become unreliable
- Migration plan: Pin to specific version, test upgrades thoroughly in isolated branch

**react-native-mmkv 4.1.2:**
- Risk: JSI-based, requires native module compilation, can break between expo-sdk versions
- Impact: Storage may fail if native build breaks
- Migration plan: Maintain parallel AsyncStorage fallback for emergency recovery

## Missing Critical Features

**No Data Export:**
- Problem: User data trapped in app, no way to backup or migrate
- Blocks: User cannot export nutrition history, weight history, or settings
- Impact: User lock-in, poor user experience if switching apps
- Fix: Add CSV/PDF export for entries, goals, weight data (already in CLAUDE.md TODOs)

**No Meal Categorization:**
- Problem: All entries lumped together, no breakfast/lunch/dinner structure
- Blocks: Harder to plan meals, less detailed tracking
- Impact: Power users may abandon app for competitors with meal planning
- Fix: Add meal type selector when creating entries (already in CLAUDE.md TODOs)

**No Goal Weight Timeline Tracking:**
- Problem: User can set goal weight but no tracking of progress toward it
- Blocks: Weight loss goals not fully supported
- Impact: Feature incomplete despite being in wizard
- Fix: Implement `targetWeightKg` and `timelineWeeks` from user_goals table (fields exist in migration but not used)

**No Dark Mode:**
- Problem: App hardcoded to light theme
- Blocks: High battery drain on OLED phones at night
- Impact: Poor UX for evening/night users
- Fix: Add dark mode toggle (already in CLAUDE.md TODOs)

## Test Coverage Gaps

**No Tests for Sync Service:**
- What's not tested: Push, pull, dirty set tracking, conflict resolution
- Files: `services/syncService.ts` (714 lines, zero tests)
- Risk: Race conditions, data loss, or duplicate entries could occur undetected
- Priority: High - sync is mission-critical

**No Tests for Nutrition API Error Handling:**
- What's not tested: Rate limit fallback, quota exceeded, malformed responses
- Files: `services/nutritionApi.ts` (568 lines, zero tests)
- Risk: App may crash or show incorrect UI if API errors occur
- Priority: High - affects core functionality

**No Tests for Store State Mutations:**
- What's not tested: Entry creation, deletion, update correctness, ID uniqueness
- Files: `store/app-store.ts` (1,222 lines, only `app-store.test.ts` exists with basic tests)
- Risk: Silent data corruption or incorrect calculations
- Priority: High - state is central to app

**No Tests for Edge Function:**
- What's not tested: Photo mode, correction mode, cache lookup, error handling
- Files: `supabase/functions/nutrition-resolve/index.ts` (1,271 lines, zero tests)
- Risk: Gemini API integration bugs undetected, cost overruns possible
- Priority: Very High - incurs API costs

**No Integration Tests:**
- What's not tested: End-to-end food entry → sync → remote flow
- Impact: Sync bugs like "deletion doesn't sync" go undetected
- Priority: High

**No E2E Tests:**
- What's not tested: Full user journeys (signup → enter food → view stats → sync)
- Impact: User-facing bugs discovered only in production
- Priority: Medium (depends on E2E framework availability)

---

*Concerns audit: 2026-03-04*
