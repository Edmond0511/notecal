import { useRef } from 'react';
import { useAppStore } from './app-store';
import type { Entry } from '@/types';

// ---------------------------------------------------------------------------
// entriesByDate — a module-level index kept in sync with the store via
// subscribe().  Lookups are O(1) instead of O(n) filter scans.
// ---------------------------------------------------------------------------

let _entriesByDate: Map<string, Entry[]> = new Map();
let _lastEntries: Entry[] | null = null;

function rebuildIndex(entries: Entry[]) {
  // Skip if the reference hasn't changed (same array object).
  if (entries === _lastEntries) return _entriesByDate;
  _lastEntries = entries;

  const map = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = map.get(entry.date);
    if (list) {
      list.push(entry);
    } else {
      map.set(entry.date, [entry]);
    }
  }
  _entriesByDate = map;
  return map;
}

// Build initial index from current state.
rebuildIndex(useAppStore.getState().entries);

// Re-index whenever entries change.
useAppStore.subscribe(
  (state) => {
    rebuildIndex(state.entries);
  },
);

/** O(1) lookup — returns the cached array or empty. */
export function getEntriesForDate(date: string): Entry[] {
  return _entriesByDate.get(date) ?? _empty;
}
const _empty: Entry[] = [];

// ---------------------------------------------------------------------------
// useEntriesForDate — a hook that subscribes to only the entries for one date.
// Uses the index internally so the selector is O(1), and useShallow-style
// reference comparison ensures the component only re-renders when the actual
// entries for that date change.
// ---------------------------------------------------------------------------

export function useEntriesForDate(date: string): Entry[] {
  const prevRef = useRef<Entry[]>(_empty);

  return useAppStore((state) => {
    // Ensure index is up-to-date (subscribe fires async, selector fires sync)
    if (state.entries !== _lastEntries) {
      rebuildIndex(state.entries);
    }
    const entries = _entriesByDate.get(date) ?? _empty;

    // Shallow array comparison — avoid re-render if same entries by reference
    const prev = prevRef.current;
    if (
      prev.length === entries.length &&
      prev.every((e, i) => e === entries[i])
    ) {
      return prev;
    }
    prevRef.current = entries;
    return entries;
  });
}
