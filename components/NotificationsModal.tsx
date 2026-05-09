import { Tokens } from "@/constants/theme";
import {
  cancelAllReminders,
  requestPermissions,
  scheduleAllReminders,
} from "@/services/notificationService";
import { useAppStore } from "@/store/app-store";
import { MealReminder } from "@/types";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import {
  KeyboardAwareScrollView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
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
const SWIPE_ACTION_WIDTH = 72;

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  nested?: boolean;
}

function formatTime(time24: string): string {
  const [hourStr, minuteStr] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

function timeToDate(time24: string): Date {
  const [hourStr, minuteStr] = time24.split(":");
  const d = new Date();
  d.setHours(parseInt(hourStr, 10), parseInt(minuteStr, 10), 0, 0);
  return d;
}

function dateToTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

interface ReminderRowProps {
  reminder: MealReminder;
  isDefault: boolean;
  editingTimeId: string | null;
  draftTime: string;
  onToggleTime: (id: string) => void;
  onDraftTimeChange: (time: string) => void;
  onTimeConfirm: (id: string) => void;
  onToggleReminder: (id: string) => void;
  onDelete: (id: string) => void;
}

function ReminderRow({
  reminder,
  isDefault,
  editingTimeId,
  draftTime,
  onToggleTime,
  onDraftTimeChange,
  onTimeConfirm,
  onToggleReminder,
  onDelete,
}: ReminderRowProps) {
  const translateX = useSharedValue(0);
  const isOpen = useSharedValue(false);

  const handleDelete = useCallback(() => {
    translateX.value = withSpring(0, { damping: 25, stiffness: 300 });
    isOpen.value = false;
    onDelete(reminder.id);
  }, [onDelete, reminder.id]);

  const panGesture = Gesture.Pan()
    .enabled(!isDefault)
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((event) => {
      const base = isOpen.value ? -SWIPE_ACTION_WIDTH : 0;
      const raw = base + event.translationX;
      if (raw > 0) {
        translateX.value = raw * 0.15;
      } else if (raw < -SWIPE_ACTION_WIDTH) {
        const overshoot = raw + SWIPE_ACTION_WIDTH;
        translateX.value = -SWIPE_ACTION_WIDTH + overshoot * 0.15;
      } else {
        translateX.value = raw;
      }
    })
    .onEnd(() => {
      if (translateX.value < -SWIPE_ACTION_WIDTH / 2) {
        translateX.value = withSpring(-SWIPE_ACTION_WIDTH, {
          damping: 25,
          stiffness: 300,
        });
        isOpen.value = true;
      } else {
        translateX.value = withSpring(0, {
          damping: 25,
          stiffness: 300,
        });
        isOpen.value = false;
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_ACTION_WIDTH * 0.3, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          translateX.value,
          [-SWIPE_ACTION_WIDTH, -SWIPE_ACTION_WIDTH * 0.3, 0],
          [1, 0.8, 0.5],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const content = (
    <>
      <View style={styles.reminderRow}>
        <Text style={styles.reminderName}>{reminder.name}</Text>
        <TouchableOpacity
          onPress={() => onToggleTime(reminder.id)}
          style={styles.timePill}
          activeOpacity={0.7}
        >
          <Text style={styles.timePillText}>{formatTime(reminder.time)}</Text>
        </TouchableOpacity>
        {isDefault ? (
          <Switch
            value={reminder.enabled}
            onValueChange={() => onToggleReminder(reminder.id)}
            trackColor={{ false: "#E8E7E3", true: Tokens.accent }}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        ) : (
          <Switch
            value={reminder.enabled}
            onValueChange={() => onToggleReminder(reminder.id)}
            trackColor={{ false: "#E8E7E3", true: Tokens.accent }}
            style={{ transform: [{ scale: 0.85 }] }}
          />
        )}
      </View>
      {editingTimeId === reminder.id && (
        <View style={styles.timePickerContainer}>
          <View style={styles.timePickerWrapper}>
            <DateTimePicker
              value={timeToDate(draftTime)}
              mode="time"
              display="spinner"
              onChange={(_, date) => {
                if (date) onDraftTimeChange(dateToTime(date));
              }}
              themeVariant="light"
              textColor={Tokens.textPrimary}
              style={styles.timePicker}
            />
          </View>
          <TouchableOpacity
            onPress={() => onTimeConfirm(reminder.id)}
            style={styles.doneButton}
            activeOpacity={0.7}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.swipeContainer}>
      {!isDefault && (
        <Animated.View style={[styles.swipeActionBehind, actionStyle]}>
          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.8}
            style={styles.swipeDeleteButton}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.swipeRowContent, rowStyle]}>
          {content}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

interface AddReminderPopupProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  onNameChange: (name: string) => void;
  time: string;
  onTimeChange: (time: string) => void;
  onConfirm: () => void;
}

function AddReminderPopup({
  visible,
  onClose,
  name,
  onNameChange,
  time,
  onTimeChange,
  onConfirm,
}: AddReminderPopupProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const showGlass = isLiquidGlassSupported;

  React.useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible]);

  const handleDismiss = () => {
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(handleDismiss)();
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
      [0, SCREEN_HEIGHT * 0.3],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const canConfirm = name.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.popupGestureRoot}>
        <Animated.View style={[styles.popupBackdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.popupBackdropPressable}
            onPress={handleDismiss}
            activeOpacity={1}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.popupContainer,
              { marginTop: insets.top + 16 },
              animatedStyle,
            ]}
          >
            {/* Drag Indicator */}
            <View style={styles.popupDragIndicatorContainer}>
              <View style={styles.popupDragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.popupHeader}>
              <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7}>
                {showGlass ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    colorScheme="light"
                    tintColor={Tokens.tintColor}
                  >
                    <Ionicons
                      name="close"
                      size={20}
                      color={Tokens.textPrimary}
                    />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="close" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.popupTitle}>Add Reminder</Text>
              <TouchableOpacity
                onPress={onConfirm}
                activeOpacity={0.7}
                disabled={!canConfirm}
              >
                {showGlass ? (
                  <LiquidGlassView
                    style={[
                      styles.backButton,
                      styles.checkButton,
                      !canConfirm && { opacity: 0.4 },
                    ]}
                    interactive
                    effect="regular"
                    colorScheme="light"
                    tintColor={Tokens.tintColor}
                  >
                    <Ionicons
                      name="checkmark-sharp"
                      size={20}
                      color={Tokens.accent}
                    />
                  </LiquidGlassView>
                ) : (
                  <View
                    style={[
                      styles.backButton,
                      styles.checkButton,
                      !canConfirm && { opacity: 0.4 },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-sharp"
                      size={20}
                      color={Tokens.accent}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              bounces={false}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.popupContent}>
                <View style={styles.popupDivider} />
                <TextInput
                  style={styles.popupInput}
                  placeholder="Reminder"
                  placeholderTextColor={Tokens.textTertiary}
                  value={name}
                  onChangeText={onNameChange}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (canConfirm) onConfirm();
                  }}
                />
                <View style={styles.popupDivider} />
                <DateTimePicker
                  value={timeToDate(time)}
                  mode="time"
                  display="spinner"
                  onChange={(_, date) => {
                    if (date) onTimeChange(dateToTime(date));
                  }}
                  themeVariant="light"
                  textColor={Tokens.textPrimary}
                  style={styles.popupTimePicker}
                />
              </View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function NotificationsModal({
  visible,
  onClose,
  nested,
}: NotificationsModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);

  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);
  const mealReminders = useAppStore((s) => s.mealReminders);
  const setNotificationsEnabled = useAppStore((s) => s.setNotificationsEnabled);
  const toggleMealReminder = useAppStore((s) => s.toggleMealReminder);
  const updateMealReminderTime = useAppStore((s) => s.updateMealReminderTime);
  const addMealReminder = useAppStore((s) => s.addMealReminder);
  const deleteMealReminder = useAppStore((s) => s.deleteMealReminder);

  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [draftTime, setDraftTime] = useState<string>("12:00");
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [newReminderName, setNewReminderName] = useState("");
  const [newReminderTime, setNewReminderTime] = useState("12:00");

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingTimeId(null);
    setShowAddPopup(false);
    onClose();
  };

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

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleMasterToggle = useCallback(
    async (value: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (value) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            "Notifications Disabled",
            "Please enable notifications in Settings to receive meal reminders.",
            [{ text: "OK" }],
          );
          return;
        }
        setNotificationsEnabled(true);
        const reminders = useAppStore.getState().mealReminders;
        await scheduleAllReminders(reminders);
      } else {
        setNotificationsEnabled(false);
        await cancelAllReminders();
      }
    },
    [setNotificationsEnabled],
  );

  const handleToggleReminder = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleMealReminder(id);
      // Reschedule all after toggle
      const reminders = useAppStore.getState().mealReminders;
      await scheduleAllReminders(reminders);
    },
    [toggleMealReminder],
  );

  const handleTimeConfirm = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateMealReminderTime(id, draftTime);
      setEditingTimeId(null);
      // Reschedule all after time change
      const reminders = useAppStore.getState().mealReminders;
      await scheduleAllReminders(reminders);
    },
    [updateMealReminderTime, draftTime],
  );

  const handleAddReminder = useCallback(async () => {
    const name = newReminderName.trim();
    if (!name) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addMealReminder(name, newReminderTime);
    setNewReminderName("");
    setNewReminderTime("12:00");
    setShowAddPopup(false);
    // Reschedule all
    const reminders = useAppStore.getState().mealReminders;
    await scheduleAllReminders(reminders);
  }, [newReminderName, newReminderTime, addMealReminder]);

  const handleDeleteReminder = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteMealReminder(id);
      // Reschedule all
      const reminders = useAppStore.getState().mealReminders;
      await scheduleAllReminders(reminders);
    },
    [deleteMealReminder],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardProvider>
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
              {/* Drag Indicator */}
              <View style={styles.dragIndicatorContainer}>
                <View style={styles.dragIndicator} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                  {isLiquidGlassSupported ? (
                    <LiquidGlassView
                      style={styles.backButton}
                      interactive
                      effect="regular"
                      colorScheme="light"
                      tintColor={Tokens.tintColor}
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
                      <Ionicons name="chevron-back" size={20} color="#666" />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.title}>Notifications</Text>
                {notificationsEnabled ? (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAddPopup(true);
                    }}
                    activeOpacity={0.7}
                  >
                    {isLiquidGlassSupported ? (
                      <LiquidGlassView
                        style={[styles.backButton, { backgroundColor: Tokens.accentTint }]}
                        interactive
                        effect="regular"
                        colorScheme="light"
                        tintColor={Tokens.tintColor}
                      >
                        <Ionicons
                          name="add-sharp"
                          size={20}
                          color={Tokens.accent}
                        />
                      </LiquidGlassView>
                    ) : (
                      <View
                        style={[styles.backButton, { backgroundColor: Tokens.accentTint }]}
                      >
                        <Ionicons name="add-sharp" size={20} color={Tokens.accent} />
                      </View>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerRightSpacer} />
                )}
              </View>

              <KeyboardAwareScrollView
                style={styles.content}
                contentContainerStyle={[
                  styles.contentContainer,
                  { paddingBottom: insets.bottom + 20 },
                ]}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                bounces
              >
                {/* Enable Notifications */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  style={styles.section}
                >
                  <View style={styles.cardShadow}>
                    <View style={styles.card}>
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>
                          Enable Notifications
                        </Text>
                        <Switch
                          value={notificationsEnabled}
                          onValueChange={handleMasterToggle}
                          trackColor={{ false: "#E8E7E3", true: Tokens.accent }}
                          style={{ transform: [{ scale: 0.85 }] }}
                        />
                      </View>
                    </View>
                  </View>
                </Animated.View>

                {/* Meal Reminders */}
                {notificationsEnabled && (
                  <Animated.View
                    entering={FadeInDown.delay(200).duration(400)}
                    style={styles.section}
                  >
                    <Text style={styles.sectionTitle}>MEAL REMINDERS</Text>
                    <View style={styles.cardShadow}>
                      <View style={styles.card}>
                        {mealReminders.map((reminder, index) => (
                          <View
                            key={reminder.id}
                            style={[
                              styles.rowWrapper,
                              index === mealReminders.length - 1 && styles.rowWrapperLast,
                            ]}
                          >
                            <ReminderRow
                              reminder={reminder}
                              isDefault={!!reminder.isDefault}
                              editingTimeId={editingTimeId}
                              draftTime={draftTime}
                              onToggleTime={(id) => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light,
                                );
                                if (editingTimeId === id) {
                                  setEditingTimeId(null);
                                } else {
                                  setDraftTime(reminder.time);
                                  setEditingTimeId(id);
                                }
                              }}
                              onDraftTimeChange={setDraftTime}
                              onTimeConfirm={handleTimeConfirm}
                              onToggleReminder={handleToggleReminder}
                              onDelete={handleDeleteReminder}
                            />
                          </View>
                        ))}
                      </View>
                    </View>
                  </Animated.View>
                )}
              </KeyboardAwareScrollView>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </KeyboardProvider>
      <AddReminderPopup
        visible={showAddPopup}
        onClose={() => {
          setShowAddPopup(false);
          setNewReminderName("");
          setNewReminderTime("12:00");
        }}
        name={newReminderName}
        onNameChange={setNewReminderName}
        time={newReminderTime}
        onTimeChange={setNewReminderTime}
        onConfirm={handleAddReminder}
      />
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
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
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
  checkButton: {
    backgroundColor: Tokens.accent,
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
    fontSize: 17,
    fontWeight: "600",
    color: "#6B6B6B",
    textTransform: "capitalize",
    letterSpacing: -0.3,
    marginBottom: 6,
    marginLeft: 0,
  },
  cardShadow: {
    ...Tokens.shadowLight,
  },
  card: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: "400",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  rowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Tokens.border,
  },
  rowWrapperLast: {
    borderBottomWidth: 0,
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 10,
  },
  swipeContainer: {
    overflow: "hidden",
  },
  swipeActionBehind: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    backgroundColor: "#F87171",
    justifyContent: "center",
    alignItems: "center",
  },
  swipeDeleteButton: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  swipeRowContent: {
    backgroundColor: Tokens.surfaceRaised,
  },
  reminderName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "400",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  timePill: {
    backgroundColor: "rgba(120, 120, 128, 0.12)",
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 10,
  },
  timePillText: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
  timePickerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  timePickerWrapper: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 24,
    overflow: "hidden",
  },
  timePicker: {
    height: 150,
  },
  doneButton: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 9999,
    backgroundColor: Tokens.textPrimary,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
    color: "#fff",
  },
  popupGestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#FCFCFB",
  },
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  popupBackdropPressable: {
    flex: 1,
  },
  popupContainer: {
    flex: 1,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  popupDragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  popupDragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  popupTitle: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  popupContent: {
    paddingHorizontal: 20,
  },
  popupInput: {
    fontSize: 16,
    color: Tokens.textPrimary,
    padding: 0,
    paddingVertical: 14,
    letterSpacing: 0,
  },
  popupDivider: {
    height: 1,
    backgroundColor: Tokens.border,
  },
  popupTimePicker: {
    height: 150,
  },
});
