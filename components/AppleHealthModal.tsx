import { SystemFont, Tokens } from "@/constants/theme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  getHealthSettings,
  setHealthSettings,
} from "@/services/healthkit/healthSettings";
import {
  startHealthSubscriber,
  stopHealthSubscriber,
} from "@/services/healthkit/healthSubscriber";
import { healthSyncService } from "@/services/healthkit/healthSyncService";
import * as healthkitClient from "@/services/healthkit/healthkitClient";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
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

const DISMISS_THRESHOLD = 150;

interface AppleHealthModalProps {
  visible: boolean;
  onClose: () => void;
  nested?: boolean;
}

export function AppleHealthModal({
  visible,
  onClose,
  nested,
}: AppleHealthModalProps) {
  // Android: return null (modal does nothing)
  if (Platform.OS !== "ios") return null;

  const { height: screenHeight, sheetMaxWidth, isRegular } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);

  const [hs, setHsState] = useState(getHealthSettings());
  const [authorizing, setAuthorizing] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setHsState(getHealthSettings());
    }
  }, [visible]);

  const refresh = () => setHsState(getHealthSettings());

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isScrolledToTop.value && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(screenHeight, {
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
      [0, screenHeight * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleConnectToggle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hs.healthEnabled) {
      // Connect flow
      setAuthorizing(true);
      const auth = await healthkitClient.requestAuthorization();
      setAuthorizing(false);
      if (!auth.ok) {
        Alert.alert(
          "Apple Health",
          "Authorization was denied. You can enable it later in Settings → Privacy & Security → Health.",
        );
        return;
      }
      setHealthSettings({ healthEnabled: true, healthAuthRevoked: false });
      refresh();
      startHealthSubscriber();
      healthSyncService.startWeightObserver();
      healthSyncService.fullHealthSync();
    } else {
      // Disconnect flow with confirm
      Alert.alert(
        "Disconnect from Apple Health?",
        "Existing data in Health stays put. NoteCal will stop reading and writing.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: () => {
              stopHealthSubscriber();
              healthSyncService.stopWeightObserver();
              healthSyncService.clearDirty();
              setHealthSettings({ healthEnabled: false });
              refresh();
            },
          },
        ],
      );
    }
  };

  const handleSubToggle = (
    key: "pushNutritionEnabled" | "weightSyncEnabled",
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHealthSettings({ [key]: !hs[key] });
    refresh();
  };

  const handleOpenHealthApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("x-apple-health://").catch(() => {
      Alert.alert("Could not open Health", "Open the Health app manually.");
    });
  };

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
              isRegular && {
                width: sheetMaxWidth,
                maxWidth: sheetMaxWidth,
                alignSelf: "center",
              },
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
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={Tokens.textSecondary}
                    />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Apple Health</Text>
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
              <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                {hs.healthAuthRevoked && (
                  <>
                    <View style={styles.warningBanner}>
                      <Text style={styles.warningText}>
                        Apple Health permission was revoked. Re-enable it in iOS
                        Settings → Privacy & Security → Health → NoteCal.
                      </Text>
                    </View>
                    <View style={styles.divider} />
                  </>
                )}

                <TouchableOpacity
                  style={styles.preferenceRow}
                  activeOpacity={0.7}
                  onPress={handleConnectToggle}
                  disabled={authorizing}
                >
                  <View style={styles.preferenceInfo}>
                    <View style={styles.preferenceHeader}>
                      <Ionicons
                        name="heart-outline"
                        size={20}
                        color={Tokens.textPrimary}
                        style={{ marginRight: 12 }}
                      />
                      <Text style={styles.preferenceLabel}>
                        Connect to Apple Health
                      </Text>
                    </View>
                    <Text style={styles.preferenceDescription}>
                      {hs.healthEnabled
                        ? "NoteCal is reading and writing weight & nutrition data with Apple Health."
                        : "Sync your meals, water, and weight bidirectionally with the Health app."}
                    </Text>
                  </View>
                  {authorizing ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={styles.preferenceValue}>
                      {hs.healthEnabled ? "On" : "Off"}
                    </Text>
                  )}
                </TouchableOpacity>

                {hs.healthEnabled && (
                  <>
                    <View style={styles.divider} />
                    <TouchableOpacity
                      style={styles.preferenceRow}
                      activeOpacity={0.7}
                      onPress={() => handleSubToggle("pushNutritionEnabled")}
                    >
                      <View style={styles.preferenceInfo}>
                        <View style={styles.preferenceHeader}>
                          <Ionicons
                            name="restaurant-outline"
                            size={20}
                            color={Tokens.textPrimary}
                            style={{ marginRight: 12 }}
                          />
                          <Text style={styles.preferenceLabel}>
                            Push Nutrition
                          </Text>
                        </View>
                        <Text style={styles.preferenceDescription}>
                          {hs.pushNutritionEnabled
                            ? "Logged meals are written to Health: calories, protein, fat, carbs, fiber, sugar, sodium, potassium, water."
                            : "Nutrition data stays inside NoteCal."}
                        </Text>
                      </View>
                      <Text style={styles.preferenceValue}>
                        {hs.pushNutritionEnabled ? "On" : "Off"}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                      style={styles.preferenceRow}
                      activeOpacity={0.7}
                      onPress={() => handleSubToggle("weightSyncEnabled")}
                    >
                      <View style={styles.preferenceInfo}>
                        <View style={styles.preferenceHeader}>
                          <Ionicons
                            name="scale-outline"
                            size={20}
                            color={Tokens.textPrimary}
                            style={{ marginRight: 12 }}
                          />
                          <Text style={styles.preferenceLabel}>
                            Sync Weight
                          </Text>
                        </View>
                        <Text style={styles.preferenceDescription}>
                          {hs.weightSyncEnabled
                            ? "Weights flow both directions. Tap Open Health below to set NoteCal as the default source."
                            : "Weight is local to NoteCal."}
                        </Text>
                      </View>
                      <Text style={styles.preferenceValue}>
                        {hs.weightSyncEnabled ? "On" : "Off"}
                      </Text>
                    </TouchableOpacity>

                    {hs.weightSyncEnabled && (
                      <>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={styles.preferenceRow}
                          activeOpacity={0.7}
                          onPress={handleOpenHealthApp}
                        >
                          <View style={styles.preferenceInfo}>
                            <View style={styles.preferenceHeader}>
                              <Ionicons
                                name="open-outline"
                                size={20}
                                color={Tokens.textPrimary}
                                style={{ marginRight: 12 }}
                              />
                              <Text style={styles.preferenceLabel}>
                                Open Health App
                              </Text>
                            </View>
                            <Text style={styles.preferenceDescription}>
                              Set NoteCal as the default weight source under
                              Browse → Body Measurements → Weight.
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={Tokens.textTertiary}
                          />
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}

                {hs.healthEnabled && hs.lastHealthPull && (
                  <Text style={styles.lastSyncedText}>
                    Last synced {new Date(hs.lastHealthPull).toLocaleString()}
                  </Text>
                )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  warningBanner: {
    padding: 12,
    backgroundColor: "#FFE5E5",
    borderRadius: 8,
    marginBottom: 8,
  },
  warningText: {
    color: "#900",
    fontSize: 13,
    lineHeight: 18,
  },
  lastSyncedText: {
    fontSize: 12,
    color: Tokens.textTertiary,
    textAlign: "center",
    marginTop: 16,
  },
});
