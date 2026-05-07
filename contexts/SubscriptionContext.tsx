import { useAuth } from '@/contexts/AuthContext';
import {
  configurePurchases,
  customerInfoIsPro,
  getCurrentOffering,
  getCustomerInfo,
  logInPurchases,
  logOutPurchases,
  purchasePackage as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
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
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

interface SubscriptionContextType {
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  /** Force a refresh of customerInfo from the RC servers. */
  refresh: () => Promise<void>;
  /** Restore prior purchases (Apple ID-bound). */
  restore: () => Promise<boolean>;
  /** Purchase a package; returns true on success, false on user cancel. */
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  isPro: false,
  customerInfo: null,
  offering: null,
  refresh: async () => {},
  restore: async () => false,
  purchase: async () => false,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
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
    }
    wasProRef.current = isPro;
  }, [isPro]);

  // Cold-start hydration: pull the current offering + cached customerInfo so
  // the paywall has data on first render and we don't briefly flash isPro=false
  // for a returning Pro user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [info, off] = await Promise.all([getCustomerInfo(), getCurrentOffering()]);
      if (cancelled) return;
      if (info) setCustomerInfo(info);
      if (off) setOffering(off);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync RC identity to the auth user. AuthContext also calls logIn after
  // SIGNED_IN, but its call races with our cold-start getCustomerInfo —
  // when getCustomerInfo wins, customerInfo gets stuck on the anonymous
  // (entitlement-free) result and isPro stays false even though the user
  // is subscribed. We call logIn here ourselves and use its returned
  // customerInfo as the authoritative source, which closes the race and
  // is idempotent (RC dedupes when the userId is unchanged).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = user?.id ?? null;
      const info = userId
        ? await logInPurchases(userId)
        : await (async () => {
            await logOutPurchases();
            return getCustomerInfo();
          })();
      if (cancelled) return;
      if (info) setCustomerInfo(info);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const refresh = useCallback(async () => {
    const info = await getCustomerInfo();
    if (info) setCustomerInfo(info);
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
    refresh,
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
