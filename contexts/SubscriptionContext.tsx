import { useAuth } from '@/contexts/AuthContext';
import {
  checkYearlyTrialEligibility,
  configurePurchases,
  customerInfoIsPro,
  getCustomerInfo,
  logInPurchases,
  logOutPurchases,
  PRO_ENTITLEMENT,
  purchasePackage as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
  tryGetCurrentOffering,
} from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';
import { nutritionQueue } from '@/services/nutritionQueue';
import { useAppStore } from '@/store/app-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState as RNAppState, AppStateStatus } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

interface SubscriptionContextType {
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  /** True when the most recent offering fetch failed (network down, RC
   *  unreachable, etc). Paywall uses this to render a Retry state instead of
   *  a spinner. */
  offeringError: boolean;
  /** Whether THIS Apple ID is eligible for the yearly product's free trial.
   *  `null` while the check is in-flight or before it has run; the paywall
   *  treats null as "do not promise a trial" (fail closed). RC's offering
   *  always includes `introPrice` when the product has one configured, so
   *  this explicit check is the only source of truth for eligibility. */
  yearlyTrialEligible: boolean | null;
  /** Force a refresh of customerInfo from the RC servers. */
  refresh: () => Promise<void>;
  /** Re-attempt the offering fetch. Called from the paywall's Retry button. */
  refreshOffering: () => Promise<void>;
  /** Restore prior purchases (Apple ID-bound). */
  restore: () => Promise<boolean>;
  /** Purchase a package; returns true on success, false on user cancel. */
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  isPro: false,
  customerInfo: null,
  offering: null,
  offeringError: false,
  yearlyTrialEligible: null,
  refresh: async () => {},
  refreshOffering: async () => {},
  restore: async () => false,
  purchase: async () => false,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  // True iff the most recent offering fetch attempt threw. Lets the paywall
  // distinguish "still loading" from "failed to load."
  const [offeringError, setOfferingError] = useState(false);
  // Apple-level trial eligibility for the yearly product. Null while we
  // haven't checked yet or the check is in-flight; the paywall must treat
  // null as "do not promise a trial." See SubscriptionContextType for why
  // this can't be derived from the offering alone.
  const [yearlyTrialEligible, setYearlyTrialEligible] = useState<boolean | null>(
    null,
  );
  // Track previous isPro so we only fire side effects (clearing the queue
  // entitlement block) on the false→true transition, not every customerInfo
  // update.
  const wasProRef = useRef(false);

  const isPro = customerInfoIsPro(customerInfo);

  // One-time RC SDK init. Safe to call from inside a provider; the helper
  // self-deduplicates.
  useEffect(() => {
    configurePurchases();
  }, []);

  // Subscribe to customerInfo updates (purchases, renewals, restores, expiries).
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Mirror isPro into the Zustand store so the store can gate addEntry calls
  // synchronously without a context lookup. Also re-opens the nutrition queue
  // on the false→true transition (the queue's entitlement block is sticky
  // by design so we don't burn server quota on doomed requests).
  useEffect(() => {
    useAppStore.getState().setIsPro(isPro);
    if (isPro && !wasProRef.current) {
      nutritionQueue.clearEntitlementBlock();
      useAppStore.getState().retryEntitlementBlockedEntries();
    }
    wasProRef.current = isPro;
  }, [isPro]);

  // Reset the prior-isPro tracker on user switch. Without this, if user A
  // (Pro) signs out and user B (free) signs in, `wasProRef.current` stays
  // `true` from A's session — and if B is also Pro, the false→true edge that
  // triggers `retryEntitlementBlockedEntries` never fires for B.
  useEffect(() => {
    wasProRef.current = false;
  }, [user?.id]);

