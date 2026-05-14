import {
  resolveNutrition,
  NutritionRateLimitError,
  NutritionEntitlementRequiredError,
} from '@/services/nutritionApi';
import { triggerSubscriptionReconcile } from '@/services/subscriptionReconcile';
import { NutritionResolveResponse } from '@/types';

const MAX_CONCURRENT = 3;

// Injected by SubscriptionContext on mount. Lets the queue distinguish a
// genuine non-Pro 403 ("show the paywall, stop trying") from a race-window
// 403 ("client says Pro, server hasn't caught up yet — try reconcile") without
// importing the app-store (which would create a circular dep, since the store
// imports nutritionQueue).
let isProGetter: (() => boolean) | null = null;
export function setIsProGetter(fn: (() => boolean) | null): void {
  isProGetter = fn;
}

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
  // When non-zero, the queue is paused until this timestamp (ms since epoch).
  // Set when the edge function returns 429 so we don't burn the cooldown
  // window with retries for queued items the server will just reject anyway.
  private pausedUntil = 0;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  // Set when the edge function returns 403 entitlement_required. Stays sticky
  // until the SubscriptionContext clears it on a Pro purchase / restore,
  // because re-hitting the server every entry while the user is non-Pro is
  // wasted load. `clearEntitlementBlock()` flips this back off.
  private entitlementBlocked = false;

  enqueue(item: QueueItem) {
    // Already in cooldown? Don't bother hitting the server — fail immediately
    // with the same rate-limit error so the entry gets its "limit reached"
    // badge right away instead of sitting in 'pending' for up to an hour.
    if (Date.now() < this.pausedUntil) {
      const cooldownLeft = Math.ceil((this.pausedUntil - Date.now()) / 1000);
      const reason = cooldownLeft > 120 ? 'day_limit' : 'minute_limit';
      const message = reason === 'day_limit'
        ? 'Daily AI limit reached. Try again tomorrow.'
        : "You're moving too fast — wait a minute before trying again.";
      item.onError(
        new NutritionRateLimitError(message, {
          reason,
          retryAfterSeconds: cooldownLeft,
        }),
      );
      return;
    }
    if (this.entitlementBlocked) {
      item.onError(new NutritionEntitlementRequiredError());
      return;
    }
    this.queue.push(item);
    this.drain();
  }

  /** Called by SubscriptionContext when the user's Pro entitlement is granted
   * (on purchase, restore, or cold-start hydration). Re-opens the queue. */
  clearEntitlementBlock() {
    this.entitlementBlocked = false;
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

  /** Clear all queued items and reset rate-limit / entitlement state. In-flight
   *  requests are safe — isEntryDeleted() handles them. Called on sign-out and
   *  account deletion so the next signed-in user starts with a clean slate. */
  clearAll() {
    this.queue = [];
    this.pausedUntil = 0;
    this.entitlementBlocked = false;
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  private drain() {
    const now = Date.now();
    if (now < this.pausedUntil) {
      if (!this.resumeTimer) {
        const delay = this.pausedUntil - now + 50;
        this.resumeTimer = setTimeout(() => {
          this.resumeTimer = null;
          this.drain();
        }, delay);
      }
      return;
    }

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
      if (err instanceof NutritionRateLimitError) {
        const cooldownMs = err.retryAfterSeconds * 1000;
        this.pausedUntil = Math.max(this.pausedUntil, Date.now() + cooldownMs);
        console.warn(
          `[queue] rate limited (${err.reason ?? 'unknown'}), pausing ${err.retryAfterSeconds}s`,
        );

        // Fail every item already queued behind us with the same error so
        // they show the limit badge immediately instead of being stuck in
        // 'pending' for the entire cooldown window.
        const queued = this.queue.splice(0);
        for (const q of queued) {
          if (!q.isEntryDeleted()) q.onError(err);
        }
      } else if (err instanceof NutritionEntitlementRequiredError) {
        // Race recovery path: the client may know the user just purchased Pro
        // even though the server's `subscriptions` row hasn't landed yet
        // (webhook delay or delivery failure). If clientIsPro=true we push
        // the row server-side via reconcile and retry the entry. Only when
        // the user is genuinely non-Pro (or recovery itself returns 403) do
        // we fall through to the sticky block.
        const clientIsPro = isProGetter ? isProGetter() : false;
        if (clientIsPro) {
          const recovered = await this.tryReconcileAndRetry(item);
          if (recovered) return; // success — skip onError + sticky-block
        }

        // Confirmed non-Pro (or recovery couldn't restore Pro). Block further
        // server hits until SubscriptionContext clears the flag on
        // purchase/restore. Drain the queue with the same error so every
        // pending entry shows "Upgrade required" right away.
        this.entitlementBlocked = true;
        console.warn('[queue] entitlement required, blocking until upgrade');
        const queued = this.queue.splice(0);
        for (const q of queued) {
          if (!q.isEntryDeleted()) q.onError(err);
        }
      }

      if (!item.isEntryDeleted()) {
        item.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.active.delete(item.entryId);
      console.log(`[queue] DONE "${item.textLine}" | active=${this.active.size} queued=${this.queue.length}`);
      this.drain();
    }
  }

  /** Race recovery: client says Pro but server returned 403. Push the row
   *  server-side via reconcile, then retry the entry. Returns true if the
   *  retry succeeded (caller should skip its onError). On any failure
   *  (reconcile error, retry 403, retry network error) returns false so the
   *  caller falls through to the sticky-block + onError path. */
  private async tryReconcileAndRetry(item: QueueItem): Promise<boolean> {
    console.warn('[queue] entitlement race — reconciling and retrying once');
    const reconciled = await triggerSubscriptionReconcile();
    if (!reconciled) return false;
    if (item.isEntryDeleted()) return true; // entry gone, nothing to retry
    try {
      const data = await resolveNutrition(item.textLine, {
        userId: item.userId,
      });
      if (!item.isEntryDeleted()) item.onResolved(data);
      return true;
    } catch (e) {
      console.warn('[queue] retry after reconcile failed', e);
      return false;
    }
  }
}

export const nutritionQueue = new NutritionQueue();
