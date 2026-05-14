import { supabase } from '@/lib/supabase';

/** Push the server's `subscriptions` row in sync with RC's REST API truth.
 *
 *  Why this exists: RC's webhook is the primary path for populating
 *  `subscriptions`, but it has real failure modes (delivery delay, signature
 *  mismatch, edge outage, anonymous app_user_id at purchase time). When the
 *  webhook lags or fails, the RC SDK on-device still reports the user as Pro
 *  — so the client thinks Pro while every server AI call 403s on
 *  `entitlement_required`. The reconcile edge function queries RC's REST API
 *  server-side and upserts the row, fixing the split.
 *
 *  Idempotent and fail-safe: returns true if reconcile completed without
 *  network error, false otherwise. The edge function itself returns 200 even
 *  when the user has no Pro entitlement (it just writes 'expired' or skips),
 *  so a true return doesn't mean "user is Pro" — only "server now reflects
 *  RC's REST API state."
 *
 *  Call sites:
 *    - SubscriptionContext.purchase: closes the post-purchase race window
 *    - SubscriptionContext.restore: closes the post-restore race window
 *    - SubscriptionContext auth-sync: cold-start safety net
 *    - nutritionQueue 403 handler: in-flight recovery for the race */
export async function triggerSubscriptionReconcile(): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('subscription-reconcile', {
      method: 'POST',
      body: {},
    });
    if (error) {
      console.error('[subscriptionReconcile] failed', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[subscriptionReconcile] threw', e);
    return false;
  }
}
