import { Tokens } from '@/constants/theme';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getTrialLabel } from '@/utils/trialLabel';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PaywallProps {
  /** Called when the user successfully purchases or already has Pro. */
  onSuccess?: () => void;
  /** Called when the user dismisses without purchasing. */
  onDismiss?: () => void;
}

const SELECTED_TINT = 'rgba(26, 104, 114, 0.08)';

const LEGAL_URLS = {
  terms: 'https://notecal.app/terms',
  privacy: 'https://notecal.app/privacy',
};

const PLEX_SEMIBOLD = 'IBMPlexSans_600SemiBold';
const PLEX_BOLD = 'IBMPlexSans_700Bold';

/**
 * Locale-aware "/mo" derivation from a yearly package. Uses the RC SDK's
 * canonical numeric `price` + ISO `currencyCode` and formats via Intl so we
 * don't get tripped up by comma-decimal locales (Germany: "€39,99") or
 * suffix-currency locales (Sweden: "399,00 kr"). Falls back to the original
 * priceString when either field is missing.
 */
function yearlyEffectiveMonthly(pkg: PurchasesPackage): string {
  const price = pkg.product.price;
  const currencyCode = pkg.product.currencyCode;
  const fallback = pkg.product.priceString;
  if (!Number.isFinite(price) || price <= 0 || !currencyCode) {
    return fallback;
  }
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(price / 12);
    return `${formatted}/mo`;
  } catch {
    return fallback;
  }
}

