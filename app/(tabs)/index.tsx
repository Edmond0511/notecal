import { AddActionMenu } from "@/components/AddActionMenu";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { Calendar } from "@/components/Calendar";
import { DatePagerView } from "@/components/DatePagerView";
import { FoodPhotoModal } from "@/components/FoodPhotoModal";
import { GoalsWizard } from "@/components/goals/GoalsWizard";
import { GoalsPopup } from "@/components/GoalsPopup";
import { NutritionGoalsModal } from "@/components/NutritionGoalsModal";
import {
  PhotoProcessingToast,
  type PhotoToastState,
} from "@/components/PhotoProcessingToast";
import { SavedEntriesPopup } from "@/components/SavedEntriesPopup";
import { SettingsModal } from "@/components/SettingsModal";
import { TotalsBar } from "@/components/TotalsBar";
import { WeightTrackingModal } from "@/components/WeightTrackingModal";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { supabase } from "@/lib/supabase";
import {
  resolveNutritionFromPhoto,
  NutritionNotFoodError,
} from "@/services/nutritionApi";
import { useAppStore } from "@/store/app-store";
import { BarcodeProduct, SavedEntry } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const INPUT_ACCESSORY_VIEW_ID = "totals-bar-accessory";

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
  const { isOnline } = useNetworkStatus();

  // Filter entries for current date - memoized to prevent unnecessary re-renders
  const entries = React.useMemo(
    () => allEntries.filter((entry) => entry.date === currentDate),
    [allEntries, currentDate],
  );

  const [showCalendar, setShowCalendar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGoalsPopup, setShowGoalsPopup] = useState(false);
  const [showGoalsWizard, setShowGoalsWizard] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSavedEntriesPopup, setShowSavedEntriesPopup] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showFoodPhoto, setShowFoodPhoto] = useState(false);
  const [photoToastState, setPhotoToastState] = useState<PhotoToastState>({
    type: "idle",
  });
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
    saveDocument(currentDate, currentDocumentText.trim());
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

  // Handle document text changes from NotesEditor (date-aware for pager)
  const handleDocumentTextChange = useCallback(
    (date: string, text: string) => {
      if (date === currentDate) {
        setCurrentDocumentText(text);
      }
      saveDocument(date, text);
    },
    [currentDate, saveDocument],
  );

  // Get document text for any date (used by DatePagerView)
  const getDocumentTextForDate = useCallback(
    (date: string): string => {
      const doc = getDocument(date);
      return doc?.content ?? "";
    },
    [getDocument],
  );

  // Handle date change from pager swipe
  const handleDateChange = useCallback(
    (newDate: string) => {
      const state = useAppStore.getState();
      const currentDoc = state.getDocument(state.currentDate);
      if (currentDoc) {
        state.saveDocument(state.currentDate, currentDoc.content.trim());
      }
      setCurrentDate(newDate);
    },
    [setCurrentDate],
  );

  // Handle saved entry selection
  const handleSelectSavedEntry = useCallback(
    (savedEntry: SavedEntry) => {
      // Create entry with pre-loaded nutrition data (no API call)
      // useSavedEntry is a store function, not a hook - call it directly
      const storeUseSavedEntry = useAppStore.getState().useSavedEntry;
      const newEntry = storeUseSavedEntry(savedEntry);

      // Use the returned entry's rawText (mode-aware from useSavedEntry)
      const newLine = newEntry.rawText;
      const updatedText = currentDocumentText
        ? `${currentDocumentText}\n${newLine}`
        : newLine;
      setCurrentDocumentText(updatedText);
      saveDocument(currentDate, updatedText);

      // Close popup
      setShowSavedEntriesPopup(false);
    },
    [currentDocumentText, currentDate, saveDocument],
  );

  // Stable callbacks for TotalsBar (prevents React.memo invalidation on re-render)
  const handleAddSavedPress = useCallback(() => {
    if (showAccessoryBarRef.current) {
      Keyboard.dismiss();
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        setShowAddMenu(true);
      });
    } else {
      setShowAddMenu(true);
    }
  }, []);
  const handleTotalsPress = useCallback(() => setShowGoalsPopup(true), []);

  const handleMenuSavedEntries = useCallback(() => {
    setShowAddMenu(false);
    setShowSavedEntriesPopup(true);
  }, []);

  const handleMenuLogWeight = useCallback(() => {
    setShowAddMenu(false);
    setShowWeightModal(true);
  }, []);

  const handleMenuScanBarcode = useCallback(() => {
    setShowAddMenu(false);
    setShowBarcodeScanner(true);
  }, []);

  const handleMenuSnapFood = useCallback(() => {
    setShowAddMenu(false);
    setShowFoodPhoto(true);
  }, []);

  const handlePhotoCaptured = useCallback(
    async (base64: string, mimeType: string) => {
      setPhotoToastState({ type: "analyzing" });

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const response = await resolveNutritionFromPhoto(base64, mimeType, {
          userId: user?.id,
        });

        if (response.resolved && response.resolved.length > 0) {
          // Read latest state to avoid stale closure
          const state = useAppStore.getState();
          const latestDoc = state.getDocument(state.currentDate);
          const currentText = latestDoc?.content ?? "";

          const newEntry = state.addPhotoEntry(
            response.resolved,
            response.totals,
          );

          const updatedText = currentText
            ? `${currentText}\n${newEntry.rawText}`
            : newEntry.rawText;
          setCurrentDocumentText(updatedText);
          state.saveDocument(state.currentDate, updatedText);

          setPhotoToastState({
            type: "success",
            itemCount: response.resolved.length,
          });
        } else {
          setPhotoToastState({
            type: "error",
            message: "No food items identified",
          });
        }
      } catch (error) {
        if (error instanceof NutritionNotFoodError) {
          setPhotoToastState({
            type: "error",
            message: "No food items identified",
          });
        } else {
          console.error("[HomeScreen] Photo processing error:", error);
          setPhotoToastState({
            type: "error",
            message: "Failed to analyze photo",
          });
        }
      }
    },
    [],
  );

  const handlePhotoToastDismiss = useCallback(() => {
    setPhotoToastState({ type: "idle" });
  }, []);

  const handlePhotoToastAutoHide = useCallback(() => {
    setPhotoToastState({ type: "idle" });
  }, []);

  const handleBarcodeProductAdd = useCallback(
    (product: BarcodeProduct, servingGrams: number) => {
      const storeAddBarcodeEntry = useAppStore.getState().addBarcodeEntry;
      const newEntry = storeAddBarcodeEntry(product, servingGrams);

      // Update document text
      const newLine = newEntry.rawText;
      const updatedText = currentDocumentText
        ? `${currentDocumentText}\n${newLine}`
        : newLine;
      setCurrentDocumentText(updatedText);
      saveDocument(currentDate, updatedText);

      setShowBarcodeScanner(false);
    },
    [currentDocumentText, currentDate, saveDocument],
  );

  const handleBarcodeManualEntry = useCallback(
    (text: string) => {
      const isFreeform = useAppStore.getState().entryMode === 'freeform';
      const rawText = isFreeform ? text : `— ${text}`;
      addEntry(rawText);

      const updatedText = currentDocumentText
        ? `${currentDocumentText}\n${rawText}`
        : rawText;
      setCurrentDocumentText(updatedText);
      saveDocument(currentDate, updatedText);

      setShowBarcodeScanner(false);
    },
    [currentDocumentText, currentDate, addEntry, saveDocument],
  );

  // Track keyboard open/close for dual-rendering the totals bar.
  // Debounce the "show" transition to filter out brief keyboardWillShow
  // events fired when the TextInput momentarily becomes first responder
  // during swipe gestures (before the gesture handler claims the touch).
  // The hide transition is immediate so the accessory bar never lingers.
  const [showAccessoryBar, setShowAccessoryBar] = useState(false);
  const showAccessoryBarRef = useRef(false);
  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const willShowSub = Keyboard.addListener("keyboardWillShow", () => {
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        showTimer = null;
        showAccessoryBarRef.current = true;
        setShowAccessoryBar(true);
      }, 80);
    });
    const willHideSub = Keyboard.addListener("keyboardWillHide", () => {
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    });
    const didHideSub = Keyboard.addListener("keyboardDidHide", () => {
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      showAccessoryBarRef.current = false;
      setShowAccessoryBar(false);
    });
    return () => {
      willShowSub.remove();
      willHideSub.remove();
      didHideSub.remove();
      if (showTimer) clearTimeout(showTimer);
    };
  }, []);

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
          const entryFiber = entry.items.reduce(
            (sum, item) => sum + (item.macros?.fiber || 0),
            0,
          );
          const entrySugar = entry.items.reduce(
            (sum, item) => sum + (item.macros?.sugar || 0),
            0,
          );
          const entrySodium = entry.items.reduce(
            (sum, item) => sum + (item.macros?.sodium || 0),
            0,
          );
          const entryPotassium = entry.items.reduce(
            (sum, item) => sum + (item.macros?.potassium || 0),
            0,
          );
          const entryWater = entry.items.reduce(
            (sum, item) => sum + (item.macros?.water || 0),
            0,
          );
          return {
            kcal: acc.kcal + (entry.inlineKcal || 0),
            protein: acc.protein + entryProtein,
            fat: acc.fat + entryFat,
            carbs: acc.carbs + entryCarbs,
            fiber: acc.fiber + entryFiber,
            sugar: acc.sugar + entrySugar,
            sodium: acc.sodium + entrySodium,
            potassium: acc.potassium + entryPotassium,
            water: acc.water + entryWater,
          };
        }
        return acc;
      },
      {
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        potassium: 0,
        water: 0,
      },
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

      <DatePagerView
        currentDate={currentDate}
        onDateChange={handleDateChange}
        allEntries={allEntries}
        getDocumentText={getDocumentTextForDate}
        onDocumentTextChange={handleDocumentTextChange}
        onAddEntry={addEntry}
        onUpdateEntry={updateEntry}
        onDeleteEntry={deleteEntry}
        isOnline={isOnline}
        waterTrackingEnabled={goals?.manualTargets?.water !== undefined}
      />

      {/* iOS: Totals bar as native keyboard accessory */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_VIEW_ID}>
          {showAccessoryBar && showAccessoryBarRef.current && (
            <View style={styles.inputAccessoryWrapper}>
              <TotalsBar
                dailyTotals={dailyTotals}
                isOnline={isOnline}
                onAddSavedPress={handleAddSavedPress}
                onTotalsPress={handleTotalsPress}
              />
            </View>
          )}
        </InputAccessoryView>
      )}

      {/* Static bottom bar: always visible, keyboard renders on top natively */}
      <View
        style={styles.bottomBarContainer}
        pointerEvents={
          Platform.OS === "ios" && showAccessoryBar ? "none" : "auto"
        }
      >
        <TotalsBar
          dailyTotals={dailyTotals}
          isOnline={isOnline}
          onAddSavedPress={handleAddSavedPress}
          onTotalsPress={handleTotalsPress}
        />
      </View>

      {/* Photo processing toast */}
      <PhotoProcessingToast
        state={photoToastState}
        onDismiss={handlePhotoToastDismiss}
        onAutoHide={handlePhotoToastAutoHide}
      />

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
        onEditPress={() => setShowGoalsModal(true)}
        goals={goals}
        consumed={dailyTotals}
      />

      {/* Nutrition Goals Modal */}
      <NutritionGoalsModal
        visible={showGoalsModal}
        onClose={() => setShowGoalsModal(false)}
      />

      {/* Goals Wizard */}
      <GoalsWizard
        visible={showGoalsWizard}
        onClose={() => setShowGoalsWizard(false)}
        existingGoals={goals}
      />

      {/* Add Action Menu */}
      <AddActionMenu
        visible={showAddMenu}
        onClose={() => setShowAddMenu(false)}
        onSavedEntriesPress={handleMenuSavedEntries}
        onScanBarcodePress={handleMenuScanBarcode}
        onLogWeightPress={handleMenuLogWeight}
        onSnapFoodPress={handleMenuSnapFood}
      />

      {/* Saved Entries Popup */}
      <SavedEntriesPopup
        visible={showSavedEntriesPopup}
        onClose={() => setShowSavedEntriesPopup(false)}
        onSelectEntry={handleSelectSavedEntry}
      />

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onAddProduct={handleBarcodeProductAdd}
        onAddManualEntry={handleBarcodeManualEntry}
      />

      {/* Food Photo Modal */}
      <FoodPhotoModal
        visible={showFoodPhoto}
        onClose={() => setShowFoodPhoto(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* Weight Tracking Modal */}
      <WeightTrackingModal
        visible={showWeightModal}
        onClose={() => setShowWeightModal(false)}
        openToLog
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
  bottomBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 50,
    backgroundColor: "transparent",
    zIndex: 10,
  },
  inputAccessoryWrapper: {
    paddingTop: 0,
    paddingBottom: 16,
    backgroundColor: "transparent",
  },
});
