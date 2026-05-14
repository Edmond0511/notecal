/**
 * Pure I/O HealthKit client wrapper — authorization and nutrition entry writes.
 *
 * Exposes a stable external contract to the rest of the app; all internal
 * HealthKit calls are adapted to the actual @kingstinct/react-native-healthkit
 * v14 API rather than the API assumed at spec time.
 *
 * No MMKV, no business logic, no settings reads.
 */

import { Platform } from 'react-native';
import {
  isHealthDataAvailable,
  requestAuthorization as hkRequestAuthorization,
  saveQuantitySample,
  deleteObjects,
  queryQuantitySamples,
  subscribeToChanges,
} from '@kingstinct/react-native-healthkit';
// ComparisonPredicateOperator.equalTo = 4 (not re-exported from main package entry,
// so we use the numeric constant to avoid a sub-path import that isn't in the
// package exports map).
const METADATA_OPERATOR_EQUAL_TO = 4;

import type { Entry, WeightEntry } from '../../types';
import type { HealthAuthState, HealthWeightSample } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NUTRITION_WRITE_TYPES = [
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryFatTotal',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryFiber',
  'HKQuantityTypeIdentifierDietarySugar',
  'HKQuantityTypeIdentifierDietarySodium',
  'HKQuantityTypeIdentifierDietaryPotassium',
  'HKQuantityTypeIdentifierDietaryWater',
] as const;

const WEIGHT_TYPE = 'HKQuantityTypeIdentifierBodyMass' as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface AggregatedMacros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  /** In grams — this is what HealthKit's default unit is for sodium/potassium. */
  sodium: number;
  /** In grams — same as sodium. */
  potassium: number;
  /** Water in milliliters (ml). Canonical unit across the app — Macros.water is also ml. */
  water: number;
}

/**
 * Sums each macro across all items in the entry, applying the servings
 * multiplier. Missing macro fields are treated as 0.
 */