  // Cold-start hydration: pull the current offering + cached customerInfo so
  // the paywall has data on first render and we don't briefly flash isPro=false
  // for a returning Pro user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [info, offResult] = await Promise.all([
        getCustomerInfo(),
        tryGetCurrentOffering(),
      ]);
      if (cancelled) return;
      if (info) setCustomerInfo(info);
      if (offResult.offering) setOffering(offResult.offering);
      setOfferingError(offResult.error);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-check trial eligibility whenever the offering changes. We refetch the
  // offering after login/restore/purchase, so this effect transitively keeps
  // eligibility in sync with the current Apple ID's intro-offer history. Set
  // back to null while a fresh check is pending so the paywall doesn't show a
  // stale "Try free" CTA mid-recompute.
  useEffect(() => {
    if (!offering) {
      setYearlyTrialEligible(null);
      return;
    }
    let cancelled = false;
    setYearlyTrialEligible(null);
    (async () => {
      const eligible = await checkYearlyTrialEligibility();
      if (cancelled) return;
      setYearlyTrialEligible(eligible);
    })();
    return () => {
      cancelled = true;
    };
  }, [offering]);

  // On foreground:
  // 1. Always refresh customerInfo. Catches the "trial/sub expired while the
  //    app was backgrounded" path so isPro flips before the user taps anything,
  //    and absorbs cases where the scheduled-refresh timer was killed by the OS
  //    suspending the JS runtime.
  // 2. Retry the offering fetch if the previous attempt errored and we still
  //    don't have an offering. Covers the "opened offline, then turned network
  //    back on" path without making them tap Retry themselves.
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status !== 'active') return;
      (async () => {
        const info = await getCustomerInfo();
        if (info) setCustomerInfo(info);
      })();
      if (offeringError && !offering) {
        (async () => {
          const result = await tryGetCurrentOffering();
          if (result.offering) setOffering(result.offering);
          setOfferingError(result.error);
        })();
      }
    };
    const sub = RNAppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [offeringError, offering]);

  // Sync RC identity to the auth user. AuthContext also calls logIn after
  // SIGNED_IN, but its call races with our cold-start getCustomerInfo —
  // when getCustomerInfo wins, customerInfo gets stuck on the anonymous
  // (entitlement-free) result and isPro stays false even though the user
  // is subscribed. We call logIn here ourselves and use its returned
  // customerInfo as the authoritative source, which closes the race and
  // is idempotent (RC dedupes when the userId is unchanged).
  // Wait for AuthContext to resolve the persisted session first so we
  // don't do a wasteful logOut→logIn cycle while user is still null.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const userId = user?.id ?? null;
      let info = userId
        ? await logInPurchases(userId)
        : await (async () => {
            await logOutPurchases();
            return getCustomerInfo();
          })();

      // Defensive receipt resync. RC's logIn returns server-cached
      // customerInfo, which can lag behind StoreKit on cold start (most
      // visibly in the sandbox: the receipt sits on the device but RC's
      // server cache hasn't been refreshed via webhook). Calling restore
      // forces RC to re-validate the StoreKit receipt with Apple and
      // updates the entitlement record, fixing the "paywall shows for a
      // subscribed user until they tap purchase again" bug. Also covers
      // the RC-unreachable case: logIn returns null on network failure,
      // so a Pro user would otherwise stay stranded on the paywall —
      // restore retries, and as a last resort we fall back to
      // getCustomerInfo() which reads RC's local cache. Only run when
      // we have a userId (anonymous restore can't bind to anyone) and
      // when info is null or reports no Pro entitlement (skip the cost
      // for users who are already correctly identified as Pro).
      if (userId && (!info || !customerInfoIsPro(info))) {
        const restored = await rcRestorePurchases();
        if (restored) info = restored;
        else if (!info) info = await getCustomerInfo();
      }

      if (cancelled) return;
      if (info) setCustomerInfo(info);

      // RC computes `introPrice` (trial eligibility) per App User ID. The
      // cold-start hydration fetched the offering against the anonymous RC
      // identity — which is always trial-eligible. After `logInPurchases`
      // switches identity to the real user, that cached offering is stale:
      // a returning user who already redeemed their trial would briefly see
      // "Try free for 3 days" until the next AppState=active retry. Refetch
      // here so the paywall reflects this user's true eligibility.
      const offResult = await tryGetCurrentOffering();
      if (cancelled) return;
      if (offResult.offering) setOffering(offResult.offering);
      setOfferingError(offResult.error);

      // Reconcile-on-login safety net: if RC says we're Pro but the
      // `subscriptions` row hasn't been written yet (webhook failure, signup
      // race, cross-device edge case), server-side AI calls will 403 even
      // though the client UI shows Pro. The `subscription-reconcile` edge
      // function queries RC's REST API server-side as truth and upserts the
      // row if missing — fully idempotent, so safe to fire blindly. Only
      // runs when the client believes the user is Pro AND is signed in;
      // there's no point reconciling for free users or anonymous identities.
      // Fire-and-forget: this is a nudge, not a hot path — the webhook and
      // server-side entitlement check remain the source of truth.
      if (userId && customerInfoIsPro(info)) {
        if (cancelled) return;
        supabase.functions
          .invoke('subscription-reconcile', { method: 'POST', body: {} })
          .catch((err) => {
            console.error('[subscription] reconcile failed', err);
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const refresh = useCallback(async () => {
    const info = await getCustomerInfo();
    if (info) setCustomerInfo(info);
  }, []);

  // Force a customerInfo refresh ~5s after the active 'pro' entitlement's
  // expirationDate. RC's SDK polls customerInfo on its own cadence, so without
  // this nudge the app can sit on stale "Pro" state for minutes after a
  // trial/sub actually ends. Reschedules whenever customerInfo changes.
  // Skipped when the expiration is more than ~7 days out: setTimeout becomes
  // unreliable past ~24 days (Int32 wrap), and the foreground refresh handles
  // long-lived subs reliably anyway.
  useEffect(() => {
    const ent = customerInfo?.entitlements.active[PRO_ENTITLEMENT];
    if (!ent?.expirationDate) return;
    const expiresMs = Date.parse(ent.expirationDate);
    if (!Number.isFinite(expiresMs)) return;
    const delay = expiresMs - Date.now() + 5_000;
    if (delay <= 0) {
      void refresh();
      return;
    }
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (delay > SEVEN_DAYS_MS) return;
    const timer = setTimeout(() => {
      void refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [customerInfo, refresh]);

  const refreshOffering = useCallback(async () => {
    const result = await tryGetCurrentOffering();
    if (result.offering) setOffering(result.offering);
    setOfferingError(result.error);
  }, []);

  const restore = useCallback(async () => {
    const info = await rcRestorePurchases();
    if (info) {
      setCustomerInfo(info);
      // Restore may have changed RC's view of trial eligibility (e.g. user
      // restored an account that already consumed its trial). Refresh the
      // offering so a subsequent paywall view doesn't promise a free trial.
      const offResult = await tryGetCurrentOffering();
      if (offResult.offering) setOffering(offResult.offering);
      setOfferingError(offResult.error);
      return customerInfoIsPro(info);
    }
    return false;
  }, []);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    const info = await rcPurchasePackage(pkg);
    if (!info) return false; // user cancelled
    setCustomerInfo(info);
    // A successful purchase that doesn't grant Pro (edge case: tier change,
    // promo) still consumes any trial offer. Refresh offering so paywall
    // re-renders without stale "free trial" copy.
    const offResult = await tryGetCurrentOffering();
    if (offResult.offering) setOffering(offResult.offering);
    setOfferingError(offResult.error);
    return customerInfoIsPro(info);
  }, []);

  const value: SubscriptionContextType = {
    isPro,
    customerInfo,
    offering,
    offeringError,
    yearlyTrialEligible,
    refresh,
    refreshOffering,
    restore,
    purchase,
  };

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
