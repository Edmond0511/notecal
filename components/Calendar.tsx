import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
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
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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
const CALENDAR_PADDING = 24;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - CALENDAR_PADDING * 2) / 7);

const DOT_COLORS = {
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#EF5350',
} as const;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, sheetAnimatedStyle]}
        >
          {/* Minimal handle line */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header - Today | Month Year | ← → */}
          <View style={styles.navBar}>
            <TouchableOpacity
              onPress={handleGoToToday}
              style={styles.navPill}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              accessibilityHint="Selects today's date"
            >
              <Text style={styles.navPillText}>Today</Text>
            </TouchableOpacity>

            <Text style={styles.monthText} accessibilityRole="header">
              {MONTHS[viewMonth]} {viewYear}
            </Text>

            <View style={styles.navArrows}>
              <TouchableOpacity
                onPress={() => navigateMonth("prev")}
                style={styles.navPill}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigateMonth("next")}
                style={styles.navPill}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={20} color={Tokens.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Weekday Headers - ultra light */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day, index) => (
              <View key={index} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((item, index) => {
              const dateStr = formatDate(item.date);
              const isSelected = isSameDay(dateStr, selectedDate);
              const isTodayDate = isSameDay(dateStr, todayStr);

              const consumed = dateCalorieMap?.[dateStr];

              let dotColor: keyof typeof DOT_COLORS | null = null;
              if (dateCalorieMap && item.isCurrentMonth && consumed && consumed > 0) {
                const isFuture = dateStr > todayStr;
                if (isFuture) {
                  dotColor = 'green';
                } else {
                  const target = goals!.manualTargets?.kcal ?? goals!.targetKcal;
                  dotColor = getDotColor(consumed, target);
                }
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: CALENDAR_PADDING,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  monthText: {
    fontSize: 17,
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: 0.3,
  },
  navArrows: {
    flexDirection: "row",
    gap: 8,
  },
  navPill: {
    backgroundColor: Tokens.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  navPillText: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textPrimary,
  },
  weekdayRow: {
    flexDirection: "row",
    paddingBottom: 12,
  },
  weekdayCell: {
    width: DAY_SIZE,
    alignItems: "center",
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: "400",
    color: Tokens.textSecondary,
    letterSpacing: 0.5,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  dayInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    backgroundColor: Tokens.accentTint,
  },
  todayDayText: {
    color: Tokens.accent,
    fontWeight: "500",
  },
  selectedDay: {
    backgroundColor: Tokens.accent,
  },
  selectedDayText: {
    color: Tokens.surfaceRaised,
    fontWeight: "500",
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
