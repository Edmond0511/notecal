import { Platform } from 'react-native';
import { mmkv } from '@/lib/mmkv';
import { useAppStore } from '@/store/app-store';
import { getHealthSettings, setHealthSettings } from './healthSettings';
import * as healthkit from './healthkitClient';
import { Entry, WeightEntry } from '@/types';

type HealthTable = 'food_entries' | 'weight_entries';

interface HealthDirtySet {
  food_entries: string[];
  weight_entries: string[];
}

interface HealthDeleteSet {
  food_entries: string[];
  weight_entries: string[];
}

const DIRTY_KEY = 'health-dirty';
const DELETES_KEY = 'health-dirty-deletes';
const FAILURE_COUNT_KEY = 'health-failure-counts';
const MAX_RETRIES = 5;

function isIos(): boolean { return Platform.OS === 'ios'; }

function loadDirty(): HealthDirtySet {
  const raw = mmkv.getString(DIRTY_KEY);
  const empty: HealthDirtySet = { food_entries: [], weight_entries: [] };
  if (!raw) return empty;
  try { return { ...empty, ...JSON.parse(raw) }; } catch { return empty; }
}

function saveDirty(d: HealthDirtySet) { mmkv.set(DIRTY_KEY, JSON.stringify(d)); }

function loadDeletes(): HealthDeleteSet {
  const raw = mmkv.getString(DELETES_KEY);
  const empty: HealthDeleteSet = { food_entries: [], weight_entries: [] };
  if (!raw) return empty;
  try { return { ...empty, ...JSON.parse(raw) }; } catch { return empty; }
}

function saveDeletes(d: HealthDeleteSet) { mmkv.set(DELETES_KEY, JSON.stringify(d)); }

