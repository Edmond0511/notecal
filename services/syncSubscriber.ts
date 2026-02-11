import { useAppStore } from '@/store/app-store';
import { syncService } from '@/services/syncService';
import { Entry, Document, SavedEntry, WeightEntry } from '@/types';

let unsubscribe: (() => void) | null = null;

export function startSyncSubscriber() {
  if (unsubscribe) return; // already running

  unsubscribe = useAppStore.subscribe((state, prevState) => {
    // --- Entries ---
    if (state.entries !== prevState.entries) {
      const prevIds = new Set(prevState.entries.map((e: Entry) => e.id));
      const currIds = new Set(state.entries.map((e: Entry) => e.id));

      // Detect adds/changes
      for (const entry of state.entries) {
        const prev = prevState.entries.find((e: Entry) => e.id === entry.id);
        if (!prev || entry.updatedAt !== prev.updatedAt) {
          syncService.debouncedPush('food_entries', entry.id);
        }
      }

      // Detect deletes
      for (const id of prevIds) {
        if (!currIds.has(id)) {
          syncService.pushDelete('food_entries', id);
        }
      }
    }

    // --- Documents ---
    if (state.documents !== prevState.documents) {
      const prevDates = new Set(prevState.documents.map((d: Document) => d.date));
      const currDates = new Set(state.documents.map((d: Document) => d.date));

      for (const doc of state.documents) {
        const prev = prevState.documents.find((d: Document) => d.date === doc.date);
        if (!prev || doc.lastModified !== prev.lastModified) {
          syncService.debouncedPush('documents', doc.date);
        }
      }

      for (const date of prevDates) {
        if (!currDates.has(date)) {
          syncService.pushDelete('documents', date);
        }
      }
    }

    // --- Saved Entries ---
    if (state.savedEntries !== prevState.savedEntries) {
      const prevIds = new Set(prevState.savedEntries.map((s: SavedEntry) => s.id));
      const currIds = new Set(state.savedEntries.map((s: SavedEntry) => s.id));

      for (const se of state.savedEntries) {
        const prev = prevState.savedEntries.find((s: SavedEntry) => s.id === se.id);
        if (!prev || se.lastUsedAt !== prev.lastUsedAt || se.usageCount !== prev.usageCount) {
          syncService.debouncedPush('saved_entries', se.id);
        }
      }

      for (const id of prevIds) {
        if (!currIds.has(id)) {
          syncService.pushDelete('saved_entries', id);
        }
      }
    }

    // --- Weight Entries ---
    if (state.weightEntries !== prevState.weightEntries) {
      const prevIds = new Set(prevState.weightEntries.map((w: WeightEntry) => w.id));
      const currIds = new Set(state.weightEntries.map((w: WeightEntry) => w.id));

      for (const we of state.weightEntries) {
        if (!prevIds.has(we.id)) {
          syncService.debouncedPush('weight_entries', we.id);
        }
      }

      for (const id of prevIds) {
        if (!currIds.has(id)) {
          syncService.pushDelete('weight_entries', id);
        }
      }
    }
  });
}

export function stopSyncSubscriber() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