function aggregateEntry(entry: Entry): AggregatedMacros {
  let kcal = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  let fiber = 0;
  let sugar = 0;
  let sodium = 0;
  let potassium = 0;
  let water = 0;

  for (const item of entry.items) {
    const multiplier = item.servings ?? 1;
    const m = item.macros;
    kcal += (m.kcal ?? 0) * multiplier;
    protein += (m.protein ?? 0) * multiplier;
    fat += (m.fat ?? 0) * multiplier;
    carbs += (m.carbs ?? 0) * multiplier;
    fiber += (m.fiber ?? 0) * multiplier;
    sugar += (m.sugar ?? 0) * multiplier;
    // Macros store sodium/potassium in mg; HealthKit default unit is 'g'.
    sodium += ((m.sodium ?? 0) / 1000) * multiplier;
    potassium += ((m.potassium ?? 0) / 1000) * multiplier;
    water += (m.water ?? 0) * multiplier;
  }

  return { kcal, protein, fat, carbs, fiber, sugar, sodium, potassium, water };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns whether HealthKit is available on this device.
 * Always false on Android.
 */
export async function isAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

/**
 * Requests authorization for nutrition writes and body mass read/write.
 * Returns a {@link HealthAuthState} — never throws.
 */
export async function requestAuthorization(): Promise<HealthAuthState> {
  if (Platform.OS !== 'ios') {
    return { writeAuthorized: false, readAssumed: true, ok: false };
  }

  try {
    // Library uses `toShare` for write and `toRead` for read.
    const result = await hkRequestAuthorization({
      toRead: [WEIGHT_TYPE],
      toShare: [...NUTRITION_WRITE_TYPES, WEIGHT_TYPE],
    });
    // `result` is boolean: true means the user "successfully responded" to the
    // prompt. Apple does not reveal per-type grant status.
    return { writeAuthorized: result, readAssumed: true, ok: result };
  } catch (err) {
    console.warn('[healthkitClient] requestAuthorization error:', err);
    return { writeAuthorized: false, readAssumed: true, ok: false };
  }
}

/**
 * Writes all non-zero macros from the entry to HealthKit.
 *
 * Performs a delete-first to make writes idempotent (re-calling with the same
 * entry replaces the previous samples rather than duplicating them).
 */
export async function writeFoodEntry(entry: Entry): Promise<void> {
  if (Platform.OS !== 'ios') return;

  // Delete any previously written samples for this entry first.
  await deleteFoodEntry(entry.id);

  const agg = aggregateEntry(entry);
  const date = new Date(entry.createdAt);
  const metadata = { HKExternalUUID: entry.id };

  // Map: [identifier, unit, value]
  const writes: [string, string, number][] = [
    ['HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal', agg.kcal],
    ['HKQuantityTypeIdentifierDietaryProtein', 'g', agg.protein],
    ['HKQuantityTypeIdentifierDietaryFatTotal', 'g', agg.fat],
    ['HKQuantityTypeIdentifierDietaryCarbohydrates', 'g', agg.carbs],
    ['HKQuantityTypeIdentifierDietaryFiber', 'g', agg.fiber],
    ['HKQuantityTypeIdentifierDietarySugar', 'g', agg.sugar],
    ['HKQuantityTypeIdentifierDietarySodium', 'g', agg.sodium],
    ['HKQuantityTypeIdentifierDietaryPotassium', 'g', agg.potassium],
    ['HKQuantityTypeIdentifierDietaryWater', 'mL', agg.water],
  ];

  for (const [identifier, unit, value] of writes) {
    if (value <= 0) continue; // HealthKit rejects non-positive values.
    try {
      await saveQuantitySample(
        identifier as typeof NUTRITION_WRITE_TYPES[number],
        unit as never,
        value,
        date,
        date,
        // Cast: metadata is a superset of what the typed overload requires;
        // at runtime HKExternalUUID is a valid KnownObjectMetadata key.
        metadata as never,
      );
    } catch (err) {
      console.warn(`[healthkitClient] Failed to write ${identifier}:`, err);
    }
  }
}

/**
 * Deletes all HealthKit nutrition samples that were written with the given
 * entry ID as their external UUID.
 *
 * Failures on individual types are swallowed so one bad delete doesn't abort
 * the rest.
 */
export async function deleteFoodEntry(entryId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  for (const type of NUTRITION_WRITE_TYPES) {
    try {
      await deleteObjects(type, {
        metadata: {
          withMetadataKey: 'HKExternalUUID',
          // ComparisonPredicateOperator.equalTo = 4
          operatorType: METADATA_OPERATOR_EQUAL_TO as never,
          value: entryId,
        },
      });
    } catch (err) {
      console.warn(`[healthkitClient] deleteFoodEntry failed for ${type}:`, err);
    }
  }
}

/**
 * Writes a weight entry to HealthKit.
 *
 * Delete-first makes writes idempotent — re-calling with the same weight entry
 * replaces the previous sample rather than duplicating it.
 */
export async function writeWeight(weight: WeightEntry): Promise<void> {
  if (Platform.OS !== 'ios') return;

  await deleteWeight(weight.id);

  const date = new Date(weight.createdAt);
  await saveQuantitySample(
    WEIGHT_TYPE,
    'kg',
    weight.weightKg,
    date,
    date,
    { HKExternalUUID: weight.id } as never,
  );
}

/**
 * Deletes the HealthKit body mass sample written with the given weight entry ID
 * as its external UUID.
 */
export async function deleteWeight(weightId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  try {
    await deleteObjects(WEIGHT_TYPE, {
      metadata: {
        withMetadataKey: 'HKExternalUUID',
        operatorType: 4 as never,
        value: weightId,
      },
    });
  } catch (err) {
    console.warn('[healthkitClient] deleteWeight failed:', err);
  }
}

/**
 * Reads all body mass samples from HealthKit since the given date.
 * Returns an empty array on Android.
 */
export async function readWeightSince(since: Date): Promise<HealthWeightSample[]> {
  if (Platform.OS !== 'ios') return [];

  const samples = await queryQuantitySamples(WEIGHT_TYPE, {
    limit: 0, // 0 / non-positive = fetch all
    unit: 'kg',
    ascending: true,
    filter: {
      date: { startDate: since },
    },
  });

  return samples.map((s) => ({
    uuid: s.uuid,
    externalUuid: (s.metadata?.HKExternalUUID as string | undefined) ?? null,
    weightKg: s.quantity,
    date: new Date(s.startDate),
    sourceName: s.sourceRevision?.source?.name ?? 'unknown',
  }));
}

/**
 * Subscribes to HealthKit body mass changes.
 * Returns a cleanup function that removes the subscription.
 * Returns a no-op cleanup on Android.
 */
export function observeWeight(callback: () => void): () => void {
  if (Platform.OS !== 'ios') return () => {};

  const subscription = subscribeToChanges(WEIGHT_TYPE, () => callback());
  return () => subscription.remove();
}
