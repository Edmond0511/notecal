import * as Haptics from "expo-haptics";
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
import Animated, {
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CALENDAR_PADDING = 24;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - CALENDAR_PADDING * 2) / 7);

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

  const goToToday = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const today = new Date();
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
    onSelectDate(getTodayString());
    onClose();
  }, [onSelectDate, onClose]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  // Reset view to selected date when opening
  React.useEffect(() => {
    if (visible) {
      const date = parseDate(selectedDate);
      setViewMonth(date.getMonth());
      setViewYear(date.getFullYear());
    }
  }, [visible, selectedDate]);

  if (!visible) return null;

  const todayStr = getTodayString();

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        {/* Backdrop */}
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.backdrop}
        >
          <Pressable style={styles.backdropPressable} onPress={handleClose} />
        </Animated.View>

        {/* Calendar Sheet */}
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
        >
          {/* Minimal handle line */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header - Month Year with text-based navigation */}
          <Animated.View
            entering={FadeInDown.delay(50).duration(400)}
            style={styles.header}
          >
            <TouchableOpacity
              onPress={() => navigateMonth("prev")}
              style={styles.navButton}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            >
              <Text style={styles.navText}>←</Text>
            </TouchableOpacity>

            <View style={styles.monthYearContainer}>
              <Text style={styles.monthText}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => navigateMonth("next")}
              style={styles.navButton}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            >
              <Text style={styles.navText}>→</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Weekday Headers - ultra light */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.weekdayRow}
          >
            {WEEKDAYS.map((day, index) => (
              <View key={index} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{day}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Calendar Grid */}
          <Animated.View
            entering={FadeInDown.delay(150).duration(400)}
            style={styles.calendarGrid}
          >
            {calendarDays.map((item, index) => {
              const dateStr = formatDate(item.date);
              const isSelected = isSameDay(dateStr, selectedDate);
              const isTodayDate = isSameDay(dateStr, todayStr);

              return (
                <TouchableOpacity
                  key={index}
                  style={styles.dayCell}
                  onPress={() => handleSelectDate(item.date)}
                  activeOpacity={0.5}
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
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* Footer - minimal today link */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.footer}
          >
            <TouchableOpacity
              style={styles.todayButton}
              onPress={goToToday}
              activeOpacity={0.6}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
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
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: CALENDAR_PADDING,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 32,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#e0e0e0",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
  },
  navButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  navText: {
    fontSize: 20,
    color: "#1A6872",
    fontWeight: "300",
  },
  monthYearContainer: {
    alignItems: "center",
  },
  monthText: {
    fontSize: 17,
    fontWeight: "500",
    color: "#1a1a1a",
    letterSpacing: 0.3,
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
    color: "#999",
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#333",
  },
  otherMonthText: {
    color: "#ccc",
  },
  todayDay: {
    backgroundColor: "rgba(26, 104, 114, 0.12)",
  },
  todayDayText: {
    color: "#1A6872",
    fontWeight: "500",
  },
  selectedDay: {
    backgroundColor: "#1A6872",
  },
  selectedDayText: {
    color: "#fff",
    fontWeight: "500",
  },
  footer: {
    paddingTop: 16,
    paddingBottom: 4,
    alignItems: "center",
  },
  todayButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "rgba(26, 104, 114, 0.1)",
    borderRadius: 20,
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A6872",
    letterSpacing: 0.2,
  },
});

export default Calendar;
