import { resolveNutrition } from '@/services/nutritionApi';
import { NutritionResolveResponse } from '@/types';

const MAX_CONCURRENT = 3;

export interface QueueItem {
  entryId: string;
  rawText: string;   // full line including "- " prefix
  textLine: string;   // food text after stripping marker
  userId?: string;    // pre-fetched from supabase auth
  onResolved: (data: NutritionResolveResponse) => void;
  onError: (error: Error) => void;
  isEntryDeleted: () => boolean;
}

class NutritionQueue {
  private queue: QueueItem[] = [];
  private active = new Map<string, QueueItem>();

  enqueue(item: QueueItem) {
    this.queue.push(item);
    this.drain();
  }

  /** Check if a rawText is already queued or in-flight */
  has(rawText: string): boolean {
    if (this.queue.some((q) => q.rawText === rawText)) return true;
    for (const item of this.active.values()) {
      if (item.rawText === rawText) return true;
    }
    return false;
  }

  /** Check if an entryId is already queued or in-flight */
  hasById(entryId: string): boolean {
    if (this.queue.some((q) => q.entryId === entryId)) return true;
    return this.active.has(entryId);
  }

  /** Remove a queued item by entryId (no-op if already in-flight) */
  cancel(entryId: string) {
    this.queue = this.queue.filter((q) => q.entryId !== entryId);
  }

  /** Clear all queued items (in-flight requests are safe — isEntryDeleted() handles them) */
  clearAll() {
    this.queue = [];
  }

  private drain() {
    while (this.active.size < MAX_CONCURRENT && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.active.set(item.entryId, item);
      console.log(`[queue] START "${item.textLine}" | active=${this.active.size} queued=${this.queue.length}`);
      this.executeItem(item);
    }
  }

  private async executeItem(item: QueueItem) {
    try {
      // Skip if entry was deleted while waiting in queue
      if (item.isEntryDeleted()) return;

      const data = await resolveNutrition(item.textLine, {
        userId: item.userId,
      });

      // Skip callback if entry was deleted mid-flight
      if (!item.isEntryDeleted()) {
        item.onResolved(data);
      }
    } catch (err) {
      if (!item.isEntryDeleted()) {
        item.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.active.delete(item.entryId);
      console.log(`[queue] DONE "${item.textLine}" | active=${this.active.size} queued=${this.queue.length}`);
      this.drain();
    }
  }
}

export const nutritionQueue = new NutritionQueue();
