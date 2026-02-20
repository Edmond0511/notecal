import { mmkv } from "@/lib/mmkv";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/app-store";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { AuthModal } from "./AuthModal";
import { CalendarLegendModal } from "./CalendarLegendModal";
import { GoalsWizard } from "./goals/GoalsWizard";
import { NutritionGoalsModal } from "./NutritionGoalsModal";
import { PersonalInfoModal } from "./PersonalInfoModal";
import { WeightTrackingModal } from "./WeightTrackingModal";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

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
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showNutritionGoals, setShowNutritionGoals] = useState(false);
  const [showGoalsWizard, setShowGoalsWizard] = useState(false);
  const [showWeightTracking, setShowWeightTracking] = useState(false);
  const [showCalendarLegend, setShowCalendarLegend] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
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
        setUser({
          email: user.email || "",
          provider: provider.charAt(0).toUpperCase() + provider.slice(1),
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

  const handleAuthSuccess = () => {
    fetchUser();
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
                  style={styles.backButton}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={20} color="#666" />
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
                      <ActivityIndicator size="small" color="#666" />
                    </View>
                  ) : user ? (
                    /* Signed In State */
                    <>
                      <View style={styles.accountCard}>
                        <View style={styles.accountInfo}>
                          <View style={styles.avatarContainer}>
                            <Text style={styles.avatarText}>
                              {user.email.charAt(0).toUpperCase()}
                            </Text>
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
                            color="#999"
                          />
                          <Text style={styles.syncStatusText}>
                            Last synced {formatSyncTime(lastSynced)}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : (
                    /* Signed Out State */
                    <TouchableOpacity
                      style={styles.signInCard}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowAuthModal(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.signInIconContainer}>
                        <Ionicons
                          name="person-outline"
                          size={24}
                          color="#22C55E"
                        />
                      </View>
                      <View style={styles.signInContent}>
                        <Text style={styles.signInTitle}>Sign In</Text>
                        <Text style={styles.signInSubtitle}>
                          Sync your data across devices
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                  )}
                </Animated.View>

                {/* App Section */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>App</Text>

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
                          color="#333"
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Personal Info</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#ccc"
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
                          color="#333"
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>
                          Nutrition Targets
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#ccc"
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
                          color="#333"
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Goals Setup</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#ccc"
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
                          color="#333"
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Weight Tracking</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#ccc"
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
                          color="#333"
                          style={{ marginRight: 12 }}
                        />
                        <Text style={styles.menuItemText}>Calendar Legend</Text>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color="#ccc"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Animated.View>

                {/* About Section */}
                <Animated.View
                  entering={FadeInDown.delay(300).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>About</Text>

                  <View style={styles.menuCardShadow}>
                    <View style={styles.menuCard}>
                      <View style={styles.menuItem}>
                        <Ionicons
                          name="information-circle-outline"
                          size={20}
                          color="#333"
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
                    entering={FadeInDown.delay(400).duration(400)}
                    style={styles.section}
                  >
                    <TouchableOpacity
                      style={styles.signOutButton}
                      onPress={handleSignOut}
                      disabled={isSigningOut}
                      activeOpacity={0.7}
                    >
                      {isSigningOut ? (
                        <ActivityIndicator size="small" color="#DC2626" />
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

        {/* Nested inside Settings Modal — presents on top on iOS */}
        {showAuthModal && (
          <AuthModal
            visible={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={handleAuthSuccess}
          />
        )}

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
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f8f8",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRightSpacer: {
    width: 36,
  },
  title: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
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
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  loadingContainer: {
    padding: 24,
    alignItems: "center",
  },
  accountCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
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
  accountDetails: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  accountProvider: {
    fontSize: 13,
    color: "#666",
  },
  signOutButton: {
    alignItems: "center",
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#DC2626",
  },
  signInCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
  },
  signInIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  signInContent: {
    flex: 1,
  },
  signInTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  signInSubtitle: {
    fontSize: 13,
    color: "#666",
  },
  menuCardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  menuCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: "#1a1a1a",
    fontWeight: "400",
  },
  menuItemValue: {
    fontSize: 15,
    color: "#999",
    fontWeight: "500",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginLeft: 20,
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
    color: "#999",
  },
});
