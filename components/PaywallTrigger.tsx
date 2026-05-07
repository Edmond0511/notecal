import { Tokens } from '@/constants/theme';
import { useSubscription } from '@/contexts/SubscriptionContext';
import React, { useEffect } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { Paywall } from './Paywall';

interface PaywallTriggerProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/** Full-screen paywall modal. Slides up from the bottom and takes over the
 *  whole screen — no backdrop, no drag-to-dismiss. The Paywall component owns
 *  its own close button.
 *
 *  We mount a fresh SafeAreaProvider inside the Modal because the app's root
 *  doesn't render a SafeAreaProvider (Expo Router supplies one via its
 *  navigator, but that context doesn't propagate into the iOS Modal portal —
 *  without this wrapper, useSafeAreaInsets() returns zeros and the close X
 *  ends up under the status bar / Dynamic Island). */
export const PaywallTrigger: React.FC<PaywallTriggerProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { isPro } = useSubscription();

  // Defense in depth: if the user is already Pro, never render the modal.
  // Callsites should also gate on isPro, but RevenueCat's customerInfo
  // hydrates asynchronously on cold start — there's a brief window where
  // isPro is `false` before RC reports the active entitlement. If a trigger
  // fires inside that window (e.g., the post-auth pendingPaywallAfterAuth
  // handoff), this guard auto-dismisses the moment isPro flips true and
  // treats it as a synthetic success so the parent flow continues home.
  useEffect(() => {
    if (visible && isPro) {
      onSuccess?.();
      onClose();
    }
  }, [visible, isPro, onSuccess, onClose]);

  if (isPro) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
      onRequestClose={onClose}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={styles.root}>
          <Paywall
            onSuccess={() => {
              onSuccess?.();
              onClose();
            }}
            onDismiss={onClose}
          />
        </View>
      </SafeAreaProvider>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Tokens.background,
  },
});
