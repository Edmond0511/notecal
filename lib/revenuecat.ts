import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

// Single entitlement covers all SKUs (yearly, monthly, lifetime). Defined in
// RevenueCat dashboard. Update both places if renamed.
export const PRO_ENTITLEMENT = 'pro';

// Product IDs — must match App Store Connect exactly. Trial length is
// configured on the introductory offer attached to the yearly product, not
// here.
export const PRODUCT_IDS = {
  yearly: 'notecal_pro_yearly_3999',
  monthly: 'notecal_pro_monthly_999',
  lifetime: 'notecal_pro_lifetime_7999',
} as const;

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

let configured = false;

/** Configure the RevenueCat SDK once at app start. Safe to call multiple times. */
export function configurePurchases() {
  if (configured) return;
  if (Platform.OS !== 'ios') {
    // iOS-only at launch. Android wiring lands when we add the Android paywall.
    return;
  }
  if (!API_KEY) {
    if (__DEV__) {
      console.warn(
        '[revenuecat] EXPO_PUBLIC_REVENUECAT_IOS_KEY missing — paywall is in dev-bypass mode',
      );
    }
    return;
  }
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

/** Convenience: returns true when the user holds an active 'pro' entitlement. */
export function customerInfoIsPro(info: CustomerInfo | null | undefined): boolean {
  if (!info) return false;
  const ent = info.entitlements.active[PRO_ENTITLEMENT];
  if (!ent) return false;
  // Family-shared entitlements never trigger RC webhooks (only the original
  // purchaser does), so our `subscriptions` table won't have a row for family
  // members. Treating them as Pro client-side would make the UI say Pro while
  // every server call 403s on entitlement_required. Deny on client too so
  // gating is consistent.
  if (ent.ownershipType === 'FAMILY_SHARED') return false;
  return true;
}

/** Pulls the current offering. Returns null if RC isn't configured or there's
 *  no current offering set in the dashboard. */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (e) {
    console.error('[revenuecat] getOfferings failed', e);
    return null;
  }
}

/** Like `getCurrentOffering` but distinguishes a fetch failure (network down,
 *  RC unreachable, etc) from a successful fetch that returned no current
 *  offering. Lets callers render a "couldn't load plans" state with a Retry
 *  button instead of an indefinite spinner. `error: false` + `offering: null`
 *  means RC is configured-but-no-current. `error: false` + `offering: null`
 *  with RC not configured (dev bypass) is also covered. */
export async function tryGetCurrentOffering(): Promise<{
  offering: PurchasesOffering | null;
  error: boolean;
}> {
  if (!configured) return { offering: null, error: false };
  try {
    const offerings = await Purchases.getOfferings();
    return { offering: offerings.current ?? null, error: false };
  } catch (e) {
    console.error('[revenuecat] getOfferings failed', e);
    return { offering: null, error: true };
  }
}

/** Purchase a package. Returns the updated customerInfo or null on user cancel. */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  if (!configured) {
    throw new Error('RevenueCat not configured — cannot purchase.');
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

/** Restore prior purchases. Returns updated customerInfo. */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  return Purchases.restorePurchases();
}

/** Identify the user in RC. Call after Supabase SIGNED_IN. */
export async function logInPurchases(userId: string): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  } catch (e) {
    console.error('[revenuecat] logIn failed', e);
    return null;
  }
}

/** Clear RC identity on sign-out. */
export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    // logOut throws if already anonymous — non-fatal.
    if (__DEV__) console.warn('[revenuecat] logOut warning', e);
  }
}

/** Latest cached customerInfo. Cheaper than getCustomerInfo when only the
 *  cached value is needed (e.g. cold start). */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.error('[revenuecat] getCustomerInfo failed', e);
    return null;
  }
}
