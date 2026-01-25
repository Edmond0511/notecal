import { NotesEditor } from "@/components/NotesEditor";
import { useAppStore } from "@/store/app-store";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  // Get all entries and currentDate from store - single subscription
  const allEntries = useAppStore((state) => state.entries);
  const currentDate = useAppStore((state) => state.currentDate);
  const addEntry = useAppStore((state) => state.addEntry);
  const updateEntry = useAppStore((state) => state.updateEntry);
  const deleteEntry = useAppStore((state) => state.deleteEntry);
  const setCurrentDate = useAppStore((state) => state.setCurrentDate);
  const saveDocument = useAppStore((state) => state.saveDocument);
  const getDocument = useAppStore((state) => state.getDocument);

  // Filter entries for current date in render (ensures fresh data)
  const entries = allEntries.filter((entry) => entry.date === currentDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [currentDocumentText, setCurrentDocumentText] = useState("");

  // Load document text for current date
  React.useEffect(() => {
    const document = getDocument(currentDate);
    if (document) {
      setCurrentDocumentText(document.content);
    } else {
      setCurrentDocumentText("");
    }
  }, [currentDate, getDocument]);

  // Convert YYYYMMDD string to Date object
  const stringToDate = (dateString: string): Date => {
    return new Date(
      Number.parseInt(dateString.substring(0, 4)),
      Number.parseInt(dateString.substring(4, 6)) - 1,
      Number.parseInt(dateString.substring(6, 8)),
    );
  };

  // Date navigation functions
  const formatDateDisplay = (dateString: string) => {
    const today = new Date();
    const date = stringToDate(dateString);

    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }

    // Otherwise show formatted date
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  // Save current document before navigation
  const saveCurrentDocument = () => {
    if (currentDocumentText.trim()) {
      saveDocument(currentDate, currentDocumentText.trim());
    }
  };

  const navigateDate = (direction: "prev" | "next") => {
    // Save current document before changing date
    saveCurrentDocument();

    const current = stringToDate(currentDate);

    const newDate = new Date(current);
    if (direction === "prev") {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }

    const newDateString =
      newDate.getFullYear().toString() +
      (newDate.getMonth() + 1).toString().padStart(2, "0") +
      newDate.getDate().toString().padStart(2, "0");

    setCurrentDate(newDateString);
  };

  // Calendar picker function
  const openDatePicker = () => {
    // Save current document before opening calendar
    saveCurrentDocument();
    setTempDate(stringToDate(currentDate));
    setShowDatePicker(true);
  };

  // Handle iOS date picker change
  const onDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === "set" && selectedDate) {
      const newDateString =
        selectedDate.getFullYear().toString() +
        (selectedDate.getMonth() + 1).toString().padStart(2, "0") +
        selectedDate.getDate().toString().padStart(2, "0");
      setCurrentDate(newDateString);
    }
    setShowDatePicker(false);
  };

  // Handle document text changes from NotesEditor
  const handleDocumentTextChange = (text: string) => {
    setCurrentDocumentText(text);
  };

  // Calculate daily totals from entries
  const dailyTotals = React.useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        if (entry.status === "ok" && entry.items) {
          const entryProtein = entry.items.reduce(
            (sum, item) => sum + (item.macros?.protein || 0),
            0,
          );
          const entryFat = entry.items.reduce(
            (sum, item) => sum + (item.macros?.fat || 0),
            0,
          );
          return {
            kcal: acc.kcal + (entry.inlineKcal || 0),
            protein: acc.protein + entryProtein,
            fat: acc.fat + entryFat,
          };
        }
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0 },
    );
  }, [entries]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <View style={styles.dateNavigationContainer}>
          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate("prev")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={20} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity onPress={openDatePicker}>
            <View style={styles.dateButtonContent}>
              <Text style={styles.dateText}>
                {formatDateDisplay(currentDate)}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate("next")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-forward" size={20} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      <NotesEditor
        entries={entries}
        initialDocumentText={currentDocumentText}
        onDocumentTextChange={handleDocumentTextChange}
        onAddEntry={addEntry}
        onUpdateEntry={updateEntry}
        onDeleteEntry={deleteEntry}
        currentDate={currentDate}
      />

      {/* Daily Totals Bar */}
      <View style={styles.totalsBar}>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{Math.round(dailyTotals.kcal)}</Text>
          <Text style={styles.totalLabel}>cal</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>
            {Math.round(dailyTotals.protein)}
          </Text>
          <Text style={styles.totalLabel}>protein</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{Math.round(dailyTotals.fat)}</Text>
          <Text style={styles.totalLabel}>fat</Text>
        </View>
      </View>

      {/* DateTimePicker - iOS calendar with overlay */}
      {showDatePicker && (
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerContainer}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Select Date</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={onDateChange}
              style={styles.datePicker}
              textColor="#000000"
              accentColor="#007AFF"
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
  },
  dateNavigationContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fafaf8ff",
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navButtonCompact: {
    padding: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  dateButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  calendarIcon: {
    marginRight: 4,
  },
  datePickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  datePickerContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    width: "90%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000000",
  },
  datePickerCloseButton: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: "#F0F8FF",
  },
  datePicker: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
  },
  totalsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffffcc",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    borderRadius: 45,
    alignSelf: "center",
    width: "80%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  totalItem: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  totalLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  totalDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#ddd",
  },
});
