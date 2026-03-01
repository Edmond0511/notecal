import { AddActionMenu } from "@/components/AddActionMenu";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { DatabaseSearchModal } from "@/components/DatabaseSearchModal";
import { Calendar } from "@/components/Calendar";
import { DatePage } from "@/components/DatePage";
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
import { Tokens } from "@/constants/theme";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { supabase } from "@/lib/supabase";
import {
  resolveNutritionFromPhoto,
  NutritionNotFoodError,
} from "@/services/nutritionApi";
import { useAppStore } from "@/store/app-store";
import { BarcodeProduct, DatabaseSearchResult, Entry, SavedEntry } from "@/types";
import { dateToIndex, formatDateDisplay, indexToDate } from "@/utils/dateUtils";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
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
import type { InfinitePagerImperativeApi } from "react-native-infinite-pager";
import InfinitePager from "react-native-infinite-pager";
import { SafeAreaView } from "react-native-safe-area-context";

const INPUT_ACCESSORY_VIEW_ID = "totals-bar-accessory";

const PAGE_WRAPPER_STYLE = { flex: 1 } as const;
const PAGER_ANIMATION_CONFIG = {
  damping: 20,
  mass: 0.2,
  stiffness: 100,
  overshootClamping: false,
} as const;

export default function HomeScreen() {
  const currentDate = useAppStore((state) => state.currentDate);
  const setCurrentDate = useAppStore((state) => state.setCurrentDate);
  const goals = useAppStore((state) => state.goals);
  const setPendingInsertion = useAppStore((state) => state.setPendingInsertion);
  const addEntry = useAppStore((state) => state.addEntry);
  const { isOnline } = useNetworkStatus();

  const pagerRef = useRef<InfinitePagerImperativeApi>(null);

  // Filter entries for current date (for TotalsBar) — useShallow avoids
  // re-renders when entries on other dates change.
  const entries = useAppStore(
    useShallow((state) =>
      state.entries.filter((entry: Entry) => entry.date === state.currentDate),
    ),
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
  const [showDatabaseSearch, setShowDatabaseSearch] = useState(false);
  const [photoToastState, setPhotoToastState] = useState<PhotoToastState>({
    type: "idle",
  });

  // --- Pager callbacks ---

  const handlePageChange = useCallback(
    (index: number) => {
      const newDate = indexToDate(index);
      setCurrentDate(newDate);
      Keyboard.dismiss();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setCurrentDate],
  );

  const navigateDate = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "prev") {
        pagerRef.current?.decrementPage({ animated: true });
      } else {
        pagerRef.current?.incrementPage({ animated: true });
      }
    },
    [],
  );

  const openCalendar = useCallback(() => {
    setShowCalendar(true);
  }, []);

  const handleCalendarSelect = useCallback(
    (newDateString: string) => {
      const index = dateToIndex(newDateString);
      pagerRef.current?.setPage(index, { animated: false });
      setCurrentDate(newDateString);
    },
    [setCurrentDate],
  );

  // --- Render page for InfinitePager ---

  const renderPage = useCallback(
    ({ index, isActive }: { index: number; isActive: boolean }) => {
      const dateString = indexToDate(index);
      return (
        <DatePage
          dateString={dateString}
          isActive={isActive}
          inputAccessoryViewID={
            Platform.OS === "ios" ? INPUT_ACCESSORY_VIEW_ID : undefined
          }
        />
      );
    },
    [],
  );

  // --- Insertion handlers (saved entries, barcode, photo, DB search) ---

  const handleSelectSavedEntry = useCallback(
    (savedEntry: SavedEntry) => {
      const state = useAppStore.getState();
      const newEntry = state.useSavedEntry(savedEntry);
      setPendingInsertion({ date: state.currentDate, text: newEntry.rawText });
      setShowSavedEntriesPopup(false);
    },
    [setPendingInsertion],
  );

  // Stable callbacks for TotalsBar
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

  const handleMenuSearchDatabase = useCallback(() => {
    setShowAddMenu(false);
    setShowDatabaseSearch(true);
  }, []);

  const handleDatabaseSearchAddEntries = useCallback(
    (items: { result: DatabaseSearchResult; servingGrams: number }[]) => {
      const state = useAppStore.getState();
      let insertText = '';

      items.forEach(({ result, servingGrams }, index) => {
        const newEntry = state.addDatabaseSearchEntry(result, servingGrams, index);
        insertText = insertText
          ? `${insertText}\n${newEntry.rawText}`
          : newEntry.rawText;
      });

      setPendingInsertion({ date: state.currentDate, text: insertText });
      setShowDatabaseSearch(false);
    },
    [setPendingInsertion],
  );

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
          const state = useAppStore.getState();

          const newEntry = state.addPhotoEntry(
            response.resolved,
            response.totals,
          );

          setPendingInsertion({ date: state.currentDate, text: newEntry.rawText });

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
    [setPendingInsertion],
  );

  const handlePhotoToastDismiss = useCallback(() => {
    setPhotoToastState({ type: "idle" });
  }, []);

  const handlePhotoToastAutoHide = useCallback(() => {
    setPhotoToastState({ type: "idle" });
  }, []);

  const handleBarcodeProductAdd = useCallback(
    (product: BarcodeProduct, servingGrams: number) => {
      const state = useAppStore.getState();
      const newEntry = state.addBarcodeEntry(product, servingGrams);
      setPendingInsertion({ date: state.currentDate, text: newEntry.rawText });
      setShowBarcodeScanner(false);
    },
    [setPendingInsertion],
  );

  const handleBarcodeManualEntry = useCallback(
    (text: string) => {
      const isFreeform = useAppStore.getState().entryMode === 'freeform';
      const rawText = isFreeform ? text : `— ${text}`;
      addEntry(rawText);
      const state = useAppStore.getState();
      setPendingInsertion({ date: state.currentDate, text: rawText });
      setShowBarcodeScanner(false);
    },
    [addEntry, setPendingInsertion],
  );

  // Track keyboard open/close for dual-rendering the totals bar.
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

  // Calculate daily totals from entries — single-pass accumulation
  const dailyTotals = React.useMemo(() => {
    let kcal = 0, protein = 0, fat = 0, carbs = 0;
    let fiber = 0, sugar = 0, sodium = 0, potassium = 0, water = 0;

    for (const entry of entries) {
      if (entry.status !== "ok" || !entry.items) continue;
      kcal += entry.inlineKcal || 0;
      for (const item of entry.items) {
        const m = item.macros;
        if (!m) continue;
        protein += m.protein || 0;
        fat += m.fat || 0;
        carbs += m.carbs || 0;
        fiber += m.fiber || 0;
        sugar += m.sugar || 0;
        sodium += m.sodium || 0;
        potassium += m.potassium || 0;
        water += m.water || 0;
      }
    }

    return { kcal, protein, fat, carbs, fiber, sugar, sodium, potassium, water };
  }, [entries]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />

      <View style={styles.header}>
        <View style={styles.dateNavigationContainer}>
          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate("prev")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
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
            <Ionicons name="chevron-forward" size={20} color={Tokens.textPrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={22} color={Tokens.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pagerWrapper}>
        <InfinitePager
          ref={pagerRef}
          pageBuffer={1}
          onPageChange={handlePageChange}
          renderPage={renderPage}
          flingVelocity={500}
          minDistance={15}
          animationConfig={PAGER_ANIMATION_CONFIG}
          style={styles.pager}
          pageWrapperStyle={PAGE_WRAPPER_STYLE}
        />
      </View>

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
        onSearchDatabasePress={handleMenuSearchDatabase}
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

      {/* Database Search Modal */}
      <DatabaseSearchModal
        visible={showDatabaseSearch}
        onClose={() => setShowDatabaseSearch(false)}
        onAddEntries={handleDatabaseSearchAddEntries}
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
    backgroundColor: Tokens.background,
  },
  header: {
    backgroundColor: Tokens.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
  },
  settingsButton: {
    position: "absolute",
    right: 16,
    padding: 7,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavigationContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.surface,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Tokens.border,
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
    color: Tokens.textPrimary,
    textAlign: "center",
  },
  dateButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pagerWrapper: {
    flex: 1,
  },
  pager: {
    flex: 1,
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
