# Testing Patterns

**Analysis Date:** 2026-03-04

## Test Framework

**Runner:**
- Jest 29.7.0 with jest-expo 54.0.17
- Config: `jest.config.js`
- TypeScript support: ts-jest 29.4.6 (compiled on the fly)

**Assertion Library:**
- Jest built-in matchers (`expect`)

**Run Commands:**

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
# Note: No coverage reporting script configured (no npm run test:coverage)
```

**Configuration** (`jest.config.js`):
- Preset: `jest-expo` (handles React Native + Expo specifics)
- Transform ignore patterns: Comprehensive list excluding internal packages (zustand, supabase, reanimated, gesture-handler, react-native-svg, mmkv, etc.)
- Module mapper: `@/*` resolves to project root (matches `tsconfig.json`)
- Test match pattern: `**/__tests__/**/*.test.ts?(x)` (strict convention)
- Setup file: `jest.setup.js` (mocking configuration)

## Test File Organization

**Location:**
- Co-located in `__tests__/` directory at project root
- Currently only one test file: `__tests__/app-store.test.ts`
- Pattern: `[name].test.ts` (not `.spec.ts`)

**Naming:**
- Files: `[module-name].test.ts`
- Test suites: `describe('module-name')`
- Test cases: `it('should [expected behavior]')`

**Structure:**

```
__tests__/
└── app-store.test.ts      # Tests for Zustand store
```

## Test Structure

**Suite Organization** from `__tests__/app-store.test.ts`:

```typescript
describe('app-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.setState({
      entries: [],
      documents: [],
      currentDate: '20260203',
      isLoading: false,
      goals: null,
      preferredUnits: 'metric',
      savedEntries: [],
    });
    jest.clearAllMocks();
  });

  describe('addEntry', () => {
    it('should set entry status to "error" when API returns error field', async () => {
      // Arrange: Mock API response
      mockResolveNutrition.mockResolvedValueOnce({
        error: 'AI service unavailable, showing estimated values',
        resolved: [...],
        totals: {...},
      } as any);

      // Act: Call store action
      await useAppStore.getState().addEntry('- bread');

      // Assert: Verify behavior
      const entries = useAppStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('error');
    });
  });
});
```

**Patterns:**
- `beforeEach` resets store state and clears mocks (critical for isolation)
- Nested `describe` blocks for grouping related tests
- Async test cases using `async/await` (not `.then()` chains)
- AAA pattern (Arrange-Act-Assert) followed implicitly, sometimes explicitly commented

## Mocking

**Framework:** Jest native mocking (`jest.mock()`)

**Patterns** from `jest.setup.js`:

```typescript
// Mock MMKV with in-memory Map
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  return {
    createMMKV: jest.fn(() => ({
      set: jest.fn((key, value) => store.set(key, value)),
      getString: jest.fn((key) => store.get(key) ?? undefined),
      remove: jest.fn((key) => store.delete(key)),
      getAllKeys: jest.fn(() => [...store.keys()]),
      clearAll: jest.fn(() => store.clear()),
      contains: jest.fn((key) => store.has(key)),
    })),
  };
});

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));
```

**In test files** (`app-store.test.ts`):

```typescript
// Mock the nutritionApi module at top of file
jest.mock('@/services/nutritionApi', () => ({
  resolveNutrition: jest.fn(),
  correctNutrition: jest.fn(),
  NutritionApiError: class NutritionApiError extends Error {},
  NutritionRateLimitError: class NutritionRateLimitError extends Error {},
  NutritionQuotaExceededError: class NutritionQuotaExceededError extends Error {},
}));

// Get typed reference to mock
const mockResolveNutrition = resolveNutrition as jest.MockedFunction<typeof resolveNutrition>;

// In test: Set mock return value
mockResolveNutrition.mockResolvedValueOnce({
  resolved: [...],
  totals: {...},
});

