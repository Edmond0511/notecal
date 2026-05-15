import { supabase } from '@/lib/supabase';
import { mmkv } from '@/lib/mmkv';
import { useAppStore } from '@/store/app-store';
import { photoSyncService } from '@/services/photoSyncService';
import { Entry, FoodItem, SavedEntry, WeightEntry, Document, UserGoals, UnitSystem, ManualTargets, CustomMeal } from '@/types';

// ============================================================
// Types
// ============================================================

type SyncTable = 'food_entries' | 'documents' | 'saved_entries' | 'custom_meals' | 'weight_entries' | 'user_goals';

interface DirtySet {
  food_entries: string[];
  documents: string[];   // keys are date strings
  saved_entries: string[];
  custom_meals: string[];
  weight_entries: string[];
  user_goals: string[];  // uses 'current' sentinel (one row per user)
}

// ============================================================
// MMKV persistence helpers
// ============================================================

const DIRTY_KEY = 'sync-dirty';
const LAST_PULL_KEY = 'sync-last-pull';

const EMPTY_DIRTY: DirtySet = { food_entries: [], documents: [], saved_entries: [], custom_meals: [], weight_entries: [], user_goals: [] };

function loadDirty(): DirtySet {
  const raw = mmkv.getString(DIRTY_KEY);
  if (!raw) return { ...EMPTY_DIRTY };
  try {
    const parsed = JSON.parse(raw);
    // Backward compat: old MMKV data may lack user_goals key
    return { ...EMPTY_DIRTY, ...parsed };
  } catch {
    return { ...EMPTY_DIRTY };
  }
}

function saveDirty(dirty: DirtySet) {
  mmkv.set(DIRTY_KEY, JSON.stringify(dirty));
}

function getLastPull(): string | null {
  return mmkv.getString(LAST_PULL_KEY) ?? null;
}

function setLastPull(ts: string) {
  mmkv.set(LAST_PULL_KEY, ts);
}

// ============================================================
// Row <-> Local type serialization
// ============================================================

function entryToRow(entry: Entry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    date: entry.date,
    raw_text: entry.rawText,
    inline_kcal: entry.inlineKcal ?? null,
    status: entry.status,
    items: JSON.stringify(entry.items),
    created_at: new Date(entry.createdAt).toISOString(),
    updated_at: new Date(entry.updatedAt).toISOString(),
    // Explicitly clear server-side tombstone on undelete (defense-in-depth)
    deleted_at: null,
  };
}

// Safely parse a JSON column that may arrive as a string (older rows / driver
// quirks) or an already-decoded object. Never throws — corrupt data falls back
// to the provided default so a single bad row can't crash sync.
function safeParseJson<T>(value: unknown, fallback: T, context: string): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value);
  } catch (err: any) {
    console.error(`[sync] JSON parse failed for ${context}:`, err?.message);
    return fallback;
  }
}

