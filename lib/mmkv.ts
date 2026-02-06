import { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

export const mmkv = new MMKV({ id: 'note-cal' });

// Zustand StateStorage adapter (synchronous)
export const mmkvStateStorage: StateStorage = {
  setItem: (name, value) => mmkv.set(name, value),
  getItem: (name) => mmkv.getString(name) ?? null,
  removeItem: (name) => mmkv.delete(name),
};

// Supabase auth adapter (needs getItem/setItem/removeItem interface)
export const mmkvSupabaseStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.delete(key),
};
