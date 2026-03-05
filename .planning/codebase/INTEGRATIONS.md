# External Integrations

**Analysis Date:** 2025-03-04

## APIs & External Services

**AI/LLM:**
- Google Gemini 2.5 API - Nutrition text and photo analysis
  - Client: Supabase Edge Function calls `https://generativelanguage.googleapis.com/v1beta/models/*`
  - Models: `gemini-2.5-flash` (primary), `gemini-2.5-flash-lite` (fallback/corrections/cheaper)
  - Auth: `GEMINI_API_KEY` set as Supabase Edge Function secret (server-side only)
  - Entry point: `supabase/functions/nutrition-resolve/index.ts` line 335+

**Authentication Providers:**
- Google OAuth via Supabase Auth
  - Credential type: OAuth 2.0 authorization code flow
  - Client: `@supabase/supabase-js` with `supabase.auth.signInWithOAuth()`
  - Redirect: Uses `expo-web-browser` for OAuth flow
  - Scope: Standard Google profile/email

- Apple Sign-In via Supabase Auth
  - Framework: `expo-apple-authentication` 8.0.8
  - Client: `@supabase/supabase-js` with `supabase.auth.signInWithOAuth()`
  - Requirement: App.json declares `usesAppleSignIn: true`
  - iOS capability: Configured via Expo plugin

## Data Storage

**Databases:**
- Supabase PostgreSQL (Cloud)
  - Project URL: `https://jfvmhxhzpaoauwsuxrep.supabase.co`
  - Project ID: `jfvmhxhzpaoauwsuxrep`
  - Client: `@supabase/supabase-js` 2.81.1
  - Connection: Via `lib/supabase.ts` with MMKV auth storage
  - Auth: Public anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`)
  - RLS: All tables use row-level security (auth.uid() filtering)

**Local Storage:**
- MMKV (react-native-mmkv 4.1.2)
  - Instance ID: `'note-cal'` (created in `lib/mmkv.ts`)
  - Backend: Native memory-mapped file on device
  - Purpose: Persistent state, auth session, sync metadata
  - Adapters: Zustand StateStorage + Supabase Auth Storage

**File Storage:**
- Local filesystem only
  - Weight tracking photos stored via `expo-image-picker` → file URI saved in MMKV/Supabase
  - Photo sync service manages upload/sync lifecycle in `services/photoSyncService.ts`

**Caching:**
- Server-side caching in Supabase `nutrition_cache` table
  - TTL: 7 days (auto-expire via database)
  - Trigger: `nutrition-resolve` Edge Function caches results with confidence >= 0.6
  - Key: Normalized food query text (lowercased, punctuation removed)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (multi-provider)
  - Implementation: OAuth 2.0 (Google/Apple) + JWT session
  - Session storage: MMKV (persistent across app restarts)
  - Token refresh: Automatic via Supabase client config (`autoRefreshToken: true`)
  - Entry point: `contexts/AuthContext.tsx` - provides user/session/isAuthenticated

**Multi-User Support:**
- User snapshots in MMKV (per-user data isolation)
  - Canonical keys: `note-cal-storage`, `sync-dirty`, `sync-last-pull`
  - User-specific keys: `user-snapshot:{userId}`, `user-sync-dirty:{userId}`, `user-sync-pull:{userId}`
  - Flow: Archive active user → restore new user snapshot on sign-in
  - Implementation: `lib/mmkv.ts` functions `saveUserSnapshot()` / `restoreUserSnapshot()`

**Local-Only Mode:**
- Works without authentication (signed out state)
- Data persists locally in MMKV under canonical keys
- Sync disabled when `user === null`
- No sync triggers when unsigned in

## Monitoring & Observability

**Error Tracking:**
- None configured (in-app error handling via `NutritionApiError` classes)
- Console logging in development mode (`__DEV__` checks)

**Logs:**
- Client-side: React Native console.log() for nutrition API calls, auth state, sync operations
- Server-side: Supabase Edge Function logs via `console.log/error` (viewable in Supabase dashboard)
- API usage tracking: Optional `api_usage` table logs Gemini calls (per `nutritionApi.ts` line 59+)

## CI/CD & Deployment

**Hosting:**
- iOS: Apple App Store (via EAS Submit)
- Android: Google Play (via EAS Submit)
- Backend: Supabase (Cloud project hosted on Supabase infrastructure)

**CI Pipeline:**
- EAS Build - Managed build service for native compilation
  - Command: `eas build --platform ios` / `eas build --platform android`
  - Project ID: `cc927630-70a6-495f-bb94-72e499487115` (in app.json extras.eas)
  - Credentials: Managed by EAS (Apple developer account required for iOS)

**Edge Functions Deployment:**
- Command: `npx supabase functions deploy nutrition-resolve`
- Deno runtime in Supabase cloud
- Secrets: GEMINI_API_KEY set via `npx supabase secrets set`
- Logs: Accessible via Supabase dashboard function logs

## Environment Configuration

**Required Environment Variables (Client-visible):**
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project endpoint
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Public authentication key

**Required Edge Function Secrets (Server-only):**
- `GEMINI_API_KEY` - Google Gemini API key (never exposed to client)
- `SUPABASE_URL` - Injected automatically by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Injected automatically by Supabase

**Optional Client Configuration:**
- `EXPO_PUBLIC_API_URL` - Base API URL (defaults to `http://localhost:3000` in `store/app-store.ts` line 12, not currently used for remote API calls)

