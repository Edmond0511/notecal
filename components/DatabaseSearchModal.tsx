import { AnimatedDigits } from "@/components/AnimatedDigits";
import { Tokens } from "@/constants/theme";
import { scaleMacrosToServing } from "@/services/barcodeService";
import {
  fetchFoodPortions,
  FoodSearchError,
  searchFoodDatabase,
} from "@/services/foodSearchApi";
import { CommonPortion, DatabaseSearchResult, Macros } from "@/types";
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
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Modal,
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
} from "react-native-gesture-handler";
import {
  KeyboardAwareScrollView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
}

interface DatabaseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onAddEntries: (
    items: { result: DatabaseSearchResult; servingGrams: number }[],
  ) => void;
}

export function DatabaseSearchModal({
  visible,
  onClose,
  onAddEntries,
}: DatabaseSearchModalProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ModalState>({ type: "idle" });
  const [searchText, setSearchText] = useState("");
  const [servingGrams, setServingGrams] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [commonResults, setCommonResults] = useState<DatabaseSearchResult[]>([]);
  const [brandedResults, setBrandedResults] = useState<DatabaseSearchResult[]>([]);
  const [portions, setPortions] = useState<CommonPortion[]>([]);
  const [portionsLoading, setPortionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  const showGlass = isLiquidGlassSupported;

  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [editingSelectedId, setEditingSelectedId] = useState<string | null>(
    null,
  );
  const selectionIdCounter = useRef(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setState({ type: "idle" });
      setSearchText("");
      setServingGrams("");
      setCommonResults([]);
      setBrandedResults([]);
      setPortions([]);
      setPortionsLoading(false);
      setSelectedItems([]);
      setEditingSelectedId(null);
      selectionIdCounter.current = 0;
      translateY.value = 0;
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
          setState({ type: "results", results: [...response.common, ...response.branded] });
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
    const defaultServing = result.defaultServingG ?? 100;
    setServingGrams(defaultServing.toString());
    setEditingSelectedId(null);
    setState({ type: "detail", result });

    // Fetch FDC portions in the background
    setPortions([]);
    if (result.source === "FDC" && result.fdcId) {
      setPortionsLoading(true);
      fetchFoodPortions(result.fdcId)
        .then((p) => setPortions(p))
        .finally(() => setPortionsLoading(false));
    }
  }, []);

  // Quick-add from result card "+" button
  const handleQuickAdd = useCallback(
    (result: DatabaseSearchResult) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const defaultServing = result.defaultServingG ?? 100;
      const id = `sel-${++selectionIdCounter.current}`;
      setSelectedItems((prev) => [
        ...prev,
        { id, result, servingGrams: defaultServing, portions: [] },
      ]);

      // Fetch portions in the background for this item
      if (result.source === "FDC" && result.fdcId) {
        fetchFoodPortions(result.fdcId).then((p) => {
          setSelectedItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, portions: p } : item,
            ),
          );
        });
      }
    },
    [],
  );

  // Check if a result is already in selection
  const isResultSelected = useCallback(
    (result: DatabaseSearchResult) => {
      return selectedItems.some(
        (item) =>
          item.result.source === result.source &&
          (result.fdcId
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
  }, [commonResults, brandedResults]);

  const handleAdd = useCallback(() => {
    if (state.type !== "detail") return;
    const grams = parseFloat(servingGrams) || 100;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Attach fetched portions to the result
    const resultWithPortions =
      portions.length > 0 ? { ...state.result, portions } : state.result;

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
    } else if (selectedItems.length > 0) {
      // Multi-select mode: add to selection, go back to results
      const id = `sel-${++selectionIdCounter.current}`;
      setSelectedItems((prev) => [
        ...prev,
        { id, result: resultWithPortions, servingGrams: grams, portions },
      ]);
      const allAfterAdd = [...commonResults, ...brandedResults];
      if (allAfterAdd.length > 0) {
        setState({ type: "results", results: allAfterAdd });
      } else {
        setState({ type: "idle" });
      }
      setServingGrams("");
    } else {
      // Single-item quick flow: add immediately and close
      onAddEntries([{ result: resultWithPortions, servingGrams: grams }]);
    }
  }, [
    state,
    servingGrams,
    portions,
    onAddEntries,
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
  const handleEditSelected = useCallback(
    (selected: SelectedItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();
      setEditingSelectedId(selected.id);
      setServingGrams(selected.servingGrams.toString());
      setPortions(selected.portions);
      setPortionsLoading(false);
      setState({ type: "detail", result: selected.result });

      // Re-fetch portions if we don't have them
      if (
        selected.portions.length === 0 &&
        selected.result.source === "FDC" &&
        selected.result.fdcId
      ) {
        setPortionsLoading(true);
        fetchFoodPortions(selected.result.fdcId)
          .then((p) => setPortions(p))
          .finally(() => setPortionsLoading(false));
      }
    },
    [],
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleServingStep = useCallback(
    (delta: number) => {
      const current = parseFloat(servingGrams) || 100;
      const next = Math.max(1, current + delta);
      setServingGrams(next.toString());
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
  const previewMacros: Macros | null =
    state.type === "detail"
      ? scaleMacrosToServing(
          state.result.macrosPer100g,
          parseFloat(servingGrams) || 100,
        )
      : null;

  // Compute selection totals
  const selectionTotalCal = selectedItems.reduce((sum, item) => {
    const scaled = scaleMacrosToServing(
      item.result.macrosPer100g,
      item.servingGrams,
    );
    return sum + Math.round(scaled.kcal);
  }, 0);

  const renderResultCard = useCallback(
    (result: DatabaseSearchResult, index: number) => {
      const selected = isResultSelected(result);
      return (
        <Animated.View
          key={`${result.source}-${result.fdcId ?? result.offId ?? index}`}
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
                    </Text>
                    {result.brand && (
                      <Text style={styles.resultBrand} numberOfLines={1}>
                        {result.brand}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.resultMacroRow}>
                  {(() => {
                    const servG = result.defaultServingG ?? 100;
                    const scaled = scaleMacrosToServing(
                      result.macrosPer100g,
                      servG,
                    );
                    const suffix = result.defaultServingLabel
                      ? result.defaultServingLabel
                      : `${Math.round(servG)}g`;
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
            style={[styles.container, { marginTop: insets.top }, animatedStyle]}
          >
            {/* Drag indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.7}
              >
                {showGlass ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons name="close" size={20} color={Tokens.textPrimary} />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="close" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Search Foods</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            {/* Search bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchShadowWrapper}>
                {showGlass ? (
                  <LiquidGlassView
                    style={styles.searchGlass}
                    interactive
                    effect="regular"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <View style={styles.searchInputWrapper}>
                      <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
                      <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        placeholder="Search for food item..."
                        placeholderTextColor="#8E8E93"
                        value={searchText}
                        onChangeText={setSearchText}
                        autoCorrect={false}
                        returnKeyType="search"
                      />
                      {searchText.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setSearchText("")}
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
                      <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
                      <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        placeholder="Search for food item..."
                        placeholderTextColor="#8E8E93"
                        value={searchText}
                        onChangeText={setSearchText}
                        autoCorrect={false}
                        returnKeyType="search"
                      />
                      {searchText.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setSearchText("")}
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
            </View>

            {/* Content area */}
            <View style={styles.contentArea}>
              {/* Idle state */}
              {state.type === "idle" && (
                <View style={styles.centeredMessage}>
                  <Ionicons name="nutrition-outline" size={48} color="#ddd" />
                  <Text style={styles.centeredMessageText}>
                    Search for item in database
                  </Text>
                </View>
              )}

              {/* Searching state */}
              {state.type === "searching" && (
                <View style={styles.centeredMessage}>
                  <ActivityIndicator size="large" color={TEAL} />
                  <Text style={styles.centeredMessageText}>Searching...</Text>
                </View>
              )}

              {/* Empty state */}
              {state.type === "empty" && (
                <View style={styles.centeredMessage}>
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
              {state.type === "error" && (
                <View style={styles.centeredMessage}>
                  <Ionicons name="warning-outline" size={48} color="#F5A623" />
                  <Text style={styles.centeredMessageText}>
                    {state.message}
                  </Text>
                </View>
              )}

              {/* Results list */}
              {state.type === "results" && (
                <KeyboardAwareScrollView
                  style={styles.resultsList}
                  contentContainerStyle={{
                    paddingBottom:
                      insets.bottom + 16 +
                      (selectedItems.length > 0 ? 90 : 0),
                  }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  showsVerticalScrollIndicator={false}
                  bounces={true}
                >
                  {commonResults.length > 0 && (
                    <>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionHeaderText}>Common Foods</Text>
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
                        renderResultCard(result, commonResults.length + index),
                      )}
                    </>
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
                  {/* Back to results */}
                  <TouchableOpacity
                    style={styles.detailBackButton}
                    onPress={handleBackToResults}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={18} color="#666" />
                    <Text style={styles.detailBackButtonText}>Results</Text>
                  </TouchableOpacity>

                  {/* Product info */}
                  <View style={styles.productHeader}>
                    <View style={styles.productHeaderTop}>
                      <View style={{ flex: 1 }}>
                        {state.result.brand && (
                          <Text style={styles.productBrand}>
                            {state.result.brand}
                          </Text>
                        )}
                        <Text style={styles.productName} numberOfLines={2}>
                          {state.result.name}
                        </Text>
                      </View>
                    </View>
                    {state.result.defaultServingLabel && (
                      <Text style={styles.servingHint}>
                        Typical serving: {state.result.defaultServingLabel}
                      </Text>
                    )}
                  </View>

                  {/* Serving stepper */}
                  <View style={styles.servingCard}>
                    <Text style={styles.servingLabel}>Serving</Text>
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() => handleServingStep(-10)}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="remove" size={18} color="#666" />
                      </TouchableOpacity>
                      <View style={styles.servingInputWrapper}>
                        <TextInput
                          style={styles.servingInput}
                          value={servingGrams}
                          onChangeText={setServingGrams}
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
                        <Ionicons name="add" size={18} color="#666" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Portion quick-select pills */}
                  {(portions.length > 0 || portionsLoading) && (
                    <Animated.View
                      entering={FadeIn.duration(200)}
                      style={styles.portionRow}
                    >
                      {portionsLoading ? (
                        <ActivityIndicator
                          size="small"
                          color="#999"
                          style={{ marginVertical: 4 }}
                        />
                      ) : (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.portionScrollContent}
                        >
                          {portions.map((portion, i) => (
                            <TouchableOpacity
                              key={`${portion.label}-${i}`}
                              style={styles.portionPill}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light,
                                );
                                setServingGrams(portion.grams.toString());
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.portionPillLabel}>
                                {portion.label}
                              </Text>
                              <Text style={styles.portionPillGrams}>
                                {portion.grams}g
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                    </Animated.View>
                  )}

                  {/* Macro pills */}
                  <View style={styles.macrosPreview}>
                    {[
                      {
                        key: "calories" as const,
                        value: previewMacros.kcal,
                        suffix: undefined as string | undefined,
                        label: "CAL",
                      },
                      {
                        key: "protein" as const,
                        value: previewMacros.protein,
                        suffix: "g" as string | undefined,
                        label: "PROTEIN",
                      },
                      {
                        key: "fat" as const,
                        value: previewMacros.fat,
                        suffix: "g" as string | undefined,
                        label: "FAT",
                      },
                      {
                        key: "carbs" as const,
                        value: previewMacros.carbs,
                        suffix: "g" as string | undefined,
                        label: "CARBS",
                      },
                    ].map((macro, i) => (
                      <Animated.View
                        key={macro.key}
                        entering={FadeInDown.delay(i * 80).duration(300)}
                        style={[
                          styles.macroPill,
                          {
                            backgroundColor: MACRO_COLORS[macro.key].secondary,
                          },
                        ]}
                      >
                        <FontAwesomeIcon
                          icon={MACRO_ICONS[macro.key]}
                          size={11}
                          color={MACRO_COLORS[macro.key].primary}
                        />
                        <View style={styles.macroPillValueRow}>
                          <AnimatedDigits
                            value={macro.value}
                            style={{
                              fontSize: 17,
                              fontWeight: "700",
                              color: "#333",
                            }}
                          />
                          {macro.suffix && (
                            <Text style={styles.macroPillSuffix}>
                              {macro.suffix}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.macroPillLabel}>{macro.label}</Text>
                      </Animated.View>
                    ))}
                  </View>

                  {/* Add button */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.backActionButton}
                      onPress={handleBackToResults}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="search-outline" size={18} color="#666" />
                      <Text style={styles.backActionText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={handleAdd}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={editingSelectedId ? "checkmark" : "add"}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.addButtonText}>
                        {detailAddLabel}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {/* Selection tray */}
              {selectedItems.length > 0 && state.type !== "detail" && (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  style={[
                    styles.selectionTray,
                    { paddingBottom: Math.max(insets.bottom, 12) },
                  ]}
                >
                  <View style={styles.selectionTrayTop}>
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
                          <View style={styles.selectionChipContent}>
                            <Text
                              style={styles.selectionChipName}
                              numberOfLines={1}
                            >
                              {item.result.name}
                            </Text>
                            <Text style={styles.selectionChipGrams}>
                              {item.servingGrams}g
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.selectionChipRemove}
                            onPress={() => handleRemoveSelected(item.id)}
                            hitSlop={{
                              top: 6,
                              bottom: 6,
                              left: 6,
                              right: 6,
                            }}
                          >
                            <Ionicons
                              name="close-circle"
                              size={16}
                              color="#999"
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.selectionDoneButton}
                      onPress={handleSubmitSelection}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.selectionDoneButtonText}>
                        Add ({selectedItems.length})
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.selectionSummary}>
                    {selectedItems.length}{" "}
                    {selectedItems.length === 1 ? "item" : "items"} ·{" "}
                    {selectionTotalCal} cal
                  </Text>
                </Animated.View>
              )}
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      </KeyboardProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
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
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f8f8",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  headerRightSpacer: {
    width: 36,
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
  },
  searchGlass: {
    borderRadius: 22,
    overflow: "hidden",
  },
  searchGlassFallback: {
    backgroundColor: Tokens.surfaceRaised,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: Tokens.textPrimary,
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  // Content area
  contentArea: {
    flex: 1,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 40,
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
  // Section headers
  sectionHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    marginBottom: 12,
    ...Tokens.shadowLight,
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
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textPrimary,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  resultBrand: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#999",
    marginTop: 2,
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
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Tokens.shadowLight,
  },
  productHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  productName: {
    fontSize: 19,
    fontWeight: "600",
    color: Tokens.textPrimary,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  productBrand: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  servingHint: {
    fontSize: 12,
    fontWeight: "400",
    color: "#bbb",
    marginTop: 8,
  },
  // Serving stepper (matches BarcodeScannerModal)
  servingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    ...Tokens.shadowLight,
  },
  servingLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#666",
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F0F0",
    borderRadius: 10,
    overflow: "hidden",
  },
  stepperButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  servingInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  servingInput: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    minWidth: 44,
    textAlign: "right",
    padding: 0,
  },
  servingUnit: {
    fontSize: 14,
    fontWeight: "400",
    color: "#999",
    marginLeft: 3,
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
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    minWidth: 72,
  },
  portionPillLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  portionPillGrams: {
    fontSize: 11,
    fontWeight: "400",
    color: "#999",
    marginTop: 2,
  },
  // Macro pills (matches BarcodeScannerModal)
  macrosPreview: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  macroPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    gap: 5,
  },
  macroPillValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  macroPillSuffix: {
    fontSize: 12,
    fontWeight: "500",
    color: "#999",
    marginLeft: 1,
  },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
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
    borderRadius: 14,
    backgroundColor: "#EBEBEB",
  },
  backActionText: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
  addButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: TEAL,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  // Selection tray
  selectionTray: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  selectionTrayTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectionChipsScroll: {
    flex: 1,
  },
  selectionChipsContainer: {
    gap: 8,
    paddingRight: 4,
  },
  selectionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2F1",
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 6,
    gap: 4,
  },
  selectionChipContent: {
    flexDirection: "column",
    maxWidth: 120,
  },
  selectionChipName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  selectionChipGrams: {
    fontSize: 10,
    fontWeight: "400",
    color: "#999",
  },
  selectionChipRemove: {
    padding: 2,
  },
  selectionSummary: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
    marginTop: 6,
    marginLeft: 2,
  },
  selectionDoneButton: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selectionDoneButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