function rowToEntry(row: any): Entry {
  return {
    id: row.id,
    date: row.date,
    rawText: row.raw_text,
    inlineKcal: row.inline_kcal != null ? Number(row.inline_kcal) : null,
    status: row.status,
    items: safeParseJson(row.items, [], `food_entries.items id=${row.id}`),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function docToRow(doc: Document, userId: string) {
  return {
    user_id: userId,
    date: doc.date,
    content: doc.content,
    last_modified: new Date(doc.lastModified).toISOString(),
    // Explicitly clear server-side tombstone on undelete (defense-in-depth)
    deleted_at: null,
  };
}

function rowToDoc(row: any): Document {
  return {
    date: row.date,
    content: row.content,
    lastModified: new Date(row.last_modified),
  };
}

function savedEntryToRow(se: SavedEntry, userId: string) {
  return {
    id: se.id,
    user_id: userId,
    raw_text: se.rawText,
    items: JSON.stringify(se.items),
    total_kcal: se.totalKcal,
    usage_count: se.usageCount,
    created_at: new Date(se.createdAt).toISOString(),
    last_used_at: new Date(se.lastUsedAt).toISOString(),
    // Explicitly clear server-side tombstone on undelete (defense-in-depth)
    deleted_at: null,
  };
}

function rowToSavedEntry(row: any): SavedEntry {
  return {
    id: row.id,
    rawText: row.raw_text,
    items: safeParseJson(row.items, [], `saved_entries.items id=${row.id}`),
    totalKcal: Number(row.total_kcal),
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at),
    lastUsedAt: new Date(row.last_used_at),
  };
}

function customMealToRow(meal: CustomMeal, userId: string) {
  return {
    id: meal.id,
    user_id: userId,
    name: meal.name,
    items: JSON.stringify(meal.items),
    total_macros: JSON.stringify(meal.totalMacros),
    usage_count: meal.usageCount,
    created_at: new Date(meal.createdAt).toISOString(),
    updated_at: new Date(meal.updatedAt).toISOString(),
    last_used_at: new Date(meal.lastUsedAt).toISOString(),
    // Explicitly clear server-side tombstone on undelete (defense-in-depth)
    deleted_at: null,
  };
}

function rowToCustomMeal(row: any): CustomMeal {
  return {
    id: row.id,
    name: row.name,
    items: safeParseJson(row.items, [], `custom_meals.items id=${row.id}`),
    totalMacros: safeParseJson(
      row.total_macros,
      { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      `custom_meals.total_macros id=${row.id}`,
    ),
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastUsedAt: new Date(row.last_used_at),
  };
}

function weightEntryToRow(we: WeightEntry, userId: string) {
  return {
    id: we.id,
    user_id: userId,
    date: we.date,
    weight_kg: we.weightKg,
    note: we.note ?? null,
    photo_uri: we.photoUri ?? null,
    photo_uris: we.photoUris ? JSON.stringify(we.photoUris) : null,
    created_at: we.createdAt,
    updated_at: new Date().toISOString(),
    // Explicitly clear server-side tombstone on undelete (defense-in-depth)
    deleted_at: null,
  };
}

function rowToWeightEntry(row: any): WeightEntry {
  let photoUris: string[] | undefined;
  if (row.photo_uris) {
    const parsed = safeParseJson<string[] | undefined>(
      row.photo_uris,
      undefined,
      `weight_entries.photo_uris id=${row.id}`,
    );
    photoUris = parsed;
  }

  return {
    id: row.id,
    date: row.date,
    weightKg: Number(row.weight_kg),
    note: row.note ?? undefined,
    photoUri: row.photo_uri ?? undefined,
    photoUris,
    createdAt: row.created_at,
  };
}

function goalsToRow(goals: UserGoals, preferredUnits: UnitSystem, userId: string) {
  return {
    user_id: userId,
    sex: goals.sex,
    age: goals.age,
    height_cm: goals.heightCm,
    weight_kg: goals.weightKg,
    body_fat_percentage: (goals as any).bodyFatPercentage ?? null,
    activity_level: goals.activityLevel,
    goal_type: goals.goalType,
    protein_preference: goals.proteinPreference ?? 'standard',
    carb_preference: goals.carbPreference ?? 'standard',
    preferred_units: preferredUnits,
    bmr: goals.bmr,
    tdee: goals.tdee,
    target_kcal: goals.targetKcal,
    target_protein: goals.targetProtein,
    target_fat: goals.targetFat,
    target_carbs: goals.targetCarbs,
    manual_targets: goals.manualTargets ? JSON.stringify(goals.manualTargets) : null,
    target_weight_kg: goals.targetWeightKg ?? null,
    timeline_weeks: goals.timelineWeeks ?? null,
    created_at: new Date(goals.createdAt).toISOString(),
    updated_at: new Date(goals.updatedAt).toISOString(),
    // Explicitly clear server-side tombstone on undelete (defense-in-depth)
    deleted_at: null,
  };
}

function rowToGoals(row: any): { goals: UserGoals; preferredUnits: UnitSystem } {
  const manualTargets = row.manual_targets
    ? safeParseJson<ManualTargets | null>(
        row.manual_targets,
        null,
        `user_goals.manual_targets user_id=${row.user_id}`,
      )
    : null;

  return {
    goals: {
      sex: row.sex,
      age: row.age,
      heightCm: Number(row.height_cm),
      weightKg: Number(row.weight_kg),
      activityLevel: row.activity_level,
      goalType: row.goal_type,
      proteinPreference: row.protein_preference ?? 'standard',
      carbPreference: row.carb_preference ?? 'standard',
      targetWeightKg: row.target_weight_kg != null ? Number(row.target_weight_kg) : undefined,
      timelineWeeks: row.timeline_weeks != null ? Number(row.timeline_weeks) : undefined,
      bmr: row.bmr,
      tdee: row.tdee,
      targetKcal: row.target_kcal,
      targetProtein: row.target_protein,
      targetFat: row.target_fat,
      targetCarbs: row.target_carbs,
      manualTargets,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    preferredUnits: row.preferred_units ?? 'metric',
  };
}

// ============================================================
// SyncService
// ============================================================

const PUSH_DEBOUNCE_MS = 2000;
const BATCH_SIZE = 50;

class SyncService {
  private userId: string | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private syncing = false;

  setUser(userId: string | null) {
    this.userId = userId;
    if (!userId) {
      // Clear all pending debounce timers on sign-out
      for (const timer of this.debounceTimers.values()) clearTimeout(timer);
      this.debounceTimers.clear();
      // Clear sync metadata so old user's dirty items aren't pushed under new user
      mmkv.remove(DIRTY_KEY);
      mmkv.remove(LAST_PULL_KEY);
    }
  }

  /**
   * Verify that the active Supabase session's user matches `this.userId`.
   * Defense-in-depth against stale `userId` references after silent sign-outs
   * or session swaps from another device.
   *
   * Best-effort: only aborts on an *explicit* user-id mismatch. Network errors,
   * 5xx, parse failures, or thrown exceptions all return `true` so transient
   * issues don't block legitimate sync work. Called once per high-level sync
   * entrypoint (fullSync / public flushDirty / public pullAll), not per item.
   */
  private async verifyActiveSession(): Promise<boolean> {
    if (!this.userId) return false;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        // Network error / transient failure / parse error — proceed best-effort.
        // RLS will still gate any actual writes by user_id.
        console.warn('[sync] Session verification inconclusive, proceeding best-effort:', error?.message);
        return true;
      }
      if (data.user.id !== this.userId) {
        console.warn(
          `[sync] Session user (${data.user.id}) does not match sync user (${this.userId}), aborting sync`,
        );
        return false;
      }
      return true;
    } catch (err: any) {
      // Thrown error (network, etc) — best-effort, proceed.
      console.warn('[sync] Session verification threw, proceeding best-effort:', err?.message);
      return true;
    }
  }

  // --------------------------------------------------------
  // Push: local -> remote
  // --------------------------------------------------------

  /** Schedule a debounced push for a single item */
  debouncedPush(table: SyncTable, id: string) {
    if (!this.userId) return;

    const key = `${table}:${id}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        this.pushItem(table, id).catch((err) => {
          console.warn(`[sync] Push failed for ${key}, marking dirty:`, err.message);
          this.markDirty(table, id);
        });
      }, PUSH_DEBOUNCE_MS),
    );
  }

  /** Push a single item to Supabase. Session verification is handled once
   * by the caller (`fullSync` / public `flushDirty`); RLS on Supabase still
   * gates writes by user_id, so a stale local `userId` cannot leak data. */
  private async pushItem(table: SyncTable, id: string): Promise<void> {
    const userId = this.userId;
    if (!userId) return;

    const state = useAppStore.getState();

    if (table === 'food_entries') {
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) { console.log('[diag][sync] push food_entries skip — not in state', { id }); return; } // deleted locally, handled by pushDelete
      if (entry.status === 'pending') { console.log('[diag][sync] push food_entries skip — pending', { id }); return; } // mid-resolution, skip
      const row = entryToRow(entry, userId);
      const { error } = await supabase.from('food_entries').upsert(row, { onConflict: 'id' });
      console.log('[diag][sync] push food_entries', { id, userId, date: entry.date, status: entry.status, error: error?.message });
      if (error) throw error;
    } else if (table === 'documents') {
      const doc = state.documents.find((d) => d.date === id);
      if (!doc) { console.log('[diag][sync] push documents skip — not in state', { date: id }); return; }
      const row = docToRow(doc, userId);
      const { error } = await supabase.from('documents').upsert(row, { onConflict: 'user_id,date' });
      console.log('[diag][sync] push documents', { date: id, userId, len: doc.content?.length ?? 0, error: error?.message });
      if (error) throw error;
    } else if (table === 'saved_entries') {
      const se = state.savedEntries.find((s) => s.id === id);
      if (!se) return;
      const row = savedEntryToRow(se, userId);
      const { error } = await supabase.from('saved_entries').upsert(row, { onConflict: 'id' });
      if (error) throw error;
    } else if (table === 'custom_meals') {
      const meal = state.customMeals.find((m) => m.id === id);
      if (!meal) return;
      const row = customMealToRow(meal, userId);
      const { error } = await supabase.from('custom_meals').upsert(row, { onConflict: 'id' });
      if (error) throw error;
    } else if (table === 'weight_entries') {
      const we = state.weightEntries.find((w) => w.id === id);
      if (!we) return;
      const row = weightEntryToRow(we, userId);
      const { error } = await supabase.from('weight_entries').upsert(row, { onConflict: 'id' });
      if (error) throw error;
    } else if (table === 'user_goals') {
      const goals = state.goals;
      if (!goals) return; // cleared locally, handled by pushDelete
      const row = goalsToRow(goals, state.preferredUnits, userId);
      const { error } = await supabase.from('user_goals').upsert(row, { onConflict: 'user_id' });
      if (error) throw error;
    }
  }

  /** Soft-delete a remote row by setting `deleted_at = NOW()`. Called per-event
   * by syncSubscriber; we skip the per-call session verify to avoid N+1
   * round-trips. RLS on Supabase still enforces user_id. */
  async pushDelete(table: SyncTable, id: string) {
    if (!this.userId) return;

    try {
      if (table === 'user_goals') {
        // Tombstone the row so other devices (and a future re-sign-in)
        // see deleted_at on pull and clear local goals. The row itself is
        // preserved — re-onboarding upserts with deleted_at: null to
        // resurrect it in place (see goalsToRow).
        await supabase
          .from('user_goals')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', this.userId);
      } else if (table === 'documents') {
        await supabase
          .from('documents')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', this.userId)
          .eq('date', id);
      } else {
        await supabase
          .from(table)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id);
      }
    } catch (err: any) {
      console.warn(`[sync] Delete push failed for ${table}:${id}:`, err.message);
      // Don't mark dirty for deletes of items that may never have been synced
    }
  }

  // --------------------------------------------------------
  // Dirty tracking
  // --------------------------------------------------------

  private markDirty(table: SyncTable, id: string) {
    const dirty = loadDirty();
    if (!dirty[table].includes(id)) {
      dirty[table].push(id);
      saveDirty(dirty);
    }
  }

  // --------------------------------------------------------
  // Flush: retry dirty items
  // --------------------------------------------------------

  async flushDirty(): Promise<void> {
    if (!this.userId) return;
    // Verify once at top for standalone callers. `fullSync` already verified
    // before delegating; the redundant call is cheap and keeps this method
    // safe to call directly from outside.
    if (!(await this.verifyActiveSession())) return;

    await this.flushDirtyInternal();
  }

  /** Internal flush without session verification — caller must have verified. */
  private async flushDirtyInternal(): Promise<void> {
    const dirty = loadDirty();
    let anyFailed = false;
    const remaining: DirtySet = { ...EMPTY_DIRTY };

    for (const table of Object.keys(dirty) as SyncTable[]) {
      const ids = dirty[table];
      if (!ids.length) continue;

      // Process in batches
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        for (const id of batch) {
          try {
            await this.pushItem(table, id);
          } catch {
            anyFailed = true;
            remaining[table].push(id);
          }
        }
      }
    }

    saveDirty(remaining);
    if (anyFailed) {
      console.warn('[sync] Some dirty items failed to flush, will retry next sync');
    }
  }

  // --------------------------------------------------------
  // Pull: remote -> local
  // --------------------------------------------------------

  async pullAll(): Promise<void> {
    if (!this.userId) return;
    // Verify once at top for standalone callers. `fullSync` already verified
    // before delegating; the redundant call is cheap and keeps this method
    // safe to call directly from outside.
    if (!(await this.verifyActiveSession())) return;

    await this.pullAllInternal();
  }

  /** Internal pull without session verification — caller must have verified. */
  private async pullAllInternal(): Promise<void> {
    const lastPull = getLastPull();
    const pullTimestamp = new Date().toISOString();
    console.log('[diag][sync] pullAllInternal start', { userId: this.userId, lastPull });

    await Promise.all([
      this.pullEntries(lastPull),
      this.pullDocuments(lastPull),
      this.pullSavedEntries(lastPull),
      this.pullCustomMeals(lastPull),
      this.pullWeightEntries(lastPull),
      this.pullGoals(lastPull),
    ]);

    const s = useAppStore.getState();
    console.log('[diag][sync] pullAllInternal done', {
      entriesLen: s.entries.length,
      documentsLen: s.documents.length,
      weightEntriesLen: s.weightEntries.length,
      hasGoals: !!s.goals,
    });
    setLastPull(pullTimestamp);
  }

  private async pullEntries(since: string | null) {
    const userId = this.userId!;
    let query = supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true });
    if (since) query = query.gt('updated_at', since);

    const { data, error } = await query;
    if (error) { console.error('[sync] Pull food_entries failed:', error.message); return; }
    console.log('[diag][sync] pullEntries', { userId, since, rows: data?.length ?? 0 });
    if (!data?.length) return;

    const state = useAppStore.getState();
    const dirty = loadDirty();
    const localEntries = [...state.entries];
    let changed = false;

    for (const row of data) {
      const localIdx = localEntries.findIndex((e) => e.id === row.id);

      if (row.deleted_at) {
        // Remote was deleted — remove local
        if (localIdx !== -1) {
          localEntries.splice(localIdx, 1);
          changed = true;
        }
        continue;
      }

      if (localIdx !== -1) {
        // Exists locally — check if dirty (local wins) or remote is newer
        if (dirty.food_entries.includes(row.id)) continue; // local has unsynced changes, skip
        const localUpdated = new Date(localEntries[localIdx].updatedAt).getTime();
        const remoteUpdated = new Date(row.updated_at).getTime();
        if (remoteUpdated > localUpdated) {
          localEntries[localIdx] = rowToEntry(row);
          changed = true;
        }
      } else {
        // New remote entry
        localEntries.push(rowToEntry(row));
        changed = true;
      }
    }

    if (changed) {
      useAppStore.setState({ entries: localEntries });
    }
  }

  private async pullDocuments(since: string | null) {
    const userId = this.userId!;
    let query = supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('last_modified', { ascending: true });
    if (since) query = query.gt('last_modified', since);

    const { data, error } = await query;
    if (error) { console.error('[sync] Pull documents failed:', error.message); return; }
    console.log('[diag][sync] pullDocuments', { userId, since, rows: data?.length ?? 0 });
    if (!data?.length) return;

    const state = useAppStore.getState();
    const dirty = loadDirty();
    const localDocs = [...state.documents];
    let changed = false;

    for (const row of data) {
      const localIdx = localDocs.findIndex((d) => d.date === row.date);

      if (row.deleted_at) {
        if (localIdx !== -1) {
          localDocs.splice(localIdx, 1);
          changed = true;
        }
        continue;
      }

      if (localIdx !== -1) {
        if (dirty.documents.includes(row.date)) continue;
        const localModified = new Date(localDocs[localIdx].lastModified).getTime();
        const remoteModified = new Date(row.last_modified).getTime();
        const localEmpty = !localDocs[localIdx].content;
        const remoteHasContent = (row.content?.length ?? 0) > 0;
        if (remoteModified > localModified || (localEmpty && remoteHasContent)) {
          localDocs[localIdx] = rowToDoc(row);
          changed = true;
        }
      } else {
        localDocs.push(rowToDoc(row));
        changed = true;
      }
    }

    if (changed) {
      useAppStore.setState({ documents: localDocs });
    }
  }

  private async pullSavedEntries(since: string | null) {
    const userId = this.userId!;
    let query = supabase
      .from('saved_entries')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: true });
    if (since) query = query.gt('last_used_at', since);

    const { data, error } = await query;
    if (error) { console.error('[sync] Pull saved_entries failed:', error.message); return; }
    if (!data?.length) return;

    const state = useAppStore.getState();
    const dirty = loadDirty();
    const localSaved = [...state.savedEntries];
    let changed = false;

    for (const row of data) {
      const localIdx = localSaved.findIndex((s) => s.id === row.id);

      if (row.deleted_at) {
        if (localIdx !== -1) {
          localSaved.splice(localIdx, 1);
          changed = true;
        }
        continue;
      }

      if (localIdx !== -1) {
        if (dirty.saved_entries.includes(row.id)) continue;
        const localUsed = new Date(localSaved[localIdx].lastUsedAt).getTime();
        const remoteUsed = new Date(row.last_used_at).getTime();
        if (remoteUsed > localUsed) {
          localSaved[localIdx] = rowToSavedEntry(row);
          changed = true;
        }
      } else {
        localSaved.push(rowToSavedEntry(row));
        changed = true;
      }
    }

    if (changed) {
      useAppStore.setState({ savedEntries: localSaved });
    }
  }

  private async pullCustomMeals(since: string | null) {
    const userId = this.userId!;
    let query = supabase
      .from('custom_meals')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true });
    if (since) query = query.gt('updated_at', since);

    const { data, error } = await query;
    if (error) { console.error('[sync] Pull custom_meals failed:', error.message); return; }
    if (!data?.length) return;

    const state = useAppStore.getState();
    const dirty = loadDirty();
    const localMeals = [...state.customMeals];
    let changed = false;

    for (const row of data) {
      const localIdx = localMeals.findIndex((m) => m.id === row.id);

      if (row.deleted_at) {
        if (localIdx !== -1) {
          localMeals.splice(localIdx, 1);
          changed = true;
        }
        continue;
      }

      if (localIdx !== -1) {
        if (dirty.custom_meals.includes(row.id)) continue;
        const localUpdated = new Date(localMeals[localIdx].updatedAt).getTime();
        const remoteUpdated = new Date(row.updated_at).getTime();
        if (remoteUpdated > localUpdated) {
          localMeals[localIdx] = rowToCustomMeal(row);
          changed = true;
        }
      } else {
        localMeals.push(rowToCustomMeal(row));
        changed = true;
      }
    }

    if (changed) {
      useAppStore.setState({ customMeals: localMeals });
    }
  }

  private async pullWeightEntries(since: string | null) {
    const userId = this.userId!;
    let query = supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true });
    if (since) query = query.gt('updated_at', since);

    const { data, error } = await query;
    if (error) { console.error('[sync] Pull weight_entries failed:', error.message); return; }
    if (!data?.length) return;

    const state = useAppStore.getState();
    const dirty = loadDirty();
    const localWeight = [...state.weightEntries];
    let changed = false;

    for (const row of data) {
      const localIdx = localWeight.findIndex((w) => w.id === row.id);

      if (row.deleted_at) {
        if (localIdx !== -1) {
          localWeight.splice(localIdx, 1);
          changed = true;
        }
        continue;
      }

      if (localIdx !== -1) {
        // Exists locally — skip if dirty (local wins), otherwise update if remote is newer
        if (dirty.weight_entries.includes(row.id)) continue;
        const remoteUpdated = new Date(row.updated_at).getTime();
        const localCreated = new Date(localWeight[localIdx].createdAt).getTime();
        if (remoteUpdated > localCreated) {
          localWeight[localIdx] = rowToWeightEntry(row);
          changed = true;
        }
      } else {
        localWeight.push(rowToWeightEntry(row));
        changed = true;
      }
    }

    if (changed) {
      useAppStore.setState({ weightEntries: localWeight });

      // Pre-cache any storage-path photos from pulled entries (fire-and-forget)
      const allPhotos: string[] = [];
      for (const we of localWeight) {
        const photos = we.photoUris ?? (we.photoUri ? [we.photoUri] : []);
        allPhotos.push(...photos);
      }
      photoSyncService.ensureCached(allPhotos).catch(err =>
        console.warn('[sync] Photo pre-cache failed:', err.message)
      );
    }
  }

  private async pullGoals(since: string | null) {
    const userId = this.userId!;
    // user_goals is one row per user — always fetch it (no time filter).
    // Filtering by updated_at would conflate "no row" with "row not updated since",
    // causing local goals to be wrongly cleared on every incremental pull.
    const { data, error } = await supabase
      .from('user_goals')
      .select('*')
      .eq('user_id', userId);
    if (error) { console.error('[sync] Pull user_goals failed:', error.message); return; }

    if (!data?.length) {
      // Row genuinely doesn't exist on server. Clear local only after the first
      // sync — on cold start before any sync has run, local goals may simply not
      // have been pushed yet. Use the `since` snapshot captured by the caller
      // so a concurrent sync's setLastPull write can't flip this decision
      // mid-pull (which would corrupt local goals on race-y first sign-ins).
      if (since) {
        const state = useAppStore.getState();
        if (state.goals) {
          useAppStore.setState({ goals: null });
        }
      }
      return;
    }

    const row = data[0]; // One row per user
    const state = useAppStore.getState();

    // Tombstoned remote — clear local regardless of dirty state. Account
    // deletion (and a future explicit "reset goals" flow) is authoritative
    // server-side intent; signing back in with the same account, or a
    // second device coming online, must drop local goals so the onboarding
    // gate reopens. Mirrors the deleted_at branch in pullEntries /
    // pullDocuments / pullSavedEntries / pullCustomMeals / pullWeightEntries.
    if (row.deleted_at) {
      if (state.goals) {
        useAppStore.setState({ goals: null });
      }
      return;
    }

    const dirty = loadDirty();
    // If local goals are dirty, skip pull (local wins for non-deletes).
    if (dirty.user_goals.includes('current')) return;

    const remoteUpdated = new Date(row.updated_at).getTime();
    const localUpdated = state.goals ? new Date(state.goals.updatedAt).getTime() : 0;

    if (remoteUpdated > localUpdated) {
      const { goals, preferredUnits } = rowToGoals(row);
      useAppStore.setState({ goals, preferredUnits });
    }
  }

  // --------------------------------------------------------
  // Full sync (pull + flush)
  // --------------------------------------------------------

  async fullSync(): Promise<void> {
    console.log('[diag][sync] fullSync called', { userId: this.userId, alreadySyncing: this.syncing });
    if (!this.userId || this.syncing) return;
    // Single session verification for the entire sync — flushDirtyInternal /
    // pullAllInternal don't re-verify, so a 50-entry sync = 1 getUser() call.
    if (!(await this.verifyActiveSession())) {
      console.log('[diag][sync] fullSync aborted — session verification failed');
      return;
    }

    this.syncing = true;
    try {
      console.log('[sync] Starting full sync...');

      // First sync ever? Mark all local data as dirty so it gets pushed
      const lastPull = getLastPull();
      const dirtyBefore = loadDirty();
      console.log('[diag][sync] fullSync state before flush', {
        lastPull,
        dirtyFoodEntries: dirtyBefore.food_entries.length,
        dirtyDocuments: dirtyBefore.documents.length,
        dirtyWeights: dirtyBefore.weight_entries.length,
        dirtyGoals: dirtyBefore.user_goals.length,
        localEntries: useAppStore.getState().entries.length,
        localDocuments: useAppStore.getState().documents.length,
      });
      if (!lastPull) {
        console.log('[sync] First sync — marking all local data dirty');
        this.markAllLocalDirty();
      }

      // Flush dirty items first (push local changes)
      await this.flushDirtyInternal();

      // Then pull remote changes
      await this.pullAllInternal();

      console.log('[sync] Full sync complete');
    } catch (err: any) {
      console.error('[sync] Full sync failed:', err.message);
    } finally {
      this.syncing = false;
    }
  }

  /** Mark all existing local data as dirty for initial push */
  private markAllLocalDirty() {
    const state = useAppStore.getState();
    const dirty = loadDirty();

    for (const entry of state.entries) {
      if (entry.status !== 'pending' && !dirty.food_entries.includes(entry.id)) {
        dirty.food_entries.push(entry.id);
      }
    }
    for (const doc of state.documents) {
      if (!dirty.documents.includes(doc.date)) {
        dirty.documents.push(doc.date);
      }
    }
    for (const se of state.savedEntries) {
      if (!dirty.saved_entries.includes(se.id)) {
        dirty.saved_entries.push(se.id);
      }
    }
    for (const meal of state.customMeals) {
      if (!dirty.custom_meals.includes(meal.id)) {
        dirty.custom_meals.push(meal.id);
      }
    }
    for (const we of state.weightEntries) {
      if (!dirty.weight_entries.includes(we.id)) {
        dirty.weight_entries.push(we.id);
      }
    }
    if (state.goals && !dirty.user_goals.includes('current')) {
      dirty.user_goals.push('current');
    }

    saveDirty(dirty);
  }
}

export const syncService = new SyncService();
