import { Calendar } from "@/components/Calendar";
import { GoalsPopup } from "@/components/GoalsPopup";
import { GoalsWizard } from "@/components/goals/GoalsWizard";
import { NotesEditor } from "@/components/NotesEditor";
import { SettingsModal } from "@/components/SettingsModal";
import { useAppStore } from "@/store/app-store";
import { Ionicons } from "@expo/vector-icons";
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
  const goals = useAppStore((state) => state.goals);

  // Filter entries for current date - memoized to prevent unnecessary re-renders
  const entries = React.useMemo(
    () => allEntries.filter((entry) => entry.date === currentDate),
    [allEntries, currentDate]
  );
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGoalsPopup, setShowGoalsPopup] = useState(false);
  const [showGoalsWizard, setShowGoalsWizard] = useState(false);
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
  const openCalendar = () => {
    // Save current document before opening calendar
    saveCurrentDocument();
    setShowCalendar(true);
  };

  // Handle calendar date selection
  const handleCalendarSelect = (newDateString: string) => {
    setCurrentDate(newDateString);
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
          const entryCarbs = entry.items.reduce(
            (sum, item) => sum + (item.macros?.carbs || 0),
            0,
          );
          return {
            kcal: acc.kcal + (entry.inlineKcal || 0),
            protein: acc.protein + entryProtein,
            fat: acc.fat + entryFat,
            carbs: acc.carbs + entryCarbs,
          };
        }
        return acc;
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    );
  }, [entries]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <View style={styles.headerPlaceholder} />

        <View style={styles.dateNavigationContainer}>
          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate("prev")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={20} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity onPress={openCalendar}>
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

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={22} color="#333" />
        </TouchableOpacity>
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

      {/* Daily Totals Bar - Tap to open goals popup */}
      <TouchableOpacity
        style={styles.totalsBar}
        onPress={() => setShowGoalsPopup(true)}
        activeOpacity={0.8}
      >
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{Math.round(dailyTotals.kcal)}</Text>
          <Text style={styles.totalLabel}>cal</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>
            {Math.round(dailyTotals.protein)}
          </Text>
          <Text style={styles.totalLabel}>p</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{Math.round(dailyTotals.fat)}</Text>
          <Text style={styles.totalLabel}>f</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{Math.round(dailyTotals.carbs)}</Text>
          <Text style={styles.totalLabel}>c</Text>
        </View>
      </TouchableOpacity>

      {/* Custom Calendar */}
      <Calendar
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        selectedDate={currentDate}
        onSelectDate={handleCalendarSelect}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Goals Popup */}
      <GoalsPopup
        visible={showGoalsPopup}
        onClose={() => setShowGoalsPopup(false)}
        onSetupPress={() => setShowGoalsWizard(true)}
        onEditPress={() => setShowGoalsWizard(true)}
        goals={goals}
        consumed={dailyTotals}
      />

      {/* Goals Wizard */}
      <GoalsWizard
        visible={showGoalsWizard}
        onClose={() => setShowGoalsWizard(false)}
        existingGoals={goals}
      />
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 60,
  },
  headerPlaceholder: {
    width: 36,
  },
  settingsButton: {
    padding: 7,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily: "System",
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  dateButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    fontFamily: "System",
    fontWeight: "600",
    color: "#333",
  },
  totalLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
    fontFamily: "System",
    fontWeight: "400",
  },
  totalDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#ddd",
  },
});
