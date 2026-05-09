import type { PurchasesPackage } from 'react-native-purchases';

/** Pulls intro free-trial period out of a package's product. RC normalizes the
 *  Apple/Google subscription-period strings, but the field shape varies — we
 *  read defensively. Returns a label like "1 week free" or null. */
export function getTrialLabel(
  pkg: PurchasesPackage | null | undefined,
): string | null {
  if (!pkg) return null;
  const intro: any = (pkg.product as any)?.introPrice;
  if (!intro) return null;
  if (typeof intro.priceString === 'string' && intro.price === 0) {
    const periodNum = intro.periodNumberOfUnits ?? intro.periodUnit ?? 0;
    const periodUnit = intro.periodUnit ?? '';
    if (typeof periodNum === 'number' && periodNum > 0) {
      const noun =
        periodUnit === 'DAY' || periodUnit === 'day'
          ? 'day'
          : periodUnit === 'WEEK' || periodUnit === 'week'
          ? 'week'
          : periodUnit === 'MONTH' || periodUnit === 'month'
          ? 'month'
          : 'day';
      return `${periodNum} ${noun}${periodNum === 1 ? '' : 's'} free`;
    }
  }
  return null;
}
