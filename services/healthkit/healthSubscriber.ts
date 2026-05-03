import { useAppStore } from '@/store/app-store';
import { healthSyncService } from './healthSyncService';
import { Entry, WeightEntry } from '@/types';

let unsubscribe: (() => void) | null = null;

function weightChanged(a: WeightEntry, b: WeightEntry): boolean {
  return a.weightKg !== b.weightKg || a.date !== b.date || a.createdAt !== b.createdAt;
}

export function startHealthSubscriber() {
  if (unsubscribe) return;

  unsubscribe = useAppStore.subscribe((state, prev) => {
    let changed = false;

    // --- Entries ---
    if (state.entries !== prev.entries) {
      const prevById = new Map(prev.entries.map((e: Entry) => [e.id, e]));
      const currById = new Map(state.entries.map((e: Entry) => [e.id, e]));

      for (const [id, entry] of currById) {
        const before = prevById.get(id);
        if (!before || entry.updatedAt !== before.updatedAt || entry.status !== before.status) {
          healthSyncService.markHealthDirty('food_entries', id);
          changed = true;
        }
      }
      for (const id of prevById.keys()) {
        if (!currById.has(id)) {
          healthSyncService.markHealthDeleted('food_entries', id);
          changed = true;
        }
      }
    }

    // --- Weight entries ---
    if (state.weightEntries !== prev.weightEntries) {
      const prevById = new Map(prev.weightEntries.map((w: WeightEntry) => [w.id, w]));
      const currById = new Map(state.weightEntries.map((w: WeightEntry) => [w.id, w]));

      for (const [id, w] of currById) {
        const before = prevById.get(id);
        if (!before || weightChanged(w, before)) {
          healthSyncService.markHealthDirty('weight_entries', id);
          changed = true;
        }
      }
      for (const id of prevById.keys()) {
        if (!currById.has(id)) {
          healthSyncService.markHealthDeleted('weight_entries', id);
          changed = true;
        }
      }
    }

    if (changed) healthSyncService.scheduleFlush();
  });
}

export function stopHealthSubscriber() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
