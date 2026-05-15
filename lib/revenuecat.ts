import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  INTRO_ELIGIBILITY_STATUS,
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
    console.error(
      '[revenuecat] EXPO_PUBLIC_REVENUECAT_IOS_KEY missing — paywall will not load',
    );
    return;
  }
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

export type RefreshSchedule =
  | { kind: 'now' }
  | { kind: 'later'; delayMs: number }
  | { kind: 'skip' };

/** Decide when to schedule a customerInfo refresh based on an entitlement's
 *  expirationDate. Pure function so SubscriptionContext's effect stays
 *  declarative and the decision is unit-testable.
 *
 *  - `skip`: no expiration, malformed date, or expiration > 7 days out
 *    (long-lived subs are caught by the foreground refresh; setTimeout is
 *    unreliable past ~24 days due to Int32 wrap)
 *  - `now`: expiration is already past (refresh immediately to flip isPro)
 *  - `later`: expiration is within 7 days; delayMs adds a 5-second buffer so
 *    we don't race the server's expiration grace window */
export function scheduleRefreshAtExpiration(
  expirationDate: string | null | undefined,
  now: number = Date.now(),
): RefreshSchedule {
  if (!expirationDate) return { kind: 'skip' };
  const expiresMs = Date.parse(expirationDate);
  if (!Number.isFinite(expiresMs)) return { kind: 'skip' };
  const delay = expiresMs - now + 5_000;
  if (delay <= 0) return { kind: 'now' };
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  if (delay > SEVEN_DAYS_MS) return { kind: 'skip' };
  return { kind: 'later', delayMs: delay };
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
  // RC keeps an entitlement in `active` until its cached customerInfo refreshes
  // past expirationDate, so a cancelled-but-expired trial can briefly appear
  // Pro between SDK polling cycles. Fail closed when we already know it expired.
  if (ent.expirationDate) {
    const expiresMs = Date.parse(ent.expirationDate);
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return false;
  }
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

/** Checks whether THIS Apple ID is eligible for the yearly product's intro
 *  (free trial) offer. RC's offering packages always include `introPrice` if
 *  one is configured on the product in App Store Connect — they are NOT
 *  pre-filtered by user eligibility. We must call this API explicitly to
 *  know whether Apple will actually grant the trial at purchase time.
 *
 *  Returns true only on explicit `ELIGIBLE`. Treats UNKNOWN / NO_INTRO_OFFER
 *  / INELIGIBLE / errors as "do not promise a trial" — failing closed avoids
 *  the UI promising "Try free for 3 days" when Apple will charge full price. */
export async function checkYearlyTrialEligibility(): Promise<boolean> {
  if (!configured) return false;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([
      PRODUCT_IDS.yearly,
    ]);
    const status = result[PRODUCT_IDS.yearly]?.status;
    return status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
  } catch (e) {
    console.error('[revenuecat] checkTrialOrIntroductoryPriceEligibility failed', e);
    return false;
  }
}
