import { Tokens } from "@/constants/theme";
import { mmkv } from "@/lib/mmkv";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/app-store";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
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
import { CalendarLegendModal } from "./CalendarLegendModal";
import { GoalsWizard } from "./goals/GoalsWizard";
import { NotificationsModal } from "./NotificationsModal";
import { NutritionGoalsModal } from "./NutritionGoalsModal";
import { PersonalInfoModal } from "./PersonalInfoModal";
import { PreferencesModal } from "./PreferencesModal";
import { WeightTrackingModal } from "./WeightTrackingModal";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

const LEGAL_URLS = {
  terms: "https://notecal.app/terms",
  privacy: "https://notecal.app/privacy",
};

function formatSyncTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString())
    return `yesterday at ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface UserInfo {
  email: string;
  provider: string;
  avatarUrl?: string;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const [showNutritionGoals, setShowNutritionGoals] = useState(false);
  const [showGoalsWizard, setShowGoalsWizard] = useState(false);
  const [showWeightTracking, setShowWeightTracking] = useState(false);
  const [showCalendarLegend, setShowCalendarLegend] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const goals = useAppStore((s) => s.goals);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Only allow drag when scrolled to top
    })
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

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  // Fetch user on mount and when visible changes
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      fetchUser();
      setLastSynced(mmkv.getString("sync-last-pull") ?? null);
    }
  }, [visible]);

  const fetchUser = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const provider = user.app_metadata?.provider || "email";
        const avatarUrl =
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          undefined;
        setUser({
          email: user.email || "",
          provider: provider.charAt(0).toUpperCase() + provider.slice(1),
          avatarUrl,
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await supabase.auth.signOut();
      setUser(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <GestureHandlerRootView style={styles.gestureRoot}>
          <StatusBar barStyle="dark-content" />
          {/* Backdrop */}
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
                { marginTop: insets.top },
                animatedStyle,
              ]}
            >
              {/* Drag Indicator */}
              <View style={styles.dragIndicatorContainer}>
                <View style={styles.dragIndicator} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  {isLiquidGlassSupported ? (
                    <LiquidGlassView
                      style={styles.backButton}
                      interactive
                      effect="regular"
                      tintColor="rgba(250, 250, 247, 0.3)"
                    >
                      <Ionicons name="close" size={20} color={Tokens.textPrimary} />
                    </LiquidGlassView>
                  ) : (
                    <View style={[styles.backButton, styles.backButtonFallback]}>
                      <Ionicons name="close" size={20} color={Tokens.textSecondary} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
                <View style={styles.headerRightSpacer} />
              </View>

              <Animated.ScrollView
                style={styles.content}
                contentContainerStyle={[
                  styles.contentContainer,
                  { paddingBottom: insets.bottom + 20 },
                ]}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                bounces={true}
              >
                {/* Account Section */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Account</Text>

                  {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={Tokens.textSecondary} />
                    </View>
                  ) : user && (
                    <>
                      <View style={styles.accountCard}>
                        <View style={styles.accountInfo}>
                          <View style={styles.avatarContainer}>
                            {user.avatarUrl ? (
                              <Image
                                source={{ uri: user.avatarUrl }}
                                style={styles.avatarImage}
                              />
                            ) : (
                              <Text style={styles.avatarText}>
                                {user.email.charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <View style={styles.accountDetails}>
                            <Text style={styles.accountEmail} numberOfLines={1}>
                              {user.email}
                            </Text>
                            <Text style={styles.accountProvider}>
                              Signed in with {user.provider}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {lastSynced && (
                        <View style={styles.syncStatus}>
                          <Ionicons
                            name="cloud-done-outline"
                            size={14}
                            color={Tokens.textSecondary}
                          />
                          <Text style={styles.syncStatusText}>
                            Last synced {formatSyncTime(lastSynced)}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </Animated.View>

                {/* App Section */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>General</Text>

                  <View style={styles.menuCardShadow}>
                    <View style={styles.menuCard}>
                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          if (goals) {
                            setShowPersonalInfo(true);
                          } else {
                            setShowGoalsWizard(true);
                          }
                        }}
                      >
                        <Ionicons
                          name="person-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Personal Info</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setShowGoalsWizard(true);
                        }}
                      >
                        <Ionicons
                          name="flag-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Goals Setup</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setShowNutritionGoals(true);
                        }}
                      >
                        <Ionicons
                          name="nutrition-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>
                          Nutrition Targets
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setShowWeightTracking(true);
                        }}
                      >
                        <Ionicons
                          name="scale-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Weight Tracking</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setShowNotifications(true);
                        }}
                      >
                        <Ionicons
                          name="notifications-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Notifications</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setShowPreferences(true);
                        }}
                      >
                        <Ionicons
                          name="options-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Preferences</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setShowCalendarLegend(true);
                        }}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Calendar Legend</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                    </View>
                  </View>
                </Animated.View>

                {/* Legal Section */}
                <Animated.View
                  entering={FadeInDown.delay(300).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Legal</Text>

                  <View style={styles.menuCardShadow}>
                    <View style={styles.menuCard}>
                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          WebBrowser.openBrowserAsync(LEGAL_URLS.terms);
                        }}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Terms of Service</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>

                      <View style={styles.menuDivider} />

                      <TouchableOpacity
                        style={styles.menuItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          WebBrowser.openBrowserAsync(LEGAL_URLS.privacy);
                        }}
                      >
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Privacy Policy</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={Tokens.textTertiary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Animated.View>

                {/* About Section */}
                <Animated.View
                  entering={FadeInDown.delay(400).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>About</Text>

                  <View style={styles.menuCardShadow}>
                    <View style={styles.menuCard}>
                      <View style={styles.menuItem}>
                        <Ionicons
                          name="information-circle-outline"
                          size={20}
                          color={Tokens.textPrimary}
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Version</Text>
                        <Text style={styles.menuItemValue}>2.0.0</Text>
                      </View>
                    </View>
                  </View>
                </Animated.View>

                {user && (
                  <Animated.View
                    entering={FadeInDown.delay(600).duration(400)}
                    style={styles.section}
                  >
                    <TouchableOpacity
                      style={styles.signOutButton}
                      onPress={handleSignOut}
                      disabled={isSigningOut}
                      activeOpacity={0.7}
                    >
                      {isSigningOut ? (
                        <ActivityIndicator size="small" color={Tokens.textSecondary} />
                      ) : (
                        <Text style={styles.signOutText}>Sign Out</Text>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </Animated.ScrollView>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>


        {showNutritionGoals && (
          <NutritionGoalsModal
            visible={showNutritionGoals}
            onClose={() => setShowNutritionGoals(false)}
          />
        )}

        {showGoalsWizard && (
          <GoalsWizard
            visible={showGoalsWizard}
            onClose={() => setShowGoalsWizard(false)}
            existingGoals={goals}
          />
        )}

        {showWeightTracking && (
          <WeightTrackingModal
            visible={showWeightTracking}
            onClose={() => setShowWeightTracking(false)}
          />
        )}

        {showCalendarLegend && (
          <CalendarLegendModal
            visible={showCalendarLegend}
            onClose={() => setShowCalendarLegend(false)}
          />
        )}

        {showPersonalInfo && (
          <PersonalInfoModal
            visible={showPersonalInfo}
            onClose={() => setShowPersonalInfo(false)}
          />
        )}

        {showNotifications && (
          <NotificationsModal
            visible={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        )}

        {showPreferences && (
          <PreferencesModal
            visible={showPreferences}
            onClose={() => setShowPreferences(false)}
          />
        )}
      </Modal>
    </>
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
    fontFamily: "System",
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B6B6B",
    textTransform: "capitalize",
    marginBottom: 6,
    marginLeft: 0,
  },
  loadingContainer: {
    padding: 24,
    alignItems: "center",
  },
  accountCard: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
    ...Tokens.shadowLight,
  },
  accountInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#ffffff",
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  accountDetails: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 2,
  },
  accountProvider: {
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  signOutButton: {
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
    ...Tokens.shadowLight,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: Tokens.error,
  },
  menuCardShadow: {
    ...Tokens.shadowLight,
  },
  menuCard: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  menuItemText: {
    flex: 1,
    fontSize: 14,
    color: Tokens.textPrimary,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  menuItemValue: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: "600",
  },
  menuDivider: {
    height: 1,
    backgroundColor: Tokens.border,
    marginLeft: 45,
    marginRight: 20,
  },
  syncStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    gap: 5,
  },
  syncStatusText: {
    fontSize: 12,
    color: Tokens.textSecondary,
  },
});
