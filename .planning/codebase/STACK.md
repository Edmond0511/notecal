# Technology Stack

**Analysis Date:** 2025-03-04

## Languages

**Primary:**
- TypeScript 5.9.2 - Full codebase (React Native components, services, utilities)
- JavaScript - Package.json, Babel/Metro configuration

**Secondary:**
- Deno (TypeScript) - Supabase Edge Functions (serverless backend)
- SQL - Database migrations and Supabase schema definitions

## Runtime

**Environment:**
- Node.js 24.10.0 - Development and build tooling
- React Native 0.81.5 - Mobile app runtime (iOS/Android)
- Expo SDK 54 - Cross-platform framework with Expo Router

**Package Manager:**
- npm 11.6.2
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- React 19.1.0 - UI components with React Compiler enabled
- React Native 0.81.5 - Mobile framework
- Expo 54.0.32 - Development platform and build tooling

**Routing & Navigation:**
- Expo Router 6.0.22 - File-based routing with typed routes (experiments.typedRoutes enabled)
- React Navigation 7.1.8+ - Native navigation primitives

**State Management:**
- Zustand 5.0.8 - Lightweight state management with persist middleware
- MMKV Storage (via Zustand adapter) - Synchronous state persistence

**UI & Animation:**
- React Native Reanimated 4.1.1 - Gesture-driven animations
- React Native Gesture Handler 2.28.0 - Touch and swipe gestures
- Expo Blur 15.0.8 - Blur effects
- React Native SVG 15.12.1 - SVG rendering for charts and icons
- Expo Linear Gradient 15.0.8 - Gradient backgrounds
- Universal Gradient Text 0.1.2 - Gradient text effects

**Testing:**
- Jest 29.7.0 - Unit test runner
- Jest Expo 54.0.17 - Expo-specific Jest preset
- ts-jest 29.4.6 - TypeScript support for Jest
- React Testing Library (implicit via jest-expo)

**Build & Dev Tools:**
- Expo CLI - Mobile app development and build
- ESLint 9.25.0 - Code linting (expo config)
- TypeScript Compiler (tsc) - Type checking

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.81.1 - Backend database and auth client
- `react-native-mmkv` 4.1.2 - High-performance synchronous storage (replaces AsyncStorage)
- `react-native-nitro-modules` 0.33.7 - Peer dependency for MMKV JSI access

**UI & Fonts:**
- `@expo-google-fonts/*` (IBM Plex Sans, Inter, Poppins) - Custom fonts
- `@expo/vector-icons` 15.0.3 - Icon library
- `@fortawesome/react-native-fontawesome` 0.3.2 - FontAwesome icons
- `react-native-svg` 15.12.1 - SVG rendering

**Device Integration:**
- `expo-camera` 17.0.10 - Camera access (with NSCameraUsageDescription in app.json)
- `expo-image-picker` 17.0.10 - Photo library and camera selection
- `expo-apple-authentication` 8.0.8 - Apple Sign-In
- `expo-secure-store` 15.0.8 - Secure credential storage
- `expo-haptics` 15.0.8 - Haptic feedback
- `@react-native-community/netinfo` 11.4.1 - Network connectivity detection

**Utilities:**
- `expo-constants` 18.0.13 - App constants and manifest access
- `expo-linking` 8.0.11 - Deep linking
- `expo-web-browser` 15.0.10 - OAuth redirect handling
- `@callstack/liquid-glass` 0.7.0 - Glass morphism UI effects
- `react-native-infinite-pager` 0.3.18 - Swipe-based pager
- `react-native-pager-view` 6.9.1 - Native paging
- `react-native-worklets` 0.5.1 - Background task execution

## Configuration

**Environment:**
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project endpoint (public)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public API key (public)
- `GEMINI_API_KEY` - Google Gemini API key (set as Supabase Edge Function secret, not in client)
- Development environment variables in `.env` (not committed)

**Build Configuration:**
- `app.json` - Expo app manifest with:
  - New Architecture enabled: `newArchEnabled: true`
  - React Compiler enabled: `experiments.reactCompiler: true`
  - Typed Routes enabled: `experiments.typedRoutes: true`
  - iOS bundle ID: `com.edmond0511.notecal`
  - Android package: `com.edmond0511.notecal`
  - Camera permission for barcode scanning
- `tsconfig.json` - TypeScript strict mode with path alias `@/*`
- `eslint.config.js` - ESLint configuration (Expo flat config)
- `jest.config.js` - Jest test configuration with jest-expo preset
- `supabase/config.toml` - Local Supabase emulator configuration

**Supabase Local Development:**
- API on port 54321
- Database (PostgreSQL v17) on port 54322
- Studio UI on port 54323
- Edge Function runtime enabled with inspector on port 8083

## Platform Requirements

**Development:**
- macOS 12+ (target observed: macOS 25.0.0)
- Xcode for iOS development and simulator
- iOS Simulator or physical iOS device (iOS 13+)
- Android Emulator or physical Android device (Android 6+)
- Docker (for local Supabase via `npx supabase start`)

**Production:**
- Deployment: EAS (Expo Application Services)
  - iOS: App Store via EAS Submit
  - Android: Google Play via EAS Submit
  - Native builds via `eas build --platform ios/android`
- Backend: Supabase PostgreSQL (cloud hosted at jfvmhxhzpaoauwsuxrep.supabase.co)
- Serverless: Supabase Edge Functions (Deno runtime)

## Storage Architecture

**Local Storage Stack:**
- `react-native-mmkv` - Primary synchronous storage (via `lib/mmkv.ts`)
- Zustand + MMKV adapter - State persistence to MMKV
- Supabase + MMKV adapter - Auth session persistence to MMKV
- User-scoped snapshots - Separate MMKV keys per user for multi-user support

**Remote Storage:**
- Supabase PostgreSQL - Source of truth for synced data
- Tables: `food_entries`, `documents`, `saved_entries`, `weight_entries`, `user_goals`, `nutrition_cache`, `api_usage`, `profiles`

## Development Workflow

**Local Development:**
```bash
npm install              # Install dependencies
npx expo prebuild       # Generate native code (MMKV requires this, not Expo Go)
npx expo run:ios        # Build and run on iOS simulator
npx expo start          # Start Metro dev server (separate terminal)

npm run lint            # Run ESLint
npm test                # Run Jest tests
npm run test:watch      # Watch mode
```

**Supabase Local Development:**
```bash
npx supabase start                              # Start local Postgres + API
npx supabase db reset                           # Run migrations
npx supabase functions serve nutrition-resolve  # Serve Edge Function locally
npx supabase functions deploy nutrition-resolve # Deploy to cloud
npx supabase secrets set GEMINI_API_KEY=...     # Set Edge Function secret
```

**Build & Deployment:**
```bash
eas build --platform ios                # Build for iOS App Store
eas build --platform android            # Build for Google Play
eas submit --platform ios               # Submit to App Store
eas submit --platform android           # Submit to Google Play
```

---

*Stack analysis: 2025-03-04*
