import { createMMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

export const mmkv = createMMKV({ id: 'note-cal' });

// Zustand StateStorage adapter (synchronous)
export const mmkvStateStorage: StateStorage = {
  setItem: (name, value) => mmkv.set(name, value),
  getItem: (name) => mmkv.getString(name) ?? null,
  removeItem: (name) => mmkv.remove(name),
};

// Supabase auth adapter (needs getItem/setItem/removeItem interface)
export const mmkvSupabaseStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.remove(key),
};

// Canonical keys used by Zustand persistence and sync service
const CANONICAL_KEYS = {
  storage: 'note-cal-storage',
  dirty: 'sync-dirty',
  pull: 'sync-last-pull',
} as const;

function snapshotKeys(userId: string) {
  return {
    storage: `user-snapshot:${userId}`,
    dirty: `user-sync-dirty:${userId}`,
    pull: `user-sync-pull:${userId}`,
  };
}

/** Archive the active user's MMKV state under user-prefixed keys. */
export function saveUserSnapshot(userId: string) {
  const snap = snapshotKeys(userId);
  for (const k of Object.keys(CANONICAL_KEYS) as (keyof typeof CANONICAL_KEYS)[]) {
    const val = mmkv.getString(CANONICAL_KEYS[k]);
    if (val !== undefined) {
      mmkv.set(snap[k], val);
    }
  }
}

/** Restore a user's snapshot back to the canonical keys. Returns false if no snapshot exists. */
export function restoreUserSnapshot(userId: string): boolean {
  const snap = snapshotKeys(userId);
  if (mmkv.getString(snap.storage) === undefined) return false;
  for (const k of Object.keys(CANONICAL_KEYS) as (keyof typeof CANONICAL_KEYS)[]) {
    const val = mmkv.getString(snap[k]);
    if (val !== undefined) {
      mmkv.set(CANONICAL_KEYS[k], val);
    }
  }
  return true;
}
