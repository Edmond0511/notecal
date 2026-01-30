import { Ionicons } from "@expo/vector-icons";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CALENDAR_PADDING = 20;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - CALENDAR_PADDING * 2 - 12) / 7);

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelectDate(formatDate(date));
      onClose();
    },
    [onSelectDate, onClose]
  );

  const goToToday = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Backdrop */}
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropPressable} onPress={handleClose} />
        </View>

        {/* Calendar Sheet */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigateMonth("prev")}
              style={styles.navButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={22} color="#333" />
            </TouchableOpacity>

            <View style={styles.monthYearContainer}>
              <Text style={styles.monthText}>{MONTHS[viewMonth]}</Text>
              <Text style={styles.yearText}>{viewYear}</Text>
            </View>

            <TouchableOpacity
              onPress={() => navigateMonth("next")}
              style={styles.navButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-forward" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Weekday Headers */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day, index) => (
              <View key={index} style={styles.weekdayCell}>
                <Text
                  style={[
                    styles.weekdayText,
                    (index === 0 || index === 6) && styles.weekendText,
                  ]}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((item, index) => {
              const dateStr = formatDate(item.date);
              const isSelected = isSameDay(dateStr, selectedDate);
              const isTodayDate = isSameDay(dateStr, todayStr);
              const isWeekend =
                item.date.getDay() === 0 || item.date.getDay() === 6;

              return (
                <TouchableOpacity
                  key={index}
                  style={styles.dayCell}
                  onPress={() => handleSelectDate(item.date)}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.dayInner,
                      isSelected && styles.selectedDay,
                      isTodayDate && !isSelected && styles.todayDay,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !item.isCurrentMonth && styles.otherMonthText,
                        isWeekend && item.isCurrentMonth && styles.weekendDayText,
                        isSelected && styles.selectedDayText,
                        isTodayDate && !isSelected && styles.todayDayText,
                      ]}
                    >
                      {item.date.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer with Today button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.todayButton}
              onPress={goToToday}
              activeOpacity={0.7}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: CALENDAR_PADDING,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
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
    backgroundColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fafaf8",
    alignItems: "center",
    justifyContent: "center",
  },
  monthYearContainer: {
    alignItems: "center",
  },
  monthText: {
    fontSize: 20,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  yearText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#888",
    marginTop: 2,
  },
  weekdayRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginBottom: 8,
  },
  weekdayCell: {
    width: DAY_SIZE,
    alignItems: "center",
  },
  weekdayText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
  },
  weekendText: {
    color: "#bbb",
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
    width: DAY_SIZE - 8,
    height: DAY_SIZE - 8,
    borderRadius: (DAY_SIZE - 8) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "500",
    color: "#333",
  },
  otherMonthText: {
    color: "#ccc",
  },
  weekendDayText: {
    color: "#999",
  },
  selectedDay: {
    backgroundColor: "#1A6872",
  },
  selectedDayText: {
    color: "#fff",
    fontWeight: "600",
  },
  todayDay: {
    backgroundColor: "#E0F2F1",
  },
  todayDayText: {
    color: "#1A6872",
    fontWeight: "600",
  },
  footer: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: "center",
  },
  todayButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#fafaf8",
    borderRadius: 20,
  },
  todayButtonText: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1A6872",
  },
});

export default Calendar;
