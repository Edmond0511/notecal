import { createMMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { StateStorage } from 'zustand/middleware';

const ENC_KEY_ID = 'notecal-mmkv-enc-key';
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Returns a 16-byte ASCII-safe encryption key for MMKV, persisted in the device
 * keychain (`expo-secure-store`). MMKV's max key length is 16 bytes, so we
 * encode 16 random bytes via base64 and slice to 16 ASCII characters (still
 * 16 bytes, ~96 bits of entropy — strong enough for symmetric file encryption
 * given that the key never leaves the secure enclave).
 */
function getOrCreateEncryptionKey(): string {
  let key = SecureStore.getItem(ENC_KEY_ID, SECURE_OPTS);
  if (!key) {
    const bytes = Crypto.getRandomBytes(16);
    // Base64 encode (yields ~24 chars including padding for 16 bytes), then
    // slice back to 16 ASCII chars to satisfy MMKV's 16-byte cap while keeping
    // the key URL-/storage-safe.
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 =
      typeof globalThis.btoa === 'function'
        ? globalThis.btoa(binary)
        : Buffer.from(bytes).toString('base64');
    key = b64.slice(0, 16);
    SecureStore.setItem(ENC_KEY_ID, key, SECURE_OPTS);
  }
  return key;
}

export const mmkv = createMMKV({
  id: 'note-cal',
  encryptionKey: getOrCreateEncryptionKey(),
});

// Zustand StateStorage adapter (synchronous)
export const mmkvStateStorage: StateStorage = {
  setItem: (name, value) => mmkv.set(name, value),
  getItem: (name) => mmkv.getString(name) ?? null,
  removeItem: (name) => mmkv.remove(name),
};

/**
 * Supabase auth storage. Lives in expo-secure-store (Keychain / Keystore), NOT
 * MMKV — refresh tokens grant device-permanent account access and must stay
 * out of any backup-eligible plaintext store.
 */
export const secureSupabaseStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, SECURE_OPTS),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, SECURE_OPTS),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, SECURE_OPTS),
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
