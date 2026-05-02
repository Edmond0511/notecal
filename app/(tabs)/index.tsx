import { AddActionMenu } from "@/components/AddActionMenu";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { Calendar } from "@/components/Calendar";
import { DatabaseSearchModal } from "@/components/DatabaseSearchModal";
import { MealBuilderModal } from "@/components/MealBuilderModal";
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
  NutritionNotFoodError,
  NutritionRateLimitError,
  resolveNutritionFromPhoto,
} from "@/services/nutritionApi";
import { useAppStore } from "@/store/app-store";
import { useEntriesForDate } from "@/store/selectors";
import { BarcodeProduct, CustomMeal, DatabaseSearchResult, Macros, SavedEntry } from "@/types";
import { dateToIndex, formatDateDisplay, indexToDate } from "@/utils/dateUtils";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  Keyboard,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { InfinitePagerImperativeApi } from "react-native-infinite-pager";
import InfinitePager from "react-native-infinite-pager";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const PAGE_WRAPPER_STYLE = { flex: 1 } as const;
const PAGER_ANIMATION_CONFIG = {
  damping: 20,
  mass: 0.2,
  stiffness: 100,
  overshootClamping: false,
} as const;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const currentDate = useAppStore((state) => state.currentDate);
  const setCurrentDate = useAppStore((state) => state.setCurrentDate);
  const goals = useAppStore((state) => state.goals);
  const setPendingInsertion = useAppStore((state) => state.setPendingInsertion);
  const addEntry = useAppStore((state) => state.addEntry);
  const { isOnline } = useNetworkStatus();

  const pagerRef = useRef<InfinitePagerImperativeApi>(null);

  // Track pager animation position — ref-only to avoid re-renders
  const pageAnim = useSharedValue(0);
  const isPagerSettledRef = useRef(true);

  const updatePagerSettled = useCallback((settled: boolean) => {
    isPagerSettledRef.current = settled;
  }, []);

  useAnimatedReaction(
    () => Math.abs(pageAnim.value - Math.round(pageAnim.value)) < 0.01,
    (settled, prevSettled) => {
      if (settled !== prevSettled) {
        runOnJS(updatePagerSettled)(settled);
      }
    },
  );

  // O(1) indexed lookup for current date entries (for TotalsBar)
  const entries = useEntriesForDate(currentDate);

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
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [editingMeal, setEditingMeal] = useState<CustomMeal | null>(null);
  const [photoToastState, setPhotoToastState] = useState<PhotoToastState>({
    type: "idle",
  });

  // --- Pager callbacks ---

  const handlePageChange = useCallback(
    (index: number) => {
      const newDate = indexToDate(index);
      if (newDate === useAppStore.getState().currentDate) return;
      setCurrentDate(newDate);
      Keyboard.dismiss();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setCurrentDate],
  );

  const navigateDate = useCallback((direction: "prev" | "next") => {
    if (direction === "prev") {
      pagerRef.current?.decrementPage({ animated: true });
    } else {
      pagerRef.current?.incrementPage({ animated: true });
    }
  }, []);

  const openCalendar = useCallback(() => {
    Keyboard.dismiss();
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

  // Safe area top + header height so content starts below the floating header
  const contentTopInset = insets.top + 60;

  const renderPage = useCallback(
    ({ index, isActive }: { index: number; isActive: boolean }) => {
      const dateString = indexToDate(index);
      return (
        <DatePage
          dateString={dateString}
          isActive={isActive}
          isPagerSettledRef={isPagerSettledRef}
          isOnline={isOnline}
          contentTopInset={contentTopInset}
        />
      );
    },
    [contentTopInset, isOnline],
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

  const handleSelectSavedEntries = useCallback(
    (entries: SavedEntry[]) => {
      const state = useAppStore.getState();
      let insertText = "";
      entries.forEach((savedEntry) => {
        const newEntry = state.useSavedEntry(savedEntry);
        insertText = insertText
          ? `${insertText}\n${newEntry.rawText}`
          : newEntry.rawText;
      });
      setPendingInsertion({ date: state.currentDate, text: insertText });
      setShowSavedEntriesPopup(false);
    },
    [setPendingInsertion],
  );

  // Stable callbacks for TotalsBar
  const handleAddSavedPress = useCallback(() => {
    setShowAddMenu(true);
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

  const handleUseMeal = useCallback(
    (meal: CustomMeal) => {
      const state = useAppStore.getState();
      const newEntry = state.useCustomMeal(meal);
      setPendingInsertion({ date: state.currentDate, text: newEntry.rawText });
      setShowDatabaseSearch(false);
    },
    [setPendingInsertion],
  );

  const handleOpenMealBuilder = useCallback(
    (meal?: CustomMeal | null) => {
      setEditingMeal(meal ?? null);
      setShowMealBuilder(true);
    },
    [],
  );

  const handleDatabaseSearchAddEntries = useCallback(
    (items: { result: DatabaseSearchResult; servingGrams: number; macroOverrides?: Partial<Macros> }[]) => {
      const state = useAppStore.getState();
      let insertText = "";

      items.forEach(({ result, servingGrams, macroOverrides }, index) => {
        const newEntry = state.addDatabaseSearchEntry(
          result,
          servingGrams,
          index,
          macroOverrides,
        );
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

          setPendingInsertion({
            date: state.currentDate,
            text: newEntry.rawText,
          });

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
        } else if (error instanceof NutritionRateLimitError) {
          setPhotoToastState({
            type: "error",
            message:
              error.reason === "minute_limit"
                ? "Slow down — try again in a minute"
                : "Daily AI limit reached. Try again tomorrow.",
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
    (product: BarcodeProduct, selectedServingId?: string) => {
      const state = useAppStore.getState();
      const newEntry = state.addBarcodeEntry(product, selectedServingId);
      setPendingInsertion({ date: state.currentDate, text: newEntry.rawText });
      setShowBarcodeScanner(false);
    },
    [setPendingInsertion],
  );

  const handleBarcodeManualEntry = useCallback(
    (text: string) => {
      const isFreeform = useAppStore.getState().entryMode === "freeform";
      const rawText = isFreeform ? text : `— ${text}`;
      addEntry(rawText);
      const state = useAppStore.getState();
      setPendingInsertion({ date: state.currentDate, text: rawText });
      setShowBarcodeScanner(false);
    },
    [addEntry, setPendingInsertion],
  );

  // Calculate daily totals from entries — single-pass accumulation
  const dailyTotals = React.useMemo(() => {
    let kcal = 0,
      protein = 0,
      fat = 0,
      carbs = 0;
    let fiber = 0,
      sugar = 0,
      sodium = 0,
      potassium = 0,
      water = 0;

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

    return {
      kcal,
      protein,
      fat,
      carbs,
      fiber,
      sugar,
      sodium,
      potassium,
      water,
    };
  }, [entries]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />

      <View style={styles.pagerWrapper}>
        <InfinitePager
          ref={pagerRef}
          pageBuffer={1}
          pageCallbackNode={pageAnim}
          onPageChange={handlePageChange}
          renderPage={renderPage}
          flingVelocity={500}
          minDistance={15}
          animationConfig={PAGER_ANIMATION_CONFIG}
          style={styles.pager}
          pageWrapperStyle={PAGE_WRAPPER_STYLE}
        />
      </View>

      {/* Floating header overlay */}
      <View style={[styles.header, { top: insets.top }]}>
        <LiquidGlassView
          style={[
            styles.dateNavigationContainer,
            !isLiquidGlassSupported && styles.dateNavigationFallback,
          ]}
          interactive
          effect="regular"
          tintColor="rgba(250, 250, 247, 0.3)"
        >
          <TouchableOpacity
            style={styles.navButtonCompact}
            onPress={() => navigateDate("prev")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={Tokens.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openCalendar}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
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
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Tokens.textPrimary}
            />
          </TouchableOpacity>
        </LiquidGlassView>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <LiquidGlassView
            style={[
              styles.settingsGlass,
              !isLiquidGlassSupported && styles.settingsGlassFallback,
            ]}
            interactive
            effect="regular"
            tintColor="rgba(250, 250, 247, 0.3)"
          >
            <Ionicons name="settings-outline" size={20} color="#000" />
          </LiquidGlassView>
        </TouchableOpacity>
      </View>

      {/* TotalsBar: sticks above keyboard during interactive dismiss */}
      <KeyboardStickyView offset={{ closed: 0, opened: 25 }}>
        <View style={styles.bottomBarContainer}>
          <TotalsBar
            isOnline={isOnline}
            onAddSavedPress={handleAddSavedPress}
            onTotalsPress={handleTotalsPress}
          />
        </View>
      </KeyboardStickyView>

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
        onSelectEntries={handleSelectSavedEntries}
      />

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onAddProduct={handleBarcodeProductAdd}
        onAddManualEntry={handleBarcodeManualEntry}
      />

      {/* Database Search Modal (with nested Meal Builder) */}
      <DatabaseSearchModal
        visible={showDatabaseSearch}
        onClose={() => setShowDatabaseSearch(false)}
        onAddEntries={handleDatabaseSearchAddEntries}
        onUseMeal={handleUseMeal}
        onOpenMealBuilder={handleOpenMealBuilder}
      >
        <MealBuilderModal
          visible={showMealBuilder}
          onClose={() => {
            setShowMealBuilder(false);
            setEditingMeal(null);
          }}
          editingMeal={editingMeal}
          nested
        />
      </DatabaseSearchModal>

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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
    zIndex: 10,
  },
  settingsButton: {
    position: "absolute",
    right: 16,
  },
  settingsGlass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsGlassFallback: {
    backgroundColor: Tokens.surface,
    ...Tokens.shadowLight,
  },
  dateNavigationContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateNavigationFallback: {
    backgroundColor: Tokens.surface,
    borderWidth: 1,
    borderColor: Tokens.border,
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
    paddingBottom: 34,
    backgroundColor: "transparent",
    zIndex: 10,
  },
});