export const Paywall: React.FC<PaywallProps> = ({ onSuccess, onDismiss }) => {
  const {
    offering,
    offeringError,
    refreshOffering,
    purchase,
    restore,
    isPro,
    yearlyTrialEligible,
  } = useSubscription();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const insets = useSafeAreaInsets();
  // Always reserve at least 12px top / 16px bottom so the X never hugs the
  // status bar and the bottom bar never hugs the home indicator on devices
  // without insets.
  const topPad = Math.max(insets.top, 12);
  const bottomPad = Math.max(insets.bottom, 16);

  const yearly = useMemo(
    () =>
      offering?.availablePackages.find(
        (p) =>
          p.identifier === '$rc_annual' ||
          p.product.identifier.includes('yearly'),
      ) ?? null,
    [offering],
  );
  const monthly = useMemo(
    () =>
      offering?.availablePackages.find(
        (p) =>
          p.identifier === '$rc_monthly' ||
          p.product.identifier.includes('monthly'),
      ) ?? null,
    [offering],
  );

  const [selectedId, setSelectedId] = useState<'yearly' | 'monthly'>('yearly');
  // Once offerings load, default to yearly if available, otherwise monthly.
  useEffect(() => {
    if (yearly) setSelectedId('yearly');
    else if (monthly) setSelectedId('monthly');
  }, [yearly, monthly]);

  const selectedPackage =
    selectedId === 'yearly' ? yearly ?? monthly : monthly ?? yearly;

  // Null when either:
  //   1. RC's offering has no intro offer configured on the yearly product, OR
  //   2. The current Apple ID isn't eligible for the trial (already redeemed,
  //      region restriction, etc.)
  // RC's offering always carries `introPrice` when one is configured on the
  // product — eligibility is a SEPARATE API call. We gate on
  // `yearlyTrialEligible` here so the UI doesn't promise "Try free for 3
  // days" to a user Apple will refuse at purchase time. While eligibility
  // is loading (null), we also hide the trial copy — fail closed.
  const trialLabel = yearlyTrialEligible ? getTrialLabel(yearly) : null;

  // Already-Pro short-circuit (e.g. opened paywall by mistake).
  if (isPro) {
    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          {onDismiss && (
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              style={styles.closeButton}
              accessibilityLabel="Close paywall"
            >
              <Ionicons name="close" size={24} color={Tokens.textSecondary} />
            </Pressable>
          )}
        </View>
        <View style={styles.alreadyProBody}>
          <Text style={styles.title}>NoteCal Pro</Text>
          <Text style={styles.alreadyProText}>You&apos;re already Pro.</Text>
        </View>
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
          <Pressable
            style={styles.cta}
            onPress={() => onSuccess?.()}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handlePurchase = async () => {
    if (!selectedPackage || purchasing) return;
    setPurchasing(true);
    try {
      const ok = await purchase(selectedPackage);
      if (ok) onSuccess?.();
    } catch (e: any) {
      Alert.alert(
        'Purchase failed',
        e?.message ?? 'Something went wrong. Please try again.',
      );
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const restored = await restore();
      if (restored) {
        onSuccess?.();
      } else {
        Alert.alert(
          'No purchases found',
          'We couldn’t find a previous purchase on this Apple ID.',
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Restore failed',
        e?.message ?? 'Something went wrong. Please try again.',
      );
    } finally {
      setRestoring(false);
    }
  };

  const yearlyPriceString = yearly?.product.priceString ?? '$39.99';
  const monthlyPriceString = monthly?.product.priceString ?? '$9.99';
  const yearlyMonthlyEquivalent = yearly
    ? yearlyEffectiveMonthly(yearly)
    : '$3.33/mo';

  // Subscription disclosure rendered near the CTA. Both yearly and monthly
  // must include price, period, auto-renewal and cancellation per App Store
  // Review Guideline 3.1.2(a). Trial messaging is handled by the reassurance
  // line above for the yearly+trial case.
  const summaryLine =
    selectedId === 'yearly'
      ? trialLabel
        ? `${trialLabel}, then ${yearlyPriceString}/year. Auto-renews. Cancel anytime.`
        : `${yearlyPriceString}/year. Auto-renews. Cancel anytime.`
      : `${monthlyPriceString}/month. Auto-renews. Cancel anytime.`;

  const ctaLabel =
    selectedId === 'yearly'
      ? trialLabel
        ? `Try free for ${trialLabel.replace(' free', '')}`
        : 'Continue'
      : 'Continue';

  // Three plan-section branches:
  //   loading: offering hasn't resolved yet and no error reported
  //   errorOrEmpty: fetch failed, OR fetch returned an offering with no usable
  //                 packages (region restriction / dashboard misconfig / both
  //                 yearly+monthly identifiers missed our filters)
  //   ready: at least one usable package
  const showErrorOrEmpty =
    offeringError || (!!offering && !yearly && !monthly);
  const showLoading = !offering && !offeringError;

  const handleRetryOffering = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshOffering();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top bar: close button only. Title moves into the scroll area so it
       *  doesn't crowd the safe-area inset. */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityLabel="Close paywall"
          >
            <Ionicons name="close" size={24} color={Tokens.textSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>NoteCal Pro</Text>
        <Text style={styles.description}>
          Unlimited AI logging, saved meals, multi-device sync, and personalised
          macro goals.
        </Text>

        {showErrorOrEmpty ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorTitle}>Couldn&apos;t load plans</Text>
            <Text style={styles.errorSubtitle}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={handleRetryOffering}
              disabled={retrying}
              style={[styles.retryButton, retrying && styles.ctaDisabled]}
              accessibilityRole="button"
            >
              {retrying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.retryButtonText}>Retry</Text>
              )}
            </Pressable>
          </View>
        ) : showLoading ? (
          <View style={styles.plansLoading}>
            <ActivityIndicator color={Tokens.accent} />
          </View>
        ) : (
          <View style={styles.plans}>
            {yearly && (
              <PlanRow
                title="Yearly"
                price={yearlyPriceString}
                sub={
                  trialLabel
                    ? `${trialLabel}, then ${yearlyMonthlyEquivalent}`
                    : yearlyMonthlyEquivalent
                }
                badge="Best Deal"
                selected={selectedId === 'yearly'}
                onPress={() => setSelectedId('yearly')}
              />
            )}
            {monthly && (
              <PlanRow
                title="Monthly"
                price={monthlyPriceString}
                sub="Billed monthly"
                selected={selectedId === 'monthly'}
                onPress={() => setSelectedId('monthly')}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom bar — CTA always visible, doesn't scroll away.
       *  Hidden entirely in the error/empty state since there's nothing to
       *  purchase. Restore + Terms + Privacy stay so the user can still
       *  recover a prior purchase or read legal copy. */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
        {!showErrorOrEmpty && (
          <>
            <View style={styles.summaryBlock}>
              {selectedId === 'yearly' && trialLabel && (
                <Text style={styles.reassuranceLine}>
                  No payment today.
                </Text>
              )}
              <Text style={styles.summaryLine}>{summaryLine}</Text>
            </View>
            <Pressable
              style={[
                styles.cta,
                (!selectedPackage || purchasing) && styles.ctaDisabled,
              ]}
              onPress={handlePurchase}
              disabled={!selectedPackage || purchasing}
              accessibilityRole="button"
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>{ctaLabel}</Text>
              )}
            </Pressable>
          </>
        )}
        <View style={styles.legalRow}>
          <Pressable
            onPress={handleRestore}
            disabled={restoring}
            accessibilityRole="button"
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
          >
            <Text style={styles.legalLink}>
              {restoring ? 'Restoring…' : 'Restore'}
            </Text>
          </Pressable>
          <View style={styles.legalDot} />
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.terms)}
            accessibilityRole="link"
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
          >
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
          <View style={styles.legalDot} />
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.privacy)}
            accessibilityRole="link"
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
          >
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

