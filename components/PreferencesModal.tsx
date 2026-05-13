import { SystemFont, Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

interface PreferencesModalProps {
  visible: boolean;
  onClose: () => void;
  nested?: boolean;
}

export function PreferencesModal({ visible, onClose, nested }: PreferencesModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const entryMode = useAppStore((s) => s.entryMode ?? "freeform");
  const enterOnlyMode = useAppStore((s) => s.enterOnlyMode ?? false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
    }
  }, [visible]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isScrolledToTop.value && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.container,
              { marginTop: insets.top + (nested ? 16 : 0) },
              animatedStyle,
            ]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    colorScheme="light"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={Tokens.textPrimary}
                    />
                  </LiquidGlassView>
                ) : (
                  <View
                    style={[styles.backButton, styles.backButtonFallback]}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={Tokens.textSecondary}
                    />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Preferences</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <Animated.ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 20 },
              ]}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              bounces={true}
            >
              <Animated.View
                entering={FadeInDown.delay(100).duration(400)}
              >
                <TouchableOpacity
                  style={styles.preferenceRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const next =
                      entryMode === "dash" ? "freeform" : "dash";
                    useAppStore.getState().setEntryMode(next);
                  }}
                >
                  <View style={styles.preferenceInfo}>
                    <View style={styles.preferenceHeader}>
                      <Ionicons
                        name="list-outline"
                        size={20}
                        color={Tokens.textPrimary}
                        style={{ marginRight: 12 }}
                      />
                      <Text style={styles.preferenceLabel}>Entry Mode</Text>
                    </View>
                    <Text style={styles.preferenceDescription}>
                      {entryMode === "dash"
                        ? "Each food entry begins with a dash (- ). New lines auto-insert dashes."
                        : "Any non-empty line is treated as a food entry. No dash prefix needed."}
                    </Text>
                  </View>
                  <Text style={styles.preferenceValue}>
                    {entryMode === "freeform" ? "Freeform" : "Dash"}
                  </Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity
                  style={styles.preferenceRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    useAppStore.getState().setEnterOnlyMode(!enterOnlyMode);
                  }}
                >
                  <View style={styles.preferenceInfo}>
                    <View style={styles.preferenceHeader}>
                      <Ionicons
                        name="return-down-back-outline"
                        size={20}
                        color={Tokens.textPrimary}
                        style={{ marginRight: 12 }}
                      />
                      <Text style={styles.preferenceLabel}>
                        Submit on Enter
                      </Text>
                    </View>
                    <Text style={styles.preferenceDescription}>
                      {enterOnlyMode
                        ? "Entries are only sent for nutrition lookup when you press Enter."
                        : "Entries are automatically sent for lookup after you stop typing."}
                    </Text>
                  </View>
                  <Text style={styles.preferenceValue}>
                    {enterOnlyMode ? "On" : "Off"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backdropPressable: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FCFCFB",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  headerRightSpacer: {
    width: 36,
  },
  title: {
    fontSize: 17,
    fontFamily: SystemFont,
    fontWeight: "600",
    color: Tokens.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  preferenceInfo: {
    flex: 1,
    marginRight: 12,
  },
  preferenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  preferenceDescription: {
    fontSize: 13,
    fontWeight: "400",
    color: Tokens.textSecondary,
    marginLeft: 32,
    lineHeight: 18,
  },
  preferenceValue: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: Tokens.border,
    marginLeft: 32,
  },
});
