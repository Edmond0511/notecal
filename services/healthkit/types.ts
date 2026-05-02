// services/healthkit/types.ts

export interface HealthSettings {
  healthEnabled: boolean;          // master toggle
  pushNutritionEnabled: boolean;   // default true
  weightSyncEnabled: boolean;      // default true
  healthAuthRevoked: boolean;      // set when API call returns auth error
  lastHealthPull: number | null;   // ms epoch; bumped after each pull
  defaultSourceHintDismissed: boolean;
}

export const DEFAULT_HEALTH_SETTINGS: HealthSettings = {
  healthEnabled: false,
  pushNutritionEnabled: true,
  weightSyncEnabled: true,
  healthAuthRevoked: false,
  lastHealthPull: null,
  defaultSourceHintDismissed: false,
};

export interface HealthAuthState {
  /** Authorization for write types granted by user. */
  writeAuthorized: boolean;
  /** Apple does not report read auth status; we assume granted and treat empty reads as "no data". */
  readAssumed: true;
  /** True if requestAuthorization completed without throwing. */
  ok: boolean;
}

/** Plain shape returned by the wrapper for a bodyMass HealthKit sample. */
export interface HealthWeightSample {
  uuid: string;                          // the HKQuantitySample UUID (NOT our own external UUID)
  externalUuid: string | null;           // HKMetadataKey_ExternalUUID, present when written by NoteCal
  weightKg: number;
  date: Date;
  sourceName: string;                    // e.g., "Apple Watch", "NoteCal"
}
