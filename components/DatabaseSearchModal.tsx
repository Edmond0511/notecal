import { AnimatedDigits } from "@/components/AnimatedDigits";
import { MealNutritionFactsModal } from "@/components/MealNutritionFactsModal";
import { EditNutrientPopup } from "@/components/NutritionReasoningPopup";
import { Tokens } from "@/constants/theme";
// barcodeService imports removed — FS items use native servings
import {
  fetchFoodDetail,
  FoodSearchError,
  searchFoodDatabase,
} from "@/services/foodSearchApi";
import { mmkv } from "@/lib/mmkv";
import { useAppStore } from "@/store/app-store";
import {
  CommonPortion,
  CustomMeal,
  CustomMealItem,
  DatabaseSearchResult,
  ExtendedNutrients,
  FatSecretServing,
  Macros,
} from "@/types";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import * as Haptics from "expo-haptics";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import {
  KeyboardAwareScrollView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOutUp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;
const TEAL = "#1A6872";
const DEBOUNCE_MS = 400;

const MACRO_COLORS = {
  calories: { primary: "#FF6B35", secondary: "#FFE5D9" },
  protein: { primary: "#4A90D9", secondary: "#E3F2FD" },
  fat: { primary: "#F5A623", secondary: "#FFF8E7" },
  carbs: { primary: "#9B6B9E", secondary: "#F3E5F5" },
};

const MACRO_ICONS = {
  calories: faFireFlameCurved as IconProp,
  protein: faDrumstickBite as IconProp,
  fat: faDroplet as IconProp,
  carbs: faWheatAwn as IconProp,
};

type ModalState =
  | { type: "idle" }
  | { type: "searching" }
  | { type: "results"; results: DatabaseSearchResult[] }
  | { type: "empty" }
  | { type: "error"; message: string }
  | { type: "detail"; result: DatabaseSearchResult };

interface SelectedItem {
  id: string;
  result: DatabaseSearchResult;
  servingGrams: number;
  portions: CommonPortion[];
  fsServings: FatSecretServing[];
  selectedServingId?: string;
}

interface DatabaseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onAddEntries: (
    items: { result: DatabaseSearchResult; servingGrams: number }[],
  ) => void;
  onUseMeal?: (meal: CustomMeal) => void;
  onOpenMealBuilder?: (meal?: CustomMeal | null) => void;
  nested?: boolean;
  initialResult?: DatabaseSearchResult | null;
  initialServingGrams?: number;
  onUpdateEntry?: (item: { result: DatabaseSearchResult; servingGrams: number }) => void;
  onRemoveEntry?: () => void;
  /**
   * Optional content rendered inside this modal's <Modal> view. Used to nest
   * other modals (e.g. MealBuilder) so they stack on iOS instead of competing
   * as sibling top-level Modals.
   */
  children?: React.ReactNode;
}

