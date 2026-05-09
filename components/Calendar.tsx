import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "@/store/app-store";
import { Tokens } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;
const CALENDAR_PADDING = 16;
const DAY_WIDTH = Math.floor((SCREEN_WIDTH - CALENDAR_PADDING * 2) / 7);
const DAY_HEIGHT = 44;
const WEEKDAY_ROW_HEIGHT = 20;
const CONTENT_HEIGHT = WEEKDAY_ROW_HEIGHT + 6 * DAY_HEIGHT; // fixed to 6-row max

const DOT_COLORS = {
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#EF5350',
} as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface CalendarProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string; // YYYYMMDD format
  onSelectDate: (date: string) => void;
}

// Convert YYYYMMDD to Date
const parseDate = (dateString: string): Date => {
  return new Date(
    parseInt(dateString.substring(0, 4)),
    parseInt(dateString.substring(4, 6)) - 1,
    parseInt(dateString.substring(6, 8))
  );
};

// Convert Date to YYYYMMDD
const formatDate = (date: Date): string => {
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, "0") +
    date.getDate().toString().padStart(2, "0")
  );
};

// Get today's date string
const getTodayString = (): string => formatDate(new Date());

// Check if two date strings are the same day
const isSameDay = (date1: string, date2: string): boolean => date1 === date2;

function getDotColor(consumed: number, target: number): keyof typeof DOT_COLORS | null {
  if (target <= 0 || consumed <= 0) return null;
  const ratio = consumed / target;
  if (ratio >= 0.90) return 'green';
  if (ratio >= 0.50) return 'yellow';
  return 'red';
}

function buildDayA11yLabel(
  date: Date,
  isToday: boolean,
  isSelected: boolean,
  kcal: number | undefined,
): string {
  const parts: string[] = [
    `${MONTHS[date.getMonth()]} ${date.getDate()}`,
  ];
  if (isToday) parts.push('today');
  if (isSelected) parts.push('selected');
  if (kcal && kcal > 0) parts.push(`${Math.round(kcal)} calories`);
  return parts.join(', ');
}