interface PlanRowProps {
  title: string;
  price: string;
  sub: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}

const PlanRow: React.FC<PlanRowProps> = ({
  title,
  price,
  sub,
  badge,
  selected,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={[styles.planRow, selected && styles.planRowSelected]}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
  >
    <View
      style={[styles.radio, selected ? styles.radioSelected : styles.radioDefault]}
    >
      {selected && <View style={styles.radioDot} />}
    </View>

    <View style={styles.planTextBlock}>
      <Text style={styles.planTitle}>{title}</Text>
      <Text style={styles.planPrice}>{price}</Text>
      <Text style={styles.planSub}>{sub}</Text>
    </View>

    {badge && (
      <View style={styles.badge}>
        <Text style={styles.badgeText} numberOfLines={1}>
          {badge}
        </Text>
      </View>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  alreadyProBody: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: PLEX_BOLD,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    color: Tokens.textPrimary,
  },
  description: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
    color: Tokens.textSecondary,
  },
  plans: {
    marginTop: 28,
    gap: 12,
  },
  plansLoading: {
    marginTop: 28,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBlock: {
    marginTop: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: 1,
    borderColor: Tokens.border,
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    fontFamily: PLEX_BOLD,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
    color: Tokens.textPrimary,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Tokens.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    minWidth: 140,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: Tokens.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: 1,
    borderColor: Tokens.border,
  },
  planRowSelected: {
    backgroundColor: SELECTED_TINT,
    borderWidth: 1.5,
    borderColor: Tokens.accent,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 12,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDefault: {
    borderWidth: 1.5,
    borderColor: Tokens.textTertiary,
    backgroundColor: 'transparent',
  },
  radioSelected: {
    borderWidth: 1.5,
    borderColor: Tokens.accent,
    backgroundColor: Tokens.accent,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  planTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  planTitle: {
    fontFamily: PLEX_BOLD,
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: -0.5,
    color: Tokens.textPrimary,
  },
  planPrice: {
    fontFamily: PLEX_SEMIBOLD,
    fontSize: 18,
    letterSpacing: -0.4,
    color: Tokens.textPrimary,
    marginTop: 4,
  },
  planSub: {
    fontSize: 13,
    lineHeight: 18,
    color: Tokens.textSecondary,
    marginTop: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Tokens.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 14,
    backgroundColor: Tokens.background,
  },
  summaryBlock: {
    gap: 4,
  },
  reassuranceLine: {
    textAlign: 'center',
    fontSize: 13,
    color: Tokens.textPrimary,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  summaryLine: {
    textAlign: 'center',
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  cta: {
    height: 56,
    borderRadius: 999,
    backgroundColor: Tokens.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  restoreText: {
    textAlign: 'center',
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  legalLink: {
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  legalDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Tokens.textTertiary,
  },
  alreadyProText: {
    marginTop: 32,
    marginBottom: 24,
    fontSize: 18,
    fontWeight: '600',
    color: Tokens.textPrimary,
    textAlign: 'center',
  },
});