export function DatabaseSearchModal({
  visible,
  onClose,
  onAddEntries,
  onUseMeal,
  onOpenMealBuilder,
  nested,
  initialResult,
  initialServingGrams,
  onUpdateEntry,
  onRemoveEntry,
  children,
}: DatabaseSearchModalProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ModalState>({ type: "idle" });
  const [searchText, setSearchText] = useState("");
  const [servingGrams, setServingGrams] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [commonResults, setCommonResults] = useState<DatabaseSearchResult[]>(
    [],
  );
  const [brandedResults, setBrandedResults] = useState<DatabaseSearchResult[]>(
    [],
  );
  const [portions, setPortions] = useState<CommonPortion[]>([]);
  const [selectedPortionIndex, setSelectedPortionIndex] = useState<
    number | null
  >(null);
  const [portionsLoading, setPortionsLoading] = useState(false);
  const [selectedFsServingId, setSelectedFsServingId] = useState<string | null>(
    null,
  );
  const [macroOverrides, setMacroOverrides] = useState<
    Partial<Record<"kcal" | "protein" | "fat" | "carbs", number>>
  >({});
  const [editMacroPopup, setEditMacroPopup] = useState<{
    nutrientKey: "kcal" | "protein" | "fat" | "carbs";
    currentValue: number;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  const showGlass = isLiquidGlassSupported;

  const entries = useAppStore((s) => s.entries);
  const savedEntries = useAppStore((s) => s.savedEntries);

  // Tab state: "search" or "meals"
  const [activeTab, setActiveTab] = useState<"search" | "meals">("search");

  // My Meals state
  const customMeals = useAppStore((s) => s.customMeals);
  const deleteCustomMeal = useAppStore((s) => s.deleteCustomMeal);
  const [mealsSearchText, setMealsSearchText] = useState("");
  const mealSwipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const mealsSearchInputRef = useRef<TextInput>(null);

  const sortedMeals = useMemo(() => {
    const query = mealsSearchText.trim().toLowerCase();
    const filtered = query.length > 0
      ? customMeals.filter((m) => m.name.toLowerCase().includes(query))
      : customMeals;
    return [...filtered].sort(
      (a, b) =>
        new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
    );
  }, [customMeals, mealsSearchText]);

  const RECENTLY_LOGGED_CLEARED_KEY = "recently-logged-cleared-at";
  const [recentlyClearedAt, setRecentlyClearedAt] = useState<number>(
    () => mmkv.getNumber(RECENTLY_LOGGED_CLEARED_KEY) ?? 0,
  );

  const handleClearRecentlyLogged = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const now = Date.now();
    mmkv.set(RECENTLY_LOGGED_CLEARED_KEY, now);
    setRecentlyClearedAt(now);
  }, []);

  // Recently logged: show most recent database-search items when search bar is empty
  const recentlyLoggedResults = useMemo((): DatabaseSearchResult[] => {
    if (searchText.trim().length > 0) return [];

    const seen = new Map<
      string,
      { result: DatabaseSearchResult; updatedAt: Date }
    >();

    const isDbSearchItem = (item: { id: string }) =>
      item.id.includes("dbsearch");

    // Entries only — most recent first, only items added via database search
    const sortedEntries = [...entries]
      .filter((e) => e.status === "ok")
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

    for (const entry of sortedEntries) {
      const entryTime = new Date(entry.updatedAt).getTime();
      if (entryTime <= recentlyClearedAt) continue;

      for (const item of entry.items) {
        if (!isDbSearchItem(item)) continue;
        const key = item.label.toLowerCase();
        if (seen.has(key)) continue;

        if (item.source === "FS") {
          // FatSecret items: reconstruct from fsServings if available
          seen.set(key, {
            result: {
              source: "FS",
              foodId: item.sourceId,
              name: item.label,
              brand: item.brand,
              macrosPer100g: item.macros,
              defaultServingG: item.qty > 0 ? item.qty : 100,
              defaultServingLabel:
                item.qty > 0 ? `${item.qty}${item.unit}` : undefined,
              fsServings: item.fsServings,
              defaultServingMacros: item.macros,
              extendedNutrientsPer100g: item.extendedNutrientsPer100g,
            },
            updatedAt: new Date(entry.updatedAt),
          });
        } else {
          // Legacy FDC/OFF items
          const isFdc =
            item.source === "FDC" && !isNaN(Number(item.sourceId));
          const macrosPer100g: Macros =
            item.qty > 0
              ? {
                  kcal: Math.round((item.macros.kcal / item.qty) * 100),
                  protein:
                    Math.round(
                      (item.macros.protein / item.qty) * 100 * 10,
                    ) / 10,
                  fat:
                    Math.round((item.macros.fat / item.qty) * 100 * 10) /
                    10,
                  carbs:
                    Math.round(
                      (item.macros.carbs / item.qty) * 100 * 10,
                    ) / 10,
                  ...(item.macros.fiber != null && {
                    fiber:
                      Math.round(
                        (item.macros.fiber / item.qty) * 100 * 10,
                      ) / 10,
                  }),
                  ...(item.macros.sugar != null && {
                    sugar:
                      Math.round(
                        (item.macros.sugar / item.qty) * 100 * 10,
                      ) / 10,
                  }),
                  ...(item.macros.sodium != null && {
                    sodium: Math.round(
                      (item.macros.sodium / item.qty) * 100,
                    ),
                  }),
                  ...(item.macros.potassium != null && {
                    potassium: Math.round(
                      (item.macros.potassium / item.qty) * 100,
                    ),
                  }),
                }
              : item.macros;
          seen.set(key, {
            result: {
              source: isFdc ? "FDC" : "OFF",
              ...(isFdc
                ? { fdcId: Number(item.sourceId) }
                : { offId: `local-${key}` }),
              name: item.label,
              brand: item.brand,
              macrosPer100g,
              defaultServingG: item.qty > 0 ? item.qty : 100,
              defaultServingLabel:
                item.qty > 0 ? `${item.qty}${item.unit}` : undefined,
              portions: item.commonPortions,
              extendedNutrientsPer100g: item.extendedNutrientsPer100g,
            },
            updatedAt: new Date(entry.updatedAt),
          });
        }
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5)
      .map((v) => v.result);
  }, [searchText, entries, recentlyClearedAt]);

  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [editingSelectedId, setEditingSelectedId] = useState<string | null>(
    null,
  );
  const selectionIdCounter = useRef(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSearchText("");
      setSelectedPortionIndex(null);
      setCommonResults([]);
      setBrandedResults([]);
      setPortions([]);
      setPortionsLoading(false);
      setSelectedItems([]);
      setEditingSelectedId(null);
      selectionIdCounter.current = 0;
      translateY.value = 0;
      setActiveTab("search");
      setMealsSearchText("");
      setMacroOverrides({});
      setShowNutritionFacts(false);

      if (initialResult) {
        // Open directly to detail view
        const result = initialResult;
        if (result.source === "FS" && result.fsServings?.length) {
          const defaultFs =
            result.fsServings.find((s) => s.metricUnit === "g") ??
            result.fsServings[0];
          setSelectedFsServingId(defaultFs.servingId);
        } else {
          setSelectedFsServingId(null);
        }
        setServingGrams(
          initialServingGrams
            ? Math.round(initialServingGrams).toString()
            : (result.defaultServingG ?? 100).toString(),
        );
        setState({ type: "detail", result });

        if (result.source === "FS" && result.foodId) {
          if (result.fsServings?.length) {
            setPortions([]);
            setPortionsLoading(false);
          } else {
            setPortionsLoading(true);
            fetchFoodDetail(result.foodId)
              .then((servings) => {
                result.fsServings = servings;
              })
              .finally(() => setPortionsLoading(false));
          }
        } else if (result.portions?.length) {
          setPortions(result.portions);
        } else {
          setPortions([]);
        }
      } else {
        setState({ type: "idle" });
        setServingGrams("");
        setSelectedFsServingId(null);
      }
    }
  }, [visible]);

  // Track keyboard height
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", (e) => {
      LayoutAnimation.configureNext({
        duration: e.duration,
        update: { type: LayoutAnimation.Types.keyboard },
      });
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardWillHide", (e) => {
      LayoutAnimation.configureNext({
        duration: e.duration,
        update: { type: LayoutAnimation.Types.keyboard },
      });
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = searchText.trim();
    if (query.length < 2) {
      if (state.type !== "detail") setState({ type: "idle" });
      return;
    }

    setState({ type: "searching" });
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await searchFoodDatabase(query);
        setCommonResults(response.common);
        setBrandedResults(response.branded);

        if (response.common.length === 0 && response.branded.length === 0) {
          setState({ type: "empty" });
        } else {
          setState({
            type: "results",
            results: [...response.common, ...response.branded],
          });
        }
      } catch (err) {
        const message =
          err instanceof FoodSearchError ? err.message : "Something went wrong";
        setState({ type: "error", message });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const handleSelectResult = useCallback((result: DatabaseSearchResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setSelectedPortionIndex(null);
    setEditingSelectedId(null);
    setMacroOverrides({});
    setShowNutritionFacts(false);
    // Set default serving size + FS serving selection
    if (result.source === "FS" && result.fsServings?.length) {
      const defaultFs =
        result.fsServings.find((s) => s.metricUnit === "g") ??
        result.fsServings[0];
      setSelectedFsServingId(defaultFs.servingId);
      setServingGrams(
        defaultFs.metricAmount
          ? Math.round(defaultFs.metricAmount).toString()
          : "100",
      );
    } else {
      setSelectedFsServingId(null);
      const defaultServing = result.defaultServingG ?? 100;
      setServingGrams(defaultServing.toString());
    }
    setState({ type: "detail", result });

    // Use cached portions if available, otherwise fetch from API
    if (result.source === "FS" && result.foodId) {
      if (result.fsServings?.length) {
        setPortions([]);
        setPortionsLoading(false);
      } else {
        setPortionsLoading(true);
        fetchFoodDetail(result.foodId)
          .then((servings) => {
            result.fsServings = servings;
          })
          .finally(() => setPortionsLoading(false));
      }
    } else if (result.portions?.length) {
      setPortions(result.portions);
      setPortionsLoading(false);
    } else {
      setPortions([]);
      setPortionsLoading(false);
    }
  }, []);

  // Quick-add from result card "+" button
  const handleQuickAdd = useCallback(
    (result: DatabaseSearchResult) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Toggle: if already selected, remove it
      const existing = selectedItems.find(
        (item) =>
          item.result.source === result.source &&
          (result.foodId
            ? item.result.foodId === result.foodId
            : result.fdcId
              ? item.result.fdcId === result.fdcId
              : item.result.offId === result.offId),
      );
      if (existing) {
        setSelectedItems((prev) =>
          prev.filter((item) => item.id !== existing.id),
        );
        return;
      }

      const defaultServing = result.defaultServingG ?? 100;
      const id = `sel-${++selectionIdCounter.current}`;
      setSelectedItems((prev) => [
        ...prev,
        {
          id,
          result,
          servingGrams: defaultServing,
          portions: [],
          fsServings: [],
        },
      ]);

      // Fetch servings in the background for FS items
      if (
        result.source === "FS" &&
        result.foodId &&
        !result.fsServings?.length
      ) {
        fetchFoodDetail(result.foodId).then((servings) => {
          setSelectedItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, fsServings: servings } : item,
            ),
          );
        });
      }
    },
    [selectedItems],
  );

  // Check if a result is already in selection
  const isResultSelected = useCallback(
    (result: DatabaseSearchResult) => {
      return selectedItems.some(
        (item) =>
          item.result.source === result.source &&
          (result.foodId
            ? item.result.foodId === result.foodId
            : result.fdcId
              ? item.result.fdcId === result.fdcId
              : item.result.offId === result.offId),
      );
    },
    [selectedItems],
  );

  const handleBackToResults = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingSelectedId(null);
    const all = [...commonResults, ...brandedResults];
    if (all.length > 0) {
      setState({ type: "results", results: all });
    } else {
      setState({ type: "idle" });
    }
    setServingGrams("");
    setSelectedPortionIndex(null);
    setSelectedFsServingId(null);
  }, [commonResults, brandedResults]);

  const handleAdd = useCallback(() => {
    if (state.type !== "detail") return;
    const grams = parseFloat(servingGrams) || 100;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Attach fetched portions/servings to the result
    let resultWithPortions =
      portions.length > 0 ? { ...state.result, portions } : { ...state.result };
    // For FS items, attach the selected serving so the store picks it up
    if (
      resultWithPortions.source === "FS" &&
      selectedFsServingId &&
      resultWithPortions.fsServings?.length
    ) {
      const selectedServing = resultWithPortions.fsServings.find(
        (s) => s.servingId === selectedFsServingId,
      );
      if (selectedServing) {
        // Reorder so the selected serving is first — store picks first gram or first overall
        resultWithPortions = {
          ...resultWithPortions,
          fsServings: [
            selectedServing,
            ...resultWithPortions.fsServings.filter(
              (s) => s.servingId !== selectedFsServingId,
            ),
          ],
        };
      }
    }

    if (editingSelectedId) {
      // Update existing selected item
      setSelectedItems((prev) =>
        prev.map((item) =>
          item.id === editingSelectedId
            ? {
                ...item,
                result: resultWithPortions,
                servingGrams: grams,
                portions,
              }
            : item,
        ),
      );
      setEditingSelectedId(null);
      // Go back to results
      const allAfterEdit = [...commonResults, ...brandedResults];
      if (allAfterEdit.length > 0) {
        setState({ type: "results", results: allAfterEdit });
      } else {
        setState({ type: "idle" });
      }
      setServingGrams("");
      setSelectedPortionIndex(null);
    } else if (selectedItems.length > 0) {
      // Multi-select mode: add to selection, go back to results
      const id = `sel-${++selectionIdCounter.current}`;
      setSelectedItems((prev) => [
        ...prev,
        {
          id,
          result: resultWithPortions,
          servingGrams: grams,
          portions,
          fsServings: resultWithPortions.fsServings ?? [],
        },
      ]);
      const allAfterAdd = [...commonResults, ...brandedResults];
      if (allAfterAdd.length > 0) {
        setState({ type: "results", results: allAfterAdd });
      } else {
        setState({ type: "idle" });
      }
      setServingGrams("");
      setSelectedPortionIndex(null);
    } else {
      // Single-item quick flow
      if (initialResult && onUpdateEntry) {
        onUpdateEntry({ result: resultWithPortions, servingGrams: grams, macroOverrides: { ...macroOverrides } });
        onClose();
      } else {
        onAddEntries([{ result: resultWithPortions, servingGrams: grams, macroOverrides: { ...macroOverrides } }]);
      }
    }
  }, [
    state,
    servingGrams,
    portions,
    onAddEntries,
    onClose,
    initialResult,
    onUpdateEntry,
    macroOverrides,
    editingSelectedId,
    selectedItems.length,
    commonResults,
    brandedResults,
  ]);

  // Submit all selected items
  const handleSubmitSelection = useCallback(() => {
    if (selectedItems.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddEntries(
      selectedItems.map(({ result, servingGrams, portions: p }) => ({
        result: p.length > 0 ? { ...result, portions: p } : result,
        servingGrams,
      })),
    );
  }, [selectedItems, onAddEntries]);

  // Remove item from selection
  const handleRemoveSelected = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Tap chip to edit in detail view
  const handleEditSelected = useCallback((selected: SelectedItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setEditingSelectedId(selected.id);
    setServingGrams(selected.servingGrams.toString());
    setSelectedPortionIndex(null);
    setPortions(selected.portions);
    setPortionsLoading(false);
    setState({ type: "detail", result: selected.result });

    // Re-fetch servings if we don't have them for FS items
    if (
      selected.result.source === "FS" &&
      selected.result.foodId &&
      !selected.result.fsServings?.length
    ) {
      setPortionsLoading(true);
      fetchFoodDetail(selected.result.foodId)
        .then((servings) => {
          selected.result.fsServings = servings;
        })
        .finally(() => setPortionsLoading(false));
    }
  }, []);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  // My Meals callbacks
  const handleMealTap = useCallback(
    (meal: CustomMeal) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onUseMeal?.(meal);
    },
    [onUseMeal],
  );

  const handleMealEdit = useCallback((meal: CustomMeal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenMealBuilder?.(meal);
  }, [onOpenMealBuilder]);

  const handleMealDelete = useCallback(
    (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      mealSwipeableRefs.current.get(id)?.close();
      deleteCustomMeal(id);
    },
    [deleteCustomMeal],
  );

  const handleMealNew = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenMealBuilder?.(null);
  }, [onOpenMealBuilder]);

  const renderMealDeleteAction = useCallback(
    (id: string) => (
      <TouchableOpacity
        style={styles.mealDeleteAction}
        onPress={() => handleMealDelete(id)}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
      </TouchableOpacity>
    ),
    [handleMealDelete],
  );

  const handleServingStep = useCallback(
    (delta: number) => {
      const current = parseFloat(servingGrams) || 100;
      const next = Math.max(1, current + delta);
      setServingGrams(next.toString());
      setSelectedPortionIndex(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [servingGrams],
  );

  // Pan to dismiss
  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
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
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
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

  // Compute scaled macros for detail view
  const previewMacrosBase: Macros | null = useMemo(() => {
    if (state.type !== "detail") return null;
    const result = state.result;

    // FS items: scale macros based on gram stepper relative to reference serving
    if (result.source === "FS" && result.fsServings?.length) {
      // Find reference serving (selected pill, or 100g, or first with grams)
      const ref = selectedFsServingId
        ? result.fsServings.find((s) => s.servingId === selectedFsServingId)
        : (result.fsServings.find((s) => s.metricUnit === "g") ??
          result.fsServings[0]);
      if (!ref || !ref.metricAmount || ref.metricAmount <= 0) {
        return ref ? { ...ref.macros } : null;
      }
      const grams = parseFloat(servingGrams) || ref.metricAmount;
      const scale = grams / ref.metricAmount;
      const m = ref.macros;
      return {
        kcal: Math.round(m.kcal * scale),
        protein: Math.round(m.protein * scale * 10) / 10,
        fat: Math.round(m.fat * scale * 10) / 10,
        carbs: Math.round(m.carbs * scale * 10) / 10,
        ...(m.fiber != null && {
          fiber: Math.round(m.fiber * scale * 10) / 10,
        }),
        ...(m.sugar != null && {
          sugar: Math.round(m.sugar * scale * 10) / 10,
        }),
        ...(m.sodium != null && { sodium: Math.round(m.sodium * scale) }),
        ...(m.potassium != null && {
          potassium: Math.round(m.potassium * scale),
        }),
      };
    }

    // Legacy FDC/OFF: scale from per-100g
    if (!result.macrosPer100g) return null;
    const grams = parseFloat(servingGrams) || 100;
    const m = result.macrosPer100g;
    const scale = grams / 100;
    return {
      kcal: Math.round(m.kcal * scale),
      protein: Math.round(m.protein * scale * 10) / 10,
      fat: Math.round(m.fat * scale * 10) / 10,
      carbs: Math.round(m.carbs * scale * 10) / 10,
      ...(m.fiber != null && { fiber: Math.round(m.fiber * scale * 10) / 10 }),
      ...(m.sugar != null && { sugar: Math.round(m.sugar * scale * 10) / 10 }),
      ...(m.sodium != null && { sodium: Math.round(m.sodium * scale) }),
      ...(m.potassium != null && {
        potassium: Math.round(m.potassium * scale),
      }),
    };
  }, [state, servingGrams, selectedFsServingId]);

  const previewMacros: Macros | null = previewMacrosBase
    ? { ...previewMacrosBase, ...macroOverrides }
    : null;

  // Compute extended nutrients for detail view
  const previewExtended: Record<string, number> | null = useMemo(() => {
    if (state.type !== "detail") return null;
    const result = state.result;

    // FS items: scale extended nutrients from the selected serving
    if (result.source === "FS" && result.fsServings?.length) {
      const ref = selectedFsServingId
        ? result.fsServings.find((s) => s.servingId === selectedFsServingId)
        : (result.fsServings.find((s) => s.metricUnit === "g") ??
          result.fsServings[0]);
      if (
        !ref?.extendedNutrients ||
        !ref.metricAmount ||
        ref.metricAmount <= 0
      ) {
        return ref?.extendedNutrients ?? null;
      }
      const grams = parseFloat(servingGrams) || ref.metricAmount;
      const scale = grams / ref.metricAmount;
      const scaled: Record<string, number> = {};
      for (const [key, val] of Object.entries(ref.extendedNutrients)) {
        if (val != null) scaled[key] = Math.round(val * scale * 100) / 100;
      }
      return Object.keys(scaled).length > 0 ? scaled : null;
    }

    // Legacy FDC/OFF: scale from per-100g
    if (!result.extendedNutrientsPer100g) return null;
    const grams = parseFloat(servingGrams) || 100;
    const scale = grams / 100;
    const ext = result.extendedNutrientsPer100g as Record<string, number>;
    const scaled: Record<string, number> = {};
    for (const [key, val] of Object.entries(ext)) {
      if (val != null) scaled[key] = val * scale;
    }
    return Object.keys(scaled).length > 0 ? scaled : null;
  }, [state, servingGrams, selectedFsServingId]);

  const [showNutritionFacts, setShowNutritionFacts] = useState(false);

  // Wrap the current preview as a single CustomMealItem so MealNutritionFactsModal
  // can render its FDA-style label (always shows the standard rows, defaulting to 0
  // for missing fields — same form as MealBuilderModal/BarcodeScannerModal).
  const factsItems: CustomMealItem[] = useMemo(() => {
    if (state.type !== "detail" || !previewMacros) return [];
    const result = state.result;
    return [
      {
        id:
          result.foodId ??
          String(result.fdcId ?? result.offId ?? result.name),
        label: result.name,
        brand: result.brand,
        source: result.source,
        sourceId:
          result.foodId ?? String(result.fdcId ?? result.offId ?? ""),
        servingGrams: parseFloat(servingGrams) || 100,
        macros: previewMacros,
        extendedNutrients: (previewExtended ?? undefined) as
          | ExtendedNutrients
          | undefined,
      },
    ];
  }, [state, previewMacros, previewExtended, servingGrams]);

  // Compute selection totals
  const selectionTotalCal = selectedItems.reduce((sum, item) => {
    if (item.result.source === "FS") {
      // Use default serving macros for FS items
      return (
        sum +
        (item.result.defaultServingMacros?.kcal ??
          item.result.fsServings?.[0]?.macros.kcal ??
          0)
      );
    }
    const kcal = Math.round(
      ((item.result.macrosPer100g?.kcal ?? 0) * item.servingGrams) / 100,
    );
    return sum + kcal;
  }, 0);

  const renderResultCard = useCallback(
    (result: DatabaseSearchResult, index: number) => {
      const selected = isResultSelected(result);
      return (
        <Animated.View
          key={`${result.source}-${result.foodId ?? result.fdcId ?? result.offId ?? index}`}
          entering={FadeInDown.delay(index * 30).duration(200)}
        >
          <TouchableOpacity
            style={styles.resultCard}
            onPress={() => handleSelectResult(result)}
            activeOpacity={0.7}
          >
            <View style={styles.resultCardRow}>
              <View style={styles.resultCardContent}>
                <View style={styles.resultCardTop}>
                  <View style={styles.resultCardInfo}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {result.name}
                      {result.brand && (
                        <Text style={styles.resultBrand}>
                          {" · "}
                          {result.brand
                            .toLowerCase()
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>
                <View style={styles.resultMacroRow}>
                  {(() => {
                    // FS results: use defaultServingMacros or first serving's macros
                    // Legacy FDC/OFF: scale macrosPer100g
                    let scaled: {
                      kcal: number;
                      protein: number;
                      fat: number;
                      carbs: number;
                    };
                    let suffix: string;
                    if (result.source === "FS") {
                      const fsDefault = result.defaultServingMacros ??
                        result.fsServings?.[0]?.macros ?? {
                          kcal: 0,
                          protein: 0,
                          fat: 0,
                          carbs: 0,
                        };
                      scaled = {
                        kcal: Math.round(fsDefault.kcal),
                        protein: Math.round(fsDefault.protein),
                        fat: Math.round(fsDefault.fat),
                        carbs: Math.round(fsDefault.carbs),
                      };
                      suffix = "";
                    } else {
                      const servG = result.defaultServingG ?? 100;
                      const scale = servG / 100;
                      const m = result.macrosPer100g ?? {
                        kcal: 0,
                        protein: 0,
                        fat: 0,
                        carbs: 0,
                      };
                      scaled = {
                        kcal: Math.round(m.kcal * scale),
                        protein: Math.round(m.protein * scale),
                        fat: Math.round(m.fat * scale),
                        carbs: Math.round(m.carbs * scale),
                      };
                      suffix = result.defaultServingLabel
                        ? result.defaultServingLabel
                        : `${Math.round(servG)}g`;
                    }
                    return (
                      <>
                        <View style={styles.macroItem}>
                          <FontAwesomeIcon
                            icon={MACRO_ICONS.calories}
                            size={10}
                            color={MACRO_COLORS.calories.primary}
                          />
                          <Text style={styles.macroValue}>
                            {Math.round(scaled.kcal)}
                          </Text>
                        </View>
                        <View style={styles.macroItem}>
                          <FontAwesomeIcon
                            icon={MACRO_ICONS.protein}
                            size={10}
                            color={MACRO_COLORS.protein.primary}
                          />
                          <Text style={styles.macroValue}>
                            {Math.round(scaled.protein)}g
                          </Text>
                        </View>
                        <View style={styles.macroItem}>
                          <FontAwesomeIcon
                            icon={MACRO_ICONS.fat}
                            size={10}
                            color={MACRO_COLORS.fat.primary}
                          />
                          <Text style={styles.macroValue}>
                            {Math.round(scaled.fat)}g
                          </Text>
                        </View>
                        <View style={styles.macroItem}>
                          <FontAwesomeIcon
                            icon={MACRO_ICONS.carbs}
                            size={10}
                            color={MACRO_COLORS.carbs.primary}
                          />
                          <Text style={styles.macroValue}>
                            {Math.round(scaled.carbs)}g
                          </Text>
                        </View>
                        <Text style={styles.resultMacroSuffix}>{suffix}</Text>
                      </>
                    );
                  })()}
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.quickAddButton,
                  selected && styles.quickAddButtonSelected,
                ]}
                onPress={() => handleQuickAdd(result)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={selected ? "checkmark" : "add"}
                  size={22}
                  color={selected ? TEAL : "#bbb"}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [isResultSelected, handleSelectResult, handleQuickAdd],
  );

  // Detail button label
  const detailAddLabel = editingSelectedId
    ? "Update"
    : initialResult
      ? "Update"
      : selectedItems.length > 0
        ? "Add to Selection"
        : "Add";

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
              {/* Drag indicator */}
              <View style={styles.dragIndicatorContainer}>
                <View style={styles.dragIndicator} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity
                  onPress={
                    state.type === "detail" && !initialResult
                      ? handleBackToResults
                      : handleClose
                  }
                  activeOpacity={0.7}
                >
                  {showGlass ? (
                    <LiquidGlassView
                      style={styles.backButton}
                      interactive
                      effect="regular"
                      tintColor="rgba(250, 250, 247, 0.3)"
                    >
                      <Ionicons
                        name={
                          state.type === "detail" && !initialResult ? "chevron-back" : "close"
                        }
                        size={20}
                        color={Tokens.textPrimary}
                      />
                    </LiquidGlassView>
                  ) : (
                    <View
                      style={[styles.backButton, styles.backButtonFallback]}
                    >
                      <Ionicons
                        name={
                          state.type === "detail" && !initialResult ? "chevron-back" : "close"
                        }
                        size={20}
                        color="#666"
                      />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Search Foods</Text>
                {activeTab === "meals" && state.type !== "detail" ? (
                  <TouchableOpacity
                    onPress={handleMealNew}
                    activeOpacity={0.7}
                  >
                    {showGlass ? (
                      <LiquidGlassView
                        style={[styles.backButton, { backgroundColor: Tokens.accent }]}
                        interactive
                        effect="regular"
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
                        style={[styles.backButton, { backgroundColor: Tokens.accent }]}
                      >
                        <Ionicons name="add-sharp" size={20} color={TEAL} />
                      </View>
                    )}
                  </TouchableOpacity>
                ) : selectedItems.length > 0 && state.type !== "detail" ? (
                  <TouchableOpacity
                    onPress={handleSubmitSelection}
                    activeOpacity={0.8}
                  >
                    {showGlass ? (
                      <LiquidGlassView
                        style={[
                          styles.backButton,
                          { backgroundColor: Tokens.accent },
                        ]}
                        interactive
                        effect="regular"
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
                          { backgroundColor: Tokens.accent },
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
                ) : (
                  <View style={styles.headerRightSpacer} />
                )}
              </View>

              {/* Tab switcher - hidden in detail view and nested mode */}
              {state.type !== "detail" && !nested && (
                <View style={styles.tabSwitcher}>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      activeTab === "search" && styles.tabButtonActive,
                    ]}
                    onPress={() => setActiveTab("search")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        activeTab === "search" && styles.tabButtonTextActive,
                      ]}
                    >
                      Search
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      activeTab === "meals" && styles.tabButtonActive,
                    ]}
                    onPress={() => setActiveTab("meals")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        activeTab === "meals" && styles.tabButtonTextActive,
                      ]}
                    >
                      My Meals
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Search bar - hidden in detail view and meals tab */}
              {state.type !== "detail" && activeTab === "search" && (
                <Pressable
                  style={styles.searchContainer}
                  onPress={() => searchInputRef.current?.focus()}
                >
                  <View style={styles.searchShadowWrapper}>
                    {showGlass ? (
                      <LiquidGlassView
                        style={styles.searchGlass}
                        effect="regular"
                        tintColor="rgba(250, 250, 247, 0.3)"
                      >
                        <View style={styles.searchInputWrapper}>
                          <Ionicons
                            name="search"
                            size={18}
                            color="#000"
                            style={styles.searchIcon}
                          />
                          <TextInput
                            ref={searchInputRef}
                            style={styles.searchInput}
                            placeholder="Search"
                            placeholderTextColor="#636366"
                            value={searchText}
                            onChangeText={setSearchText}
                            autoCorrect={false}
                            autoCapitalize="none"
                            autoFocus
                            returnKeyType="search"
                          />
                          {searchText.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setSearchText("")}
                              style={styles.clearButton}
                              hitSlop={{
                                top: 10,
                                bottom: 10,
                                left: 10,
                                right: 10,
                              }}
                            >
                              <Ionicons
                                name="close-circle"
                                size={18}
                                color="#C7C7CC"
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                      </LiquidGlassView>
                    ) : (
                      <View
                        style={[styles.searchGlass, styles.searchGlassFallback]}
                      >
                        <View style={styles.searchInputWrapper}>
                          <Ionicons
                            name="search"
                            size={18}
                            color="#000"
                            style={styles.searchIcon}
                          />
                          <TextInput
                            ref={searchInputRef}
                            style={styles.searchInput}
                            placeholder="Search"
                            placeholderTextColor="#636366"
                            value={searchText}
                            onChangeText={setSearchText}
                            autoCorrect={false}
                            autoCapitalize="none"
                            autoFocus
                            returnKeyType="search"
                          />
                          {searchText.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setSearchText("")}
                              style={styles.clearButton}
                              hitSlop={{
                                top: 10,
                                bottom: 10,
                                left: 10,
                                right: 10,
                              }}
                            >
                              <Ionicons
                                name="close-circle"
                                size={18}
                                color="#C7C7CC"
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                </Pressable>
              )}

              {/* Selection strip */}
              {selectedItems.length > 0 && state.type !== "detail" && activeTab === "search" && (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  exiting={FadeOutUp.duration(150)}
                  style={styles.selectionStrip}
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectionChipsContainer}
                    style={styles.selectionChipsScroll}
                  >
                    {selectedItems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.selectionChip}
                        onPress={() => handleEditSelected(item)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={styles.selectionChipName}
                          numberOfLines={1}
                        >
                          {item.result.name}
                        </Text>
                        <TouchableOpacity
                          style={styles.selectionChipRemove}
                          onPress={() => handleRemoveSelected(item.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close" size={14} color="#999" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.selectionStripSummary}>
                    {selectedItems.length}{" "}
                    {selectedItems.length === 1 ? "item" : "items"} ·{" "}
                    {selectionTotalCal} cal
                  </Text>
                </Animated.View>
              )}

              {/* Content area */}
              <View style={styles.contentArea}>
                {/* My Meals tab */}
                {activeTab === "meals" && state.type !== "detail" && (
                    <ScrollView
                      style={styles.resultsList}
                      contentContainerStyle={{
                        paddingBottom: insets.bottom + 24,
                        flexGrow: 1,
                      }}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                    >
                      {/* Meals search bar */}
                      <Pressable
                        style={styles.mealsSearchContainer}
                        onPress={() => mealsSearchInputRef.current?.focus()}
                      >
                        <View style={styles.searchShadowWrapper}>
                          {showGlass ? (
                            <LiquidGlassView
                              style={styles.searchGlass}
                              effect="regular"
                              tintColor="rgba(250, 250, 247, 0.3)"
                            >
                              <View style={styles.searchInputWrapper}>
                                <Ionicons
                                  name="search"
                                  size={18}
                                  color="#000"
                                  style={styles.searchIcon}
                                />
                                <TextInput
                                  ref={mealsSearchInputRef}
                                  style={styles.searchInput}
                                  placeholder="Search"
                                  placeholderTextColor="#636366"
                                  value={mealsSearchText}
                                  onChangeText={setMealsSearchText}
                                  autoCorrect={false}
                                  autoCapitalize="none"
                                  returnKeyType="search"
                                />
                                {mealsSearchText.length > 0 && (
                                  <TouchableOpacity
                                    onPress={() => setMealsSearchText("")}
                                    style={styles.clearButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <Ionicons name="close-circle" size={18} color="#C7C7CC" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </LiquidGlassView>
                          ) : (
                            <View style={[styles.searchGlass, styles.searchGlassFallback]}>
                              <View style={styles.searchInputWrapper}>
                                <Ionicons
                                  name="search"
                                  size={18}
                                  color="#000"
                                  style={styles.searchIcon}
                                />
                                <TextInput
                                  ref={mealsSearchInputRef}
                                  style={styles.searchInput}
                                  placeholder="Search"
                                  placeholderTextColor="#636366"
                                  value={mealsSearchText}
                                  onChangeText={setMealsSearchText}
                                  autoCorrect={false}
                                  autoCapitalize="none"
                                  returnKeyType="search"
                                />
                                {mealsSearchText.length > 0 && (
                                  <TouchableOpacity
                                    onPress={() => setMealsSearchText("")}
                                    style={styles.clearButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <Ionicons name="close-circle" size={18} color="#C7C7CC" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          )}
                        </View>
                      </Pressable>
                      {sortedMeals.length === 0 && mealsSearchText.trim().length > 0 && (
                        <View style={styles.mealsEmptyFilter}>
                          <Text style={styles.centeredMessageText}>
                            No meals match "{mealsSearchText.trim()}"
                          </Text>
                        </View>
                      )}
                      {customMeals.length === 0 && (
                        <View style={styles.mealsEmptyState}>
                          <Text style={styles.idleTitle}>No custom meals yet</Text>
                          <Text style={styles.idleDescription}>
                            Create your first meal by tapping the + button above
                          </Text>
                        </View>
                      )}
                      {sortedMeals.map((meal, index) => (
                        <Animated.View
                          key={meal.id}
                          entering={FadeInDown.delay(index * 40).duration(200)}
                        >
                          <Swipeable
                            ref={(ref) => {
                              if (ref) mealSwipeableRefs.current.set(meal.id, ref);
                              else mealSwipeableRefs.current.delete(meal.id);
                            }}
                            renderRightActions={() => renderMealDeleteAction(meal.id)}
                            overshootRight={false}
                          >
                            <TouchableOpacity
                              style={styles.mealCard}
                              onPress={() => handleMealEdit(meal)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.mealCardRow}>
                                <View style={styles.mealCardContent}>
                                  <Text style={styles.mealName} numberOfLines={1}>
                                    {meal.name}
                                    <Text style={styles.mealMetaInline}>
                                      {" · "}
                                      {meal.items.length}{" "}
                                      {meal.items.length === 1 ? "item" : "items"}
                                    </Text>
                                  </Text>
                                  <View style={styles.mealMacroRow}>
                                    <View style={styles.macroItem}>
                                      <FontAwesomeIcon
                                        icon={MACRO_ICONS.calories}
                                        size={10}
                                        color={MACRO_COLORS.calories.primary}
                                      />
                                      <Text style={styles.macroValue}>
                                        {Math.round(meal.totalMacros.kcal)}
                                      </Text>
                                    </View>
                                    {[
                                      { key: "protein", value: meal.totalMacros.protein },
                                      { key: "fat", value: meal.totalMacros.fat },
                                      { key: "carbs", value: meal.totalMacros.carbs },
                                    ].map((macro) => (
                                      <View key={macro.key} style={styles.macroItem}>
                                        <FontAwesomeIcon
                                          icon={MACRO_ICONS[macro.key as keyof typeof MACRO_ICONS]}
                                          size={10}
                                          color={MACRO_COLORS[macro.key as keyof typeof MACRO_COLORS]?.primary}
                                        />
                                        <Text style={styles.macroValue}>
                                          {Math.round(macro.value)}g
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                </View>
                                <TouchableOpacity
                                  style={styles.mealAddButton}
                                  onPress={(e) => {
                                    e.stopPropagation?.();
                                    handleMealTap(meal);
                                  }}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  activeOpacity={0.6}
                                >
                                  <Ionicons name="add" size={22} color="#bbb" />
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          </Swipeable>
                        </Animated.View>
                      ))}
                    </ScrollView>
                )}

                {/* Idle state */}
                {activeTab === "search" && state.type === "idle" &&
                  (recentlyLoggedResults.length > 0 ? (
                    <KeyboardAwareScrollView
                      style={styles.resultsList}
                      contentContainerStyle={{
                        paddingBottom: insets.bottom + 16,
                      }}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                      showsVerticalScrollIndicator={false}
                      bounces={true}
                    >
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionHeaderText}>
                          Recently Logged
                        </Text>
                        <TouchableOpacity
                          onPress={handleClearRecentlyLogged}
                          activeOpacity={0.6}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.sectionHeaderClear}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                      {recentlyLoggedResults.map((result, index) =>
                        renderResultCard(result, index),
                      )}
                    </KeyboardAwareScrollView>
                  ) : (
                    <Animated.View
                      entering={FadeInDown.delay(100).duration(300)}
                      style={styles.centeredMessageUpper}
                    >
                      <Text style={styles.idleTitle}>
                        Search for item in database
                      </Text>
                      <Text style={styles.idleDescription}>
                        Type a food name to search the nutrition database
                      </Text>
                    </Animated.View>
                  ))}

                {/* Searching state */}
                {activeTab === "search" && state.type === "searching" && (
                  <View style={styles.centeredMessageUpper}>
                    <ActivityIndicator size="large" color="#666" />
                    <Text style={styles.centeredMessageText}>Searching...</Text>
                  </View>
                )}

                {/* Empty state */}
                {activeTab === "search" && state.type === "empty" && (
                  <View style={styles.centeredMessageUpper}>
                    <Ionicons name="search-outline" size={48} color="#ddd" />
                    <Text style={styles.centeredMessageText}>
                      No results found
                    </Text>
                    <Text style={styles.centeredMessageSubtext}>
                      Try a different search term
                    </Text>
                  </View>
                )}

                {/* Error state */}
                {activeTab === "search" && state.type === "error" && (
                  <View style={styles.centeredMessageUpper}>
                    <Ionicons
                      name="warning-outline"
                      size={48}
                      color="#F5A623"
                    />
                    <Text style={styles.centeredMessageText}>
                      {state.message}
                    </Text>
                  </View>
                )}

                {/* Results list */}
                {activeTab === "search" && state.type === "results" && (
                  <KeyboardAwareScrollView
                    style={styles.resultsList}
                    contentContainerStyle={{
                      paddingBottom: insets.bottom + 16,
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                  >
                    {commonResults.length > 0 && (
                      <>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionHeaderText}>
                            Common Foods
                          </Text>
                        </View>
                        {commonResults.map((result, index) =>
                          renderResultCard(result, index),
                        )}
                      </>
                    )}
                    {brandedResults.length > 0 && (
                      <>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionHeaderText}>Branded</Text>
                        </View>
                        {brandedResults.map((result, index) =>
                          renderResultCard(
                            result,
                            commonResults.length + index,
                          ),
                        )}
                      </>
                    )}
                    {(commonResults.length > 0 ||
                      brandedResults.length > 0) && (
                      <Text
                        style={styles.attribution}
                        onPress={() =>
                          Linking.openURL("https://platform.fatsecret.com")
                        }
                      >
                        Powered by FatSecret Platform API
                      </Text>
                    )}
                  </KeyboardAwareScrollView>
                )}

                {/* Detail view */}
                {state.type === "detail" && previewMacros && (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={[
                      styles.detailContainer,
                      { paddingBottom: keyboardHeight || insets.bottom + 16 },
                    ]}
                  >
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ flexGrow: 1 }}
                    >
                      {/* Product info */}
                      <View style={styles.productHeader}>
                        {state.result.brand && (
                          <Text style={styles.productBrand}>
                            {state.result.brand
                              .toLowerCase()
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Text>
                        )}
                        <Text style={styles.productName} numberOfLines={2}>
                          {state.result.name}
                        </Text>
                      </View>

                      {/* FS items: serving pills + gram stepper (same layout as legacy) */}
                      {state.result.source === "FS" &&
                      state.result.fsServings?.length ? (
                        <>
                          {/* Horizontal serving pills */}
                          <Animated.View
                            entering={FadeIn.duration(200)}
                            style={styles.portionRow}
                          >
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={
                                styles.portionScrollContent
                              }
                            >
                              {state.result.fsServings
                                .filter(
                                  (s) =>
                                    s.metricAmount != null &&
                                    s.metricAmount > 0,
                                )
                                .map((serving) => {
                                  const isSelected =
                                    serving.servingId === selectedFsServingId;
                                  return (
                                    <TouchableOpacity
                                      key={serving.servingId}
                                      style={[
                                        styles.portionPill,
                                        isSelected &&
                                          styles.portionPillSelected,
                                      ]}
                                      onPress={() => {
                                        Haptics.impactAsync(
                                          Haptics.ImpactFeedbackStyle.Light,
                                        );
                                        setSelectedFsServingId(
                                          serving.servingId,
                                        );
                                        if (serving.metricAmount) {
                                          setServingGrams(
                                            Math.round(
                                              serving.metricAmount,
                                            ).toString(),
                                          );
                                        }
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text
                                        style={[
                                          styles.portionPillLabel,
                                          isSelected &&
                                            styles.portionPillLabelSelected,
                                        ]}
                                      >
                                        {serving.description}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.portionPillGrams,
                                          isSelected &&
                                            styles.portionPillGramsSelected,
                                        ]}
                                      >
                                        {serving.metricAmount
                                          ? `${Math.round(serving.metricAmount)}g`
                                          : ""}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                            </ScrollView>
                          </Animated.View>

                          {/* Gram stepper — same as legacy, editable */}
                          <View style={styles.servingCard}>
                            <Text style={styles.servingLabel}>Serving</Text>
                            <View style={styles.stepperContainer}>
                              <TouchableOpacity
                                style={styles.stepperButton}
                                onPress={() => handleServingStep(-10)}
                                activeOpacity={0.6}
                              >
                                <Ionicons
                                  name="remove"
                                  size={18}
                                  color="#999"
                                />
                              </TouchableOpacity>
                              <View style={styles.servingInputWrapper}>
                                <TextInput
                                  style={styles.servingInput}
                                  value={servingGrams}
                                  onChangeText={(text) => {
                                    setServingGrams(text);
                                    setSelectedFsServingId(null);
                                  }}
                                  keyboardType="numeric"
                                  selectTextOnFocus
                                  returnKeyType="done"
                                />
                                <Text style={styles.servingUnit}>g</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.stepperButton}
                                onPress={() => handleServingStep(10)}
                                activeOpacity={0.6}
                              >
                                <Ionicons name="add" size={18} color="#999" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      ) : (
                        <>
                          {/* Legacy: Portion quick-select pills */}
                          {(portions.length > 0 || portionsLoading) && (
                            <Animated.View
                              entering={FadeIn.duration(200)}
                              style={styles.portionRow}
                            >
                              {portionsLoading ? (
                                <ActivityIndicator
                                  size="small"
                                  color={TEAL}
                                  style={{ marginVertical: 4 }}
                                />
                              ) : (
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={
                                    styles.portionScrollContent
                                  }
                                >
                                  {portions.map((portion, i) => {
                                    const isSelected =
                                      selectedPortionIndex === i;
                                    return (
                                      <TouchableOpacity
                                        key={`${portion.label}-${i}`}
                                        style={[
                                          styles.portionPill,
                                          isSelected &&
                                            styles.portionPillSelected,
                                        ]}
                                        onPress={() => {
                                          Haptics.impactAsync(
                                            Haptics.ImpactFeedbackStyle.Light,
                                          );
                                          setSelectedPortionIndex(i);
                                          setServingGrams(
                                            portion.grams.toString(),
                                          );
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <Text
                                          style={[
                                            styles.portionPillLabel,
                                            isSelected &&
                                              styles.portionPillLabelSelected,
                                          ]}
                                        >
                                          {portion.label}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.portionPillGrams,
                                            isSelected &&
                                              styles.portionPillGramsSelected,
                                          ]}
                                        >
                                          {portion.grams}g
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              )}
                            </Animated.View>
                          )}

                          {/* Legacy: Serving stepper */}
                          <View style={styles.servingCard}>
                            <Text style={styles.servingLabel}>Serving</Text>
                            <View style={styles.stepperContainer}>
                              <TouchableOpacity
                                style={styles.stepperButton}
                                onPress={() => handleServingStep(-10)}
                                activeOpacity={0.6}
                              >
                                <Ionicons
                                  name="remove"
                                  size={18}
                                  color="#999"
                                />
                              </TouchableOpacity>
                              <View style={styles.servingInputWrapper}>
                                <TextInput
                                  style={styles.servingInput}
                                  value={servingGrams}
                                  onChangeText={(text) => {
                                    setServingGrams(text);
                                    setSelectedPortionIndex(null);
                                  }}
                                  keyboardType="numeric"
                                  selectTextOnFocus
                                  returnKeyType="done"
                                />
                                <Text style={styles.servingUnit}>g</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.stepperButton}
                                onPress={() => handleServingStep(10)}
                                activeOpacity={0.6}
                              >
                                <Ionicons name="add" size={18} color="#999" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      )}

                      {/* Macros - donut ring with macro list (matches BarcodeScannerModal) */}
                      {(() => {
                        const RING_SIZE = 88;
                        const STROKE = 7;
                        const R = (RING_SIZE - STROKE) / 2;
                        const CX = RING_SIZE / 2;
                        const CY = RING_SIZE / 2;
                        const proteinKcal = previewMacros.protein * 4;
                        const carbsKcal = previewMacros.carbs * 4;
                        const fatKcal = previewMacros.fat * 9;
                        const total = proteinKcal + carbsKcal + fatKcal;

                        const arcSegments: { pct: number; color: string }[] =
                          total > 0
                            ? [
                                {
                                  pct: proteinKcal / total,
                                  color: MACRO_COLORS.protein.primary,
                                },
                                {
                                  pct: carbsKcal / total,
                                  color: MACRO_COLORS.carbs.primary,
                                },
                                {
                                  pct: fatKcal / total,
                                  color: MACRO_COLORS.fat.primary,
                                },
                              ]
                            : [];

                        const GAP = 0.04;
                        const nonZero = arcSegments.filter((s) => s.pct > 0);
                        const totalGap =
                          nonZero.length > 1 ? GAP * nonZero.length : 0;
                        const usable = 2 * Math.PI - totalGap;

                        let cursor = -Math.PI / 2;
                        const arcs = arcSegments
                          .filter((s) => s.pct > 0)
                          .map((seg) => {
                            const angle = seg.pct * usable;
                            const startAngle = cursor;
                            const endAngle = cursor + angle;
                            cursor = endAngle + GAP;
                            const x1 = CX + R * Math.cos(startAngle);
                            const y1 = CY + R * Math.sin(startAngle);
                            const x2 = CX + R * Math.cos(endAngle);
                            const y2 = CY + R * Math.sin(endAngle);
                            const largeArc = angle > Math.PI ? 1 : 0;
                            return {
                              d: `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
                              color: seg.color,
                            };
                          });

                        const macroRows = [
                          {
                            key: "protein" as const,
                            label: "Protein",
                            value: previewMacros.protein,
                            icon: MACRO_ICONS.protein,
                            iconColor: MACRO_COLORS.protein.primary,
                          },
                          {
                            key: "carbs" as const,
                            label: "Carbs",
                            value: previewMacros.carbs,
                            icon: MACRO_ICONS.carbs,
                            iconColor: MACRO_COLORS.carbs.primary,
                          },
                          {
                            key: "fat" as const,
                            label: "Fat",
                            value: previewMacros.fat,
                            icon: MACRO_ICONS.fat,
                            iconColor: MACRO_COLORS.fat.primary,
                          },
                        ];

                        return (
                          <View style={styles.nutritionSection}>
                            <View style={styles.nutritionHeader}>
                              <Text
                                style={[
                                  styles.dbSectionLabel,
                                  styles.nutritionHeaderLabel,
                                ]}
                              >
                                Nutrition
                              </Text>
                              <TouchableOpacity
                                style={styles.nutritionDetailsButton}
                                onPress={() => {
                                  Haptics.impactAsync(
                                    Haptics.ImpactFeedbackStyle.Light,
                                  );
                                  setShowNutritionFacts(true);
                                }}
                                activeOpacity={0.6}
                                hitSlop={{
                                  top: 12,
                                  right: 12,
                                  bottom: 12,
                                  left: 12,
                                }}
                              >
                                <Text style={styles.nutritionDetailsText}>
                                  See All
                                </Text>
                                <Ionicons
                                  name="chevron-forward"
                                  size={14}
                                  color={Tokens.accent}
                                />
                              </TouchableOpacity>
                            </View>
                            <View style={styles.donutContainer}>
                              <TouchableOpacity
                                style={styles.donutRingWrapper}
                                onPress={() => {
                                  Haptics.impactAsync(
                                    Haptics.ImpactFeedbackStyle.Light,
                                  );
                                  setEditMacroPopup({
                                    nutrientKey: "kcal",
                                    currentValue: previewMacros.kcal,
                                  });
                                }}
                                activeOpacity={0.7}
                              >
                                <Svg width={RING_SIZE} height={RING_SIZE}>
                                  <Circle
                                    cx={CX}
                                    cy={CY}
                                    r={R}
                                    stroke={Tokens.border}
                                    strokeWidth={STROKE}
                                    fill="none"
                                  />
                                  {arcs.map((arc, i) => (
                                    <Path
                                      key={i}
                                      d={arc.d}
                                      stroke={arc.color}
                                      strokeWidth={STROKE}
                                      fill="none"
                                      strokeLinecap="butt"
                                    />
                                  ))}
                                </Svg>
                                <View style={styles.donutCenter}>
                                  <AnimatedDigits
                                    value={previewMacros.kcal}
                                    style={styles.donutKcalValue}
                                  />
                                  <Text style={styles.donutKcalLabel}>cal</Text>
                                </View>
                              </TouchableOpacity>
                              <View style={styles.donutMacroList}>
                                {macroRows.map((row) => (
                                  <TouchableOpacity
                                    key={row.key}
                                    style={styles.donutMacroRow}
                                    onPress={() => {
                                      Haptics.impactAsync(
                                        Haptics.ImpactFeedbackStyle.Light,
                                      );
                                      setEditMacroPopup({
                                        nutrientKey: row.key,
                                        currentValue: row.value,
                                      });
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <FontAwesomeIcon
                                      icon={row.icon}
                                      size={12}
                                      color={row.iconColor}
                                    />
                                    <Text style={styles.donutMacroLabel}>
                                      {row.label}
                                    </Text>
                                    <Text style={styles.donutMacroGrams}>
                                      {Math.round(row.value)}
                                      <Text style={styles.donutMacroUnit}>
                                        g
                                      </Text>
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          </View>
                        );
                      })()}

                      {/* Add button — black pill (matches BarcodeScannerModal) */}
                      <View style={{ height: 20 }} />
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={handleAdd}
                        activeOpacity={0.85}
                      >
                        <View style={styles.addButtonSpacer} />
                        <Text style={styles.addButtonText}>
                          {detailAddLabel}
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
                      {onRemoveEntry && (
                        <TouchableOpacity
                          style={styles.removeEntryButton}
                          onPress={onRemoveEntry}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={18} color={Tokens.error} />
                          <Text style={styles.removeEntryButtonText}>Remove from Meal</Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </Animated.View>
                )}
              </View>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </KeyboardProvider>

      {/* Edit macro popup */}
      {editMacroPopup && (
        <EditNutrientPopup
          nutrientKey={editMacroPopup.nutrientKey}
          currentValue={editMacroPopup.currentValue}
          onSave={(value) => {
            setMacroOverrides((prev) => ({
              ...prev,
              [editMacroPopup.nutrientKey]: value,
            }));
            setEditMacroPopup(null);
          }}
          onRevert={() => {
            setMacroOverrides((prev) => {
              const next = { ...prev };
              delete next[editMacroPopup.nutrientKey];
              return next;
            });
            setEditMacroPopup(null);
          }}
          onClose={() => setEditMacroPopup(null)}
        />
      )}

      {/* Nutrition facts (FDA-style label) — same component as MealBuilderModal */}
      <MealNutritionFactsModal
        visible={showNutritionFacts}
        items={factsItems}
        onClose={() => setShowNutritionFacts(false)}
      />

      {children}
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  // Search bar
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchShadowWrapper: {
    borderRadius: 22,
    ...Tokens.shadowLight,
  },
  searchGlass: {
    borderRadius: 22,
    overflow: "hidden",
  },
  searchGlassFallback: {
    backgroundColor: "#EBEBEB",
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  selectionStrip: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  selectionStripSummary: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
    marginTop: 4,
    marginLeft: 2,
  },
  // Content area
  contentArea: {
    flex: 1,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  centeredMessageUpper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: "40%",
  },
  centeredMessageText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#999",
    textAlign: "center",
  },
  centeredMessageSubtext: {
    fontSize: 13,
    fontWeight: "400",
    color: "#bbb",
    textAlign: "center",
  },
  idleIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  idleTitle: {
    fontSize: 20,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  idleDescription: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "400",
    color: Tokens.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B6B6B",
    textTransform: "capitalize",
  },
  sectionHeaderClear: {
    fontSize: 13,
    fontWeight: "500",
    color: "#bbb",
  },
  // Results list
  resultsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resultCard: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 16,
    marginBottom: 6,
    borderWidth: 0.5,
    borderColor: "#E5E5E5",
  },
  resultCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultCardContent: {
    flex: 1,
  },
  resultCardTop: {
    marginBottom: 8,
  },
  resultCardInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  resultBrand: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "400",
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
  },
  resultMacroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  macroItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  macroValue: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textSecondary,
  },
  resultMacroSuffix: {
    fontSize: 11,
    fontWeight: "400",
    color: "#bbb",
  },
  // Quick add button on result cards
  quickAddButton: {
    padding: 2,
  },
  quickAddButtonSelected: {
    opacity: 0.7,
  },
  // Detail view
  detailContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  detailBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  detailBackButtonText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#666",
  },
  productHeader: {
    marginBottom: 20,
  },
  productName: {
    fontSize: 22,
    fontWeight: "700",
    color: Tokens.textPrimary,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  productBrand: {
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.textSecondary,
    textTransform: "capitalize",
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  servingHint: {
    fontSize: 13,
    fontWeight: "400",
    color: Tokens.textSecondary,
    marginTop: 6,
  },
  // Serving stepper
  servingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 0.5,
    borderColor: Tokens.border,
  },
  servingLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  stepperButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  servingInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  servingInput: {
    fontSize: 18,
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
    minWidth: 44,
    textAlign: "right",
    padding: 0,
    fontVariant: ["tabular-nums"] as any,
  },
  servingUnit: {
    fontSize: 14,
    fontWeight: "400",
    color: Tokens.textPrimary,
    marginLeft: 2,
  },
  // Portion quick-select
  portionRow: {
    marginBottom: 12,
  },
  portionScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  portionPill: {
    backgroundColor: "#F5F5F5",
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 72,
  },
  portionPillSelected: {
    backgroundColor: Tokens.accentTint,
    borderColor: TEAL,
  },
  portionPillLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  portionPillLabelSelected: {
    color: TEAL,
  },
  portionPillGrams: {
    fontSize: 11,
    fontWeight: "400",
    color: Tokens.textSecondary,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  portionPillGramsSelected: {
    color: TEAL,
  },
  // Nutrition section: donut ring + macro list (matches BarcodeScannerModal)
  nutritionSection: {
    marginBottom: 16,
    paddingVertical: 8,
  },
  dbSectionLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B6B6B",
    textTransform: "capitalize",
    marginBottom: 10,
    marginLeft: 0,
  },
  nutritionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  nutritionHeaderLabel: {
    marginBottom: 0,
  },
  nutritionDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
  },
  nutritionDetailsText: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.accent,
    letterSpacing: -0.2,
  },
  donutContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  donutRingWrapper: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
  },
  donutKcalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -0.5,
  },
  donutKcalLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Tokens.textSecondary,
    marginTop: -2,
  },
  donutMacroList: {
    flex: 1,
    gap: 8,
  },
  donutMacroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  donutMacroLabel: {
    fontSize: 14,
    fontWeight: "600",
    width: 52,
    letterSpacing: -0.2,
    color: Tokens.textPrimary,
  },
  donutMacroGrams: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
    textAlign: "right",
    flex: 1,
    letterSpacing: -0.2,
  },
  donutMacroUnit: {
    fontSize: 13,
    fontWeight: "500",
  },
  // Action row
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  backActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: "#EBEBEB",
  },
  backActionText: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
  // Add button — black pill (matches BarcodeScannerModal / onboarding Continue)
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 56,
    borderRadius: 9999,
    backgroundColor: Tokens.textPrimary,
  },
  addButtonSpacer: {
    width: 16,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
    letterSpacing: -0.2,
  },
  removeEntryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 12,
  },
  removeEntryButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Tokens.error,
  },
  selectionChipsScroll: {},
  selectionChipsContainer: {
    gap: 8,
    paddingRight: 4,
  },
  selectionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "#ddd",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 4,
  },
  selectionChipName: {
    maxWidth: 140,
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  selectionChipRemove: {
    padding: 2,
  },
  attribution: {
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "400",
    color: "#bbb",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  mealsSearchContainer: {
    paddingBottom: 12,
  },
  mealsEmptyFilter: {
    alignItems: "center",
    paddingVertical: 40,
  },
  mealsEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: "40%",
  },
  // Tab switcher
  tabSwitcher: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: Tokens.textPrimary,
  },
  tabButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#bbb",
  },
  tabButtonTextActive: {
    color: Tokens.textPrimary,
    fontWeight: "600",
  },
  // Meal cards
  mealCard: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: "#E5E5E5",
    padding: 16,
    marginBottom: 6,
  },
  mealCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mealCardContent: {
    flex: 1,
  },
  mealName: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  mealMetaInline: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "400",
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
  },
  mealMacroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mealAddButton: {
    padding: 2,
  },
  mealDeleteAction: {
    backgroundColor: "#F87171",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    borderRadius: 16,
    marginLeft: 8,
    marginBottom: 6,
  },
});
