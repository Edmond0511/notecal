import { useAuth } from '@/contexts/AuthContext';
import {
  configurePurchases,
  customerInfoIsPro,
  getCustomerInfo,
  logInPurchases,
  logOutPurchases,
  purchasePackage as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
  tryGetCurrentOffering,
} from '@/lib/revenuecat';
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

  // Retry the offering fetch when the app returns to the foreground if the
  // previous attempt errored and we still don't have an offering. Covers the
  // "user opened the app offline, then turned the network back on" path
  // without making them tap Retry themselves.
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status !== 'active') return;
      if (!offeringError) return;
      if (offering) return;
      (async () => {
        const result = await tryGetCurrentOffering();
        if (result.offering) setOffering(result.offering);
        setOfferingError(result.error);
      })();
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
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  const refresh = useCallback(async () => {
    const info = await getCustomerInfo();
    if (info) setCustomerInfo(info);
  }, []);

  const refreshOffering = useCallback(async () => {
    const result = await tryGetCurrentOffering();
    if (result.offering) setOffering(result.offering);
    setOfferingError(result.error);
  }, []);

  const restore = useCallback(async () => {
    const info = await rcRestorePurchases();
    if (info) {
      setCustomerInfo(info);
      return customerInfoIsPro(info);
    }
    return false;
  }, []);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    const info = await rcPurchasePackage(pkg);
    if (!info) return false; // user cancelled
    setCustomerInfo(info);
    return customerInfoIsPro(info);
  }, []);

  const value: SubscriptionContextType = {
    isPro,
    customerInfo,
    offering,
    offeringError,
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