// Verify mock was/wasn't called
expect(mockResolveNutrition).not.toHaveBeenCalled();
```

**What to Mock:**
- External APIs: nutrition service, Supabase auth/functions
- Native modules: MMKV, haptics, NetInfo
- Large dependencies: Not mocked if core to testing (e.g., Zustand store itself)

**What NOT to Mock:**
- Zustand store (test against real store)
- Type definitions
- Pure utility functions (formatNumber, goalsCalculator)
- Internal store state management

## Test Data & Fixtures

**Test Data** from `app-store.test.ts`:

```typescript
// Typical mock nutrition response
{
  resolved: [{
    id: 'test-item-1',
    entryId: '',
    label: 'chicken breast',
    qty: 150,
    unit: 'g',
    source: 'FDC',
    sourceId: 'fdc-123',
    macros: { kcal: 248, protein: 46, fat: 5, carbs: 0 },
    confidence: 0.95,
    citations: [],
  }],
  totals: { kcal: 248, protein: 46, fat: 5, carbs: 0 },
}
```

**Location:**
- Hardcoded in test file (no separate fixtures directory)
- Mocks returned via `mockResolveValueOnce()` per test
- Realistic data from actual nutrition database (FDC, OFF, fallback sources)

**Factory pattern:**
- Not used (data is simple, hardcoded in each test)
- Could be extracted to `__tests__/fixtures/` if scale increases

## Coverage

**Requirements:** Not enforced

**Current Status:**
- Only `app-store.ts` has tests
- Services (`nutritionApi`, `syncService`) untested
- Components untested
- Utils tested indirectly via store tests

**View Coverage:**
- No coverage command configured
- Could run: `jest --coverage` (would require adding to package.json)
- Would show coverage for mocked modules only

**Test Distribution:**
- 6 test cases in `app-store.test.ts`
- Focused on `addEntry` and `updateEntry` actions
- Cover success path, API errors, water entries, empty lines

## Test Types

**Unit Tests:**
- Scope: Individual store actions (addEntry, updateEntry)
- Approach: Mock API responses, verify state changes
- Examples: Test that entry status is set to 'error' on API failure, 'ok' on success
- Water entry handling verified to not call API

**Integration Tests:**
- Not present (would require connecting real/test database)
- Could test: syncService with mock Supabase, offline queue with reconnection

**E2E Tests:**
- Not used (mobile app requires Expo/device automation)
- Would use Detox or similar framework if added

## Async Testing

**Pattern:**

```typescript
it('should set entry status to "error" when API throws an exception', async () => {
  // Mock API throwing an error
  mockResolveNutrition.mockRejectedValueOnce(new Error('Network error'));

  // await the async action
  await useAppStore.getState().addEntry('- pizza');

  // Assert state after async completion
  const entries = useAppStore.getState().entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].status).toBe('error');
});
```

**Notes:**
- `async/await` used (not `.then()` chains)
- `jest.clearAllMocks()` clears call history between tests
- `mockResolvedValueOnce()` and `mockRejectedValueOnce()` for single-use mocks
- No explicit done callbacks needed (async/await handles test completion)

## Error Testing

**Pattern:**

```typescript
it('should handle water entries locally without API call', async () => {
  await useAppStore.getState().addEntry('- water 500ml');

  const entries = useAppStore.getState().entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].status).toBe('ok');
  expect(entries[0].inlineKcal).toBe(0);
  expect(entries[0].items[0].label).toBe('Water');

  // Verify error path: API not called for water
  expect(mockResolveNutrition).not.toHaveBeenCalled();
});
```

**Coverage:**
- API errors (throw exception)
- API errors with specific response field (`error` field in response)
- Validation errors (empty entry text)
- Special case handling (water entries skip API)

## Test Organization Best Practices

**Current Gaps:**
1. **Coverage:** Only store tested; services and components need tests
2. **Fixtures:** Test data hardcoded; could extract to factory/fixtures if suite grows
3. **E2E:** No end-to-end tests (would require Expo integration framework)
4. **Performance:** No performance tests (would be relevant for large entry lists)

**Recommendations for New Tests:**

**Service Tests** (e.g., `__tests__/nutritionApi.test.ts`):
```typescript
describe('nutritionApi', () => {
  it('should throw NutritionApiError with status code on network error', async () => {
    // Mock supabase.functions.invoke to throw
    const error = await resolveNutrition('test').catch(e => e);
    expect(error).toBeInstanceOf(NutritionApiError);
    expect(error.statusCode).toBeDefined();
  });
});
```

**Component Tests** (if React Testing Library added):
```typescript
describe('NotesEditor', () => {
  it('should render text input and allow typing', () => {
    // Use render from @testing-library/react-native
    // Test input changes, nutrition overlay display, etc.
  });
});
```

**Sync Service Tests**:
```typescript
describe('syncService', () => {
  it('should push dirty entries to Supabase', async () => {
    // Mock Supabase upsert
    // Mark entry dirty, call push()
    // Verify upsert was called with correct data
  });
});
```

## State Isolation

**Critical Pattern:** Reset store state in `beforeEach`:

```typescript
beforeEach(() => {
  useAppStore.setState({
    entries: [],
    documents: [],
    currentDate: '20260203',
    isLoading: false,
    goals: null,
    preferredUnits: 'metric',
    savedEntries: [],
  });
  jest.clearAllMocks();
});
```

**Why:**
- Zustand store persists state across tests
- Each test must start with clean state (no bleed-through)
- Mocks must be cleared to prevent interference

---

*Testing analysis: 2026-03-04*