**Secrets Location:**
- `.env` file (gitignored) - Development secrets
- EAS Secrets - Build-time environment variables
- Supabase Secrets - Edge Function runtime secrets

## Webhooks & Callbacks

**Incoming:**
- None configured
- App uses polling/event listeners instead (auth state changes, network status via NetInfo)

**Outgoing:**
- None configured
- All data sync is explicit pull/push initiated by client

## Real-Time Features

**Supabase Real-Time Subscriptions:**
- Not currently implemented
- App uses periodic sync via `syncService.fullSync()` triggered on:
  - Sign-in (via `AuthContext.tsx`)
  - App foreground (via `OfflineReconnectService`)
  - Manual sync triggers (user action)

## Network & Offline

**Network Detection:**
- `@react-native-community/netinfo` 11.4.1
- Hook: `useNetworkStatus()` in `hooks/useNetworkStatus.ts`
- Monitors: Connection state changes
- UI Indicator: `components/OfflinePill.tsx`

**Offline Queue Management:**
- `services/nutritionQueue.ts` - Queues nutrition API calls (max 3 concurrent)
- `services/offlineReconnectService.ts` - Monitors network + app foreground, drains queue on reconnect
- Pending entries: Stored locally in MMKV, marked with `status: 'pending'`
- Auto-resolve: When connectivity returns, queue drains and entries are resolved

**Sync Architecture:**
- Local-first: MMKV is source of truth
- Dirty set tracking: Changes marked in `sync-dirty` MMKV key
- Push: Batch upsert dirty records to Supabase `food_entries`, `documents`, `saved_entries`, `weight_entries`, `user_goals`
- Pull: Fetch records updated since last pull timestamp
- Tombstones: Soft deletes via `deleted_at` column for sync propagation
- Implementation: `services/syncService.ts` with row serialization/deserialization

## Third-Party Libraries Integration

**State & Storage:**
- Zustand 5.0.8 with persist middleware → MMKV backend (not AsyncStorage)
- Supabase Auth → MMKV session storage (not secure-store alone)

**Analytics:**
- Optional API usage logging in `nutrition_cache` table
- Per-call cost calculation in Edge Function

**Fonts:**
- Expo Google Fonts plugins load IBM Plex Sans, Inter, Poppins
- Loaded in `app/_layout.tsx` via `useFonts()`

**Icons:**
- FontAwesome (6.7.2+) via `@fortawesome/react-native-fontawesome`
- Expo vector icons via `@expo/vector-icons`

## Data Flow

**Nutrition Resolution Flow:**

```
Client TextInput
    ↓
addEntry() in store
    ↓
nutritionQueue.enqueue()
    ↓
resolveNutrition() in nutritionApi.ts
    ↓
supabase.functions.invoke('nutrition-resolve')
    ↓
Supabase Edge Function (Deno)
    ↓
1. Cache lookup in nutrition_cache table
2. If miss: callGemini() via generativelanguage.googleapis.com
3. Cache result (fire-and-forget)
4. Log usage (fire-and-forget)
    ↓
Return resolved items + totals
    ↓
Update store entries → MMKV persisted
    ↓
markDirty() → food_entries added to sync-dirty set
    ↓
syncService.push() → Upsert to Supabase (on reconnect or manual sync)
```

**Authentication Flow:**

```
User taps "Sign in with Google/Apple"
    ↓
signInWithOAuth() in Supabase Auth
    ↓
expo-web-browser opens OAuth provider
    ↓
User completes auth
    ↓
Session returned to app
    ↓
AuthContext.tsx onAuthStateChange("SIGNED_IN")
    ↓
Save user snapshot (if different user)
    ↓
syncService.setUser() + fullSync()
    ↓
Restore user's snapshot (documents, entries, goals)
    ↓
App displays user's data
```

---

*Integration audit: 2025-03-04*