function loadFailures(): Record<string, number> {
  const raw = mmkv.getString(FAILURE_COUNT_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function saveFailures(f: Record<string, number>) { mmkv.set(FAILURE_COUNT_KEY, JSON.stringify(f)); }

function bumpFailure(id: string): number {
  const f = loadFailures();
  f[id] = (f[id] ?? 0) + 1;
  saveFailures(f);
  return f[id];
}

function clearFailure(id: string) {
  const f = loadFailures();
  delete f[id];
  saveFailures(f);
}

function isAuthError(e: any): boolean {
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('not authorized') || msg.includes('authorization');
}

class HealthSyncService {
  // --- Dirty set API ---
  markHealthDirty(table: HealthTable, id: string): void {
    if (!isIos()) return;
    const d = loadDirty();
    if (!d[table].includes(id)) d[table].push(id);
    saveDirty(d);
  }

  markHealthDeleted(table: HealthTable, id: string): void {
    if (!isIos()) return;
    const d = loadDeletes();
    if (!d[table].includes(id)) d[table].push(id);
    saveDeletes(d);
    // Also remove from dirty set — no point trying to write a deleted record
    const dirty = loadDirty();
    dirty[table] = dirty[table].filter((x) => x !== id);
    saveDirty(dirty);
  }

  clearDirty(): void {
    saveDirty({ food_entries: [], weight_entries: [] });
    saveDeletes({ food_entries: [], weight_entries: [] });
    saveFailures({});
  }

  // --- Push: nutrition ---
  async pushDirtyEntries(): Promise<void> {
    if (!isIos()) return;
    const settings = getHealthSettings();
    if (!settings.healthEnabled || !settings.pushNutritionEnabled) return;

    // Process deletes first
    const deletes = loadDeletes();
    for (const id of [...deletes.food_entries]) {
      try {
        await healthkit.deleteFoodEntry(id);
        deletes.food_entries = deletes.food_entries.filter((x) => x !== id);
        clearFailure(id);
      } catch (e) {
        if (isAuthError(e)) {
          setHealthSettings({ healthAuthRevoked: true });
          break;
        }
        const count = bumpFailure(id);
        if (count >= MAX_RETRIES) {
          deletes.food_entries = deletes.food_entries.filter((x) => x !== id);
          clearFailure(id);
        }
      }
    }
    saveDeletes(deletes);

    // Then process writes
    const dirty = loadDirty();
    const entries = useAppStore.getState().entries;
    const remaining: string[] = [];
    for (const id of dirty.food_entries) {
      const entry: Entry | undefined = entries.find((e) => e.id === id);
      if (!entry) {
        // Entry no longer exists locally — drop from dirty (it'll be in deletes if needed)
        clearFailure(id);
        continue;
      }
      if (entry.status !== 'ok') {
        // Skip pending/error entries — keep dirty for next pass
        remaining.push(id);
        continue;
      }
      try {
        await healthkit.writeFoodEntry(entry);
        clearFailure(id);
      } catch (e) {
        if (isAuthError(e)) {
          setHealthSettings({ healthAuthRevoked: true });
          remaining.push(id);
          break;
        }
        const count = bumpFailure(id);
        if (count < MAX_RETRIES) remaining.push(id);
      }
    }
    dirty.food_entries = remaining;
    saveDirty(dirty);
  }

  // --- Push: weights ---
  async pushDirtyWeights(): Promise<void> {
    if (!isIos()) return;
    const settings = getHealthSettings();
    if (!settings.healthEnabled || !settings.weightSyncEnabled) return;

    // Deletes first
    const deletes = loadDeletes();
    for (const id of [...deletes.weight_entries]) {
      try {
        await healthkit.deleteWeight(id);
        deletes.weight_entries = deletes.weight_entries.filter((x) => x !== id);
        clearFailure(id);
      } catch (e) {
        if (isAuthError(e)) {
          setHealthSettings({ healthAuthRevoked: true });
          break;
        }
        const count = bumpFailure(id);
        if (count >= MAX_RETRIES) {
          deletes.weight_entries = deletes.weight_entries.filter((x) => x !== id);
          clearFailure(id);
        }
      }
    }
    saveDeletes(deletes);

    // Writes
    const dirty = loadDirty();
    const weights = useAppStore.getState().weightEntries;
    const remaining: string[] = [];
    for (const id of dirty.weight_entries) {
      const w: WeightEntry | undefined = weights.find((x) => x.id === id);
      if (!w) { clearFailure(id); continue; }
      if (w.source === 'health') {
        // Health-imported — never push back. Drop from dirty.
        clearFailure(id);
        continue;
      }
      try {
        await healthkit.writeWeight(w);
        clearFailure(id);
      } catch (e) {
        if (isAuthError(e)) {
          setHealthSettings({ healthAuthRevoked: true });
          remaining.push(id);
          break;
        }
        const count = bumpFailure(id);
        if (count < MAX_RETRIES) remaining.push(id);
      }
    }
    dirty.weight_entries = remaining;
    saveDirty(dirty);
  }

  // --- Pull: weights ---
  async pullWeightFromHealth(): Promise<void> {
    if (!isIos()) return;
    const settings = getHealthSettings();
    if (!settings.healthEnabled || !settings.weightSyncEnabled) return;

    const lastPull = settings.lastHealthPull;
    const since = lastPull
      ? new Date(lastPull)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30-day backfill on first connect

    let samples;
    try {
      samples = await healthkit.readWeightSince(since);
    } catch (e) {
      if (isAuthError(e)) setHealthSettings({ healthAuthRevoked: true });
      return;
    }

    const local = useAppStore.getState().weightEntries;
    const localIds = new Set(local.map((w) => w.id));
    const localHealthSampleIds = new Set(
      local.map((w) => w.healthSampleId).filter((x): x is string => Boolean(x))
    );

    const toAdd: WeightEntry[] = [];
    for (const s of samples) {
      // Echo from our own write?
      if (s.externalUuid && localIds.has(s.externalUuid)) continue;
      // Already imported?
      if (localHealthSampleIds.has(s.uuid)) continue;
      // New external sample
      const dateYYYYMMDD = `${s.date.getFullYear()}${String(s.date.getMonth() + 1).padStart(2, '0')}${String(s.date.getDate()).padStart(2, '0')}`;
      toAdd.push({
        id: `health-${s.uuid}`,
        date: dateYYYYMMDD,
        weightKg: s.weightKg,
        createdAt: s.date.toISOString(),
        source: 'health',
        healthSampleId: s.uuid,
      });
    }

    if (toAdd.length > 0) {
      for (const w of toAdd) {
        useAppStore.setState((s) => ({
          weightEntries: [...s.weightEntries, w],
        }));
      }
    }

    setHealthSettings({ lastHealthPull: Date.now() });
  }

  private observerTeardown: (() => void) | null = null;

  startWeightObserver(): void {
    if (!isIos()) return;
    if (this.observerTeardown) return; // already running
    this.observerTeardown = healthkit.observeWeight(() => {
      // Observer callback — fire-and-forget pull
      this.pullWeightFromHealth().catch((e) => {
        console.warn('[health] observer-triggered pull failed', e);
      });
    });
  }

  stopWeightObserver(): void {
    this.observerTeardown?.();
    this.observerTeardown = null;
  }

  async fullHealthSync(): Promise<void> {
    if (!isIos()) return;
    if (!getHealthSettings().healthEnabled) return;
    await this.pushDirtyEntries();
    await this.pushDirtyWeights();
    await this.pullWeightFromHealth();
  }

  // --- Test-only inspector ---
  __getDirtyForTest(): HealthDirtySet { return loadDirty(); }
  __getDeletesForTest(): HealthDeleteSet { return loadDeletes(); }
}

export const healthSyncService = new HealthSyncService();