export function Calendar({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
}: CalendarProps) {
  const insets = useSafeAreaInsets();
  const initialDate = parseDate(selectedDate);
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [wheelMode, setWheelMode] = useState(false);
  const [wheelDate, setWheelDate] = useState(initialDate);
  const goals = useAppStore((s) => s.goals);
  const entries = useAppStore((s) => s.entries);

  // Generate calendar days for the current view
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    // Previous month days to fill the first week
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    const prevMonthDays: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startingDay - 1; i >= 0; i--) {
      prevMonthDays.push({
        date: new Date(viewYear, viewMonth - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    const currentMonthDays: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      currentMonthDays.push({
        date: new Date(viewYear, viewMonth, i),
        isCurrentMonth: true,
      });
    }

    // Next month days to fill the last week
    const totalDays = prevMonthDays.length + currentMonthDays.length;
    const nextMonthDaysCount = totalDays <= 35 ? 35 - totalDays : 42 - totalDays;
    const nextMonthDays: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = 1; i <= nextMonthDaysCount; i++) {
      nextMonthDays.push({
        date: new Date(viewYear, viewMonth + 1, i),
        isCurrentMonth: false,
      });
    }

    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  }, [viewMonth, viewYear]);

  const dateCalorieMap = useMemo(() => {
    if (!goals) return null;
    const targetKcal = goals.manualTargets?.kcal ?? goals.targetKcal;
    if (!targetKcal || targetKcal <= 0) return null;
    const visibleDates = new Set(calendarDays.map(d => formatDate(d.date)));
    const map: Record<string, number> = {};
    for (const entry of entries) {
      if (!visibleDates.has(entry.date)) continue;
      if (entry.status !== 'ok') continue;
      map[entry.date] = (map[entry.date] || 0) + (entry.inlineKcal ?? 0);
    }
    return map;
  }, [goals, entries, calendarDays]);

  const navigateMonth = useCallback((direction: "prev" | "next") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (direction === "prev") {
      setViewMonth((m) => {
        if (m === 0) {
          setViewYear((y) => y - 1);
          return 11;
        }
        return m - 1;
      });
    } else {
      setViewMonth((m) => {
        if (m === 11) {
          setViewYear((y) => y + 1);
          return 0;
        }
        return m + 1;
      });
    }
  }, []);

  const handleSelectDate = useCallback(
    (date: Date) => {
      onSelectDate(formatDate(date));
      onClose();
    },
    [onSelectDate, onClose]
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const handleGoToToday = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const today = new Date();
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
    onSelectDate(formatDate(today));
    onClose();
  }, [onSelectDate, onClose]);

  const toggleWheelMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWheelMode((prev) => {
      if (!prev) {
        // Entering wheel mode — seed wheel with current view month/selected date
        setWheelDate(new Date(viewYear, viewMonth, parseDate(selectedDate).getDate()));
      }
      return !prev;
    });
  }, [viewYear, viewMonth, selectedDate]);

  const handleWheelConfirm = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectDate(formatDate(wheelDate));
    onClose();
  }, [wheelDate, onSelectDate, onClose]);

  // Pan gesture for swipe-to-dismiss
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(SCREEN_HEIGHT, { damping: 20, stiffness: 200 });
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
      }
    });

  // Fling gestures for horizontal month swiping
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      runOnJS(navigateMonth)("next");
    });

  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      runOnJS(navigateMonth)("prev");
    });

  const composedGesture = wheelMode
    ? panGesture
    : Gesture.Simultaneous(panGesture, flingLeft, flingRight);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Reset view to selected date when opening (synchronous to avoid backdrop flicker)
  const wasVisible = React.useRef(false);
  if (visible && !wasVisible.current) {
    translateY.value = 0;
    const date = parseDate(selectedDate);
    setViewMonth(date.getMonth());
    setViewYear(date.getFullYear());
    setWheelMode(false);
    setWheelDate(date);
  }
  wasVisible.current = visible;

  if (!visible) return null;

  const todayStr = getTodayString();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.modalContainer}>
        {/* Backdrop */}
        <Animated.View
          style={[styles.backdrop, backdropAnimatedStyle]}
        >
          <Pressable style={styles.backdropPressable} onPress={handleClose} />
        </Animated.View>

        {/* Calendar Sheet */}
        <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 8 }, sheetAnimatedStyle]}
        >
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header — "March 2026 >"   "< >" */}
          <View style={styles.navBar}>
            <TouchableOpacity
              onPress={toggleWheelMode}
              activeOpacity={0.7}
              style={styles.monthButton}
              accessibilityRole="button"
              accessibilityLabel={`${MONTHS[viewMonth]} ${viewYear}, ${wheelMode ? 'show calendar' : 'open date picker'}`}
            >
              <Text style={styles.monthText}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Ionicons
                name={wheelMode ? "chevron-down" : "chevron-forward"}
                size={16}
                color={Tokens.textSecondary}
              />
            </TouchableOpacity>

            {!wheelMode && (
              <View style={styles.navActions}>
                <TouchableOpacity
                  onPress={() => navigateMonth("prev")}
                  style={styles.navArrow}
                  activeOpacity={0.5}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                >
                  <Ionicons name="chevron-back" size={20} color={Tokens.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigateMonth("next")}
                  style={styles.navArrow}
                  activeOpacity={0.5}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                >
                  <Ionicons name="chevron-forward" size={20} color={Tokens.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {wheelMode && (
              <TouchableOpacity
                onPress={handleGoToToday}
                activeOpacity={0.7}
                style={styles.todayButton}
                accessibilityRole="button"
                accessibilityLabel="Go to today"
              >
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.contentArea}>
          {wheelMode ? (
            /* Native iOS wheel date picker */
            <View style={styles.wheelContainer}>
              <DateTimePicker
                value={wheelDate}
                mode="date"
                display="spinner"
                onChange={(_event, date) => {
                  if (date) setWheelDate(date);
                }}
                themeVariant="light"
                textColor={Tokens.textPrimary}
                style={styles.wheelPicker}
              />
              <TouchableOpacity
                onPress={handleWheelConfirm}
                activeOpacity={0.7}
                style={styles.wheelGoButton}
                accessibilityRole="button"
                accessibilityLabel="Go to selected date"
              >
                <Text style={styles.wheelGoButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Weekday headers */}
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((day, index) => (
                  <View key={index} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={styles.calendarGrid}>
                {calendarDays.map((item, index) => {
                  const dateStr = formatDate(item.date);
                  const isSelected = isSameDay(dateStr, selectedDate);
                  const isTodayDate = isSameDay(dateStr, todayStr);

                  const consumed = dateCalorieMap?.[dateStr];

                  let dotColor: keyof typeof DOT_COLORS | null = null;
                  if (dateCalorieMap && item.isCurrentMonth && consumed && consumed > 0) {
                    const target = goals!.manualTargets?.kcal ?? goals!.targetKcal;
                    dotColor = getDotColor(consumed, target);
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      style={styles.dayCell}
                      onPress={() => handleSelectDate(item.date)}
                      activeOpacity={0.5}
                      accessibilityRole="button"
                      accessibilityLabel={buildDayA11yLabel(
                        item.date,
                        isTodayDate,
                        isSelected,
                        consumed,
                      )}
                    >
                      <View
                        style={[
                          styles.dayInner,
                          isTodayDate && !isSelected && styles.todayDay,
                          isSelected && styles.selectedDay,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            !item.isCurrentMonth && styles.otherMonthText,
                            isTodayDate && !isSelected && styles.todayDayText,
                            isSelected && styles.selectedDayText,
                          ]}
                        >
                          {item.date.getDate()}
                        </Text>
                      </View>
                      <View style={[dotStyles.dot, dotColor ? { backgroundColor: DOT_COLORS[dotColor] } : { backgroundColor: 'transparent' }]} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
          </View>

        </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
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
  sheet: {
    backgroundColor: Tokens.surfaceRaised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: CALENDAR_PADDING,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Tokens.border,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingLeft: Math.floor(DAY_WIDTH / 2) - 10,
  },
  monthButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
  },
  monthText: {
    fontSize: 17,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  todayButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  todayButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Tokens.textSecondary,
  },
  navArrow: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  contentArea: {
    height: CONTENT_HEIGHT,
  },
  weekdayRow: {
    flexDirection: "row",
    height: WEEKDAY_ROW_HEIGHT,
    alignItems: "center",
  },
  weekdayCell: {
    width: DAY_WIDTH,
    alignItems: "center",
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: "600",
    color: Tokens.textSecondary,
    letterSpacing: 0.2,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: DAY_WIDTH,
    height: DAY_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    fontSize: 15,
    fontWeight: "400",
    color: Tokens.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  otherMonthText: {
    color: Tokens.textTertiary,
  },
  todayDay: {
    borderWidth: 1.5,
    borderColor: '#1A6872',
  },
  todayDayText: {
    color: Tokens.textPrimary,
    fontWeight: "600",
  },
  selectedDay: {
    backgroundColor: '#1A6872',
  },
  selectedDayText: {
    color: Tokens.surfaceRaised,
    fontWeight: "600",
  },
  wheelContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelPicker: {
    width: SCREEN_WIDTH - CALENDAR_PADDING * 2,
    height: 200,
  },
  wheelGoButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: Tokens.accent,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelGoButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.surfaceRaised,
  },
});

const dotStyles = StyleSheet.create({
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
});

export default Calendar;
