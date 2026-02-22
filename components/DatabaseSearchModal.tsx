import { AnimatedDigits } from "@/components/AnimatedDigits";
import {
  searchFoodDatabase,
  FoodSearchError,
} from "@/services/foodSearchApi";
import { scaleMacrosToServing } from "@/services/barcodeService";
import { DatabaseSearchResult, Macros } from "@/types";
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
const TEAL = "#0a7ea4";
const DEBOUNCE_MS = 400;

const MACRO_COLORS = {
  calories: { primary: "#FF6B35" },
  protein: { primary: "#4A90D9" },
  fat: { primary: "#F5A623" },
  carbs: { primary: "#9B6B9E" },
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

type SourceFilter = "all" | "FDC" | "OFF";

interface DatabaseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onAddEntry: (result: DatabaseSearchResult, servingGrams: number) => void;
}

export function DatabaseSearchModal({
  visible,
  onClose,
  onAddEntry,
}: DatabaseSearchModalProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ModalState>({ type: "idle" });
  const [searchText, setSearchText] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [servingGrams, setServingGrams] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [allResults, setAllResults] = useState<DatabaseSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setState({ type: "idle" });
      setSearchText("");
      setSourceFilter("all");
      setServingGrams("");
      setAllResults([]);
      translateY.value = 0;
      // Auto-focus search input
      setTimeout(() => searchInputRef.current?.focus(), 300);
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
        setAllResults(response.results);

        if (response.results.length === 0) {
          setState({ type: "empty" });
        } else {
          setState({ type: "results", results: response.results });
        }
      } catch (err) {
        const message = err instanceof FoodSearchError
          ? err.message
          : "Something went wrong";
        setState({ type: "error", message });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  // Apply source filter to results
  const filteredResults = sourceFilter === "all"
    ? allResults
    : allResults.filter((r) => r.source === sourceFilter);

  // Update displayed results when filter changes
  useEffect(() => {
    if (state.type === "results" || (state.type !== "detail" && allResults.length > 0)) {
      if (filteredResults.length === 0 && allResults.length > 0) {
        setState({ type: "empty" });
      } else if (filteredResults.length > 0) {
        setState({ type: "results", results: filteredResults });
      }
    }
  }, [sourceFilter]);

  const handleSelectResult = useCallback((result: DatabaseSearchResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    const defaultServing = result.defaultServingG ?? 100;
    setServingGrams(defaultServing.toString());
    setState({ type: "detail", result });
  }, []);

  const handleBackToResults = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (filteredResults.length > 0) {
      setState({ type: "results", results: filteredResults });
    } else {
      setState({ type: "idle" });
    }
    setServingGrams("");
  }, [filteredResults]);

  const handleAdd = useCallback(() => {
    if (state.type !== "detail") return;
    const grams = parseFloat(servingGrams) || 100;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddEntry(state.result, grams);
  }, [state, servingGrams, onAddEntry]);

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
    [servingGrams]
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
          parseFloat(servingGrams) || 100
        )
      : null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
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
              { marginTop: insets.top },
              animatedStyle,
            ]}
          >
            {/* Drag indicator */}
            <View style={styles.dragIndicatorContainer} pointerEvents="none">
              <View style={styles.dragIndicator} />
            </View>

            {/* Header with close button */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-down" size={26} color="#666" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Search Foods</Text>
              <View style={{ width: 48 }} />
            </View>

            {/* Search bar */}
            <View style={styles.searchBarContainer}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color="#999" />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  placeholder="Search foods (e.g. chicken breast)"
                  placeholderTextColor="#999"
                  value={searchText}
                  onChangeText={setSearchText}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {searchText.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchText("")}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="close-circle" size={18} color="#ccc" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Source filter pills */}
            {allResults.length > 0 && state.type !== "detail" && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.filterRow}>
                {(["all", "FDC", "OFF"] as SourceFilter[]).map((filter) => {
                  const isActive = sourceFilter === filter;
                  const label = filter === "all" ? "All" : filter === "FDC" ? "USDA" : "OFF";
                  return (
                    <TouchableOpacity
                      key={filter}
                      style={[
                        styles.filterPill,
                        isActive && styles.filterPillActive,
                      ]}
                      onPress={() => setSourceFilter(filter)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          isActive && styles.filterPillTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            )}

            {/* Content area */}
            <View style={styles.contentArea}>
              {/* Idle state */}
              {state.type === "idle" && (
                <View style={styles.centeredMessage}>
                  <Ionicons name="nutrition-outline" size={48} color="#ddd" />
                  <Text style={styles.centeredMessageText}>
                    Search USDA and Open Food Facts databases
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
                  <Text style={styles.centeredMessageText}>{state.message}</Text>
                </View>
              )}

              {/* Results list */}
              {state.type === "results" && (
                <ScrollView
                  style={styles.resultsList}
                  contentContainerStyle={{
                    paddingBottom: keyboardHeight || insets.bottom + 16,
                  }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                >
                  {filteredResults.map((result, index) => (
                    <Animated.View
                      key={`${result.source}-${result.fdcId ?? result.offId ?? index}`}
                      entering={FadeInDown.delay(index * 30).duration(200)}
                    >
                      <TouchableOpacity
                        style={styles.resultCard}
                        onPress={() => handleSelectResult(result)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.resultCardTop}>
                          <View style={styles.resultCardInfo}>
                            <Text style={styles.resultName} numberOfLines={2}>
                              {result.name}
                            </Text>
                            {result.brand && (
                              <Text style={styles.resultBrand} numberOfLines={1}>
                                {result.brand}
                              </Text>
                            )}
                          </View>
                          <View
                            style={[
                              styles.sourceBadge,
                              result.source === "FDC"
                                ? styles.sourceBadgeFDC
                                : styles.sourceBadgeOFF,
                            ]}
                          >
                            <Text
                              style={[
                                styles.sourceBadgeText,
                                result.source === "FDC"
                                  ? styles.sourceBadgeTextFDC
                                  : styles.sourceBadgeTextOFF,
                              ]}
                            >
                              {result.source === "FDC" ? "USDA" : "OFF"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.resultMacroRow}>
                          <Text style={styles.resultMacroItem}>
                            {result.macrosPer100g.kcal} kcal
                          </Text>
                          <Text style={styles.resultMacroDot}>{"\u00B7"}</Text>
                          <Text style={styles.resultMacroItem}>
                            {result.macrosPer100g.protein}g P
                          </Text>
                          <Text style={styles.resultMacroDot}>{"\u00B7"}</Text>
                          <Text style={styles.resultMacroItem}>
                            {result.macrosPer100g.fat}g F
                          </Text>
                          <Text style={styles.resultMacroDot}>{"\u00B7"}</Text>
                          <Text style={styles.resultMacroItem}>
                            {result.macrosPer100g.carbs}g C
                          </Text>
                          <Text style={styles.resultMacroSuffix}> /100g</Text>
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </ScrollView>
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
                  {/* Back button */}
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBackToResults}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={18} color="#666" />
                    <Text style={styles.backButtonText}>Results</Text>
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
                      <View
                        style={[
                          styles.sourceBadge,
                          state.result.source === "FDC"
                            ? styles.sourceBadgeFDC
                            : styles.sourceBadgeOFF,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sourceBadgeText,
                            state.result.source === "FDC"
                              ? styles.sourceBadgeTextFDC
                              : styles.sourceBadgeTextOFF,
                          ]}
                        >
                          {state.result.source === "FDC" ? "USDA" : "OFF"}
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

                  {/* Macro pills */}
                  <View style={styles.macrosPreview}>
                    {(
                      [
                        { key: "calories" as const, value: previewMacros.kcal, suffix: undefined as string | undefined, label: "CAL" },
                        { key: "protein" as const, value: previewMacros.protein, suffix: "g" as string | undefined, label: "PROTEIN" },
                        { key: "fat" as const, value: previewMacros.fat, suffix: "g" as string | undefined, label: "FAT" },
                        { key: "carbs" as const, value: previewMacros.carbs, suffix: "g" as string | undefined, label: "CARBS" },
                      ]
                    ).map((macro, i) => (
                      <Animated.View
                        key={macro.key}
                        entering={FadeInDown.delay(i * 80).duration(300)}
                        style={[
                          styles.macroPill,
                          { backgroundColor: `${MACRO_COLORS[macro.key].primary}18` },
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
                      <Ionicons name="add" size={20} color="#fff" />
                      <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
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
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
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
    paddingTop: 20,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  closeButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  // Search bar
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "400",
    color: "#1a1a1a",
    padding: 0,
  },
  // Source filter
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  filterPillActive: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  filterPillTextActive: {
    color: "#fff",
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
  // Results list
  resultsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  resultCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  resultCardInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  resultBrand: {
    fontSize: 12,
    fontWeight: "500",
    color: "#999",
    marginTop: 2,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceBadgeFDC: {
    backgroundColor: "#EBF5FF",
  },
  sourceBadgeOFF: {
    backgroundColor: "#ECFDF5",
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sourceBadgeTextFDC: {
    color: "#3B82F6",
  },
  sourceBadgeTextOFF: {
    color: "#10B981",
  },
  resultMacroRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  resultMacroItem: {
    fontSize: 12,
    fontWeight: "500",
    color: "#888",
  },
  resultMacroDot: {
    fontSize: 12,
    color: "#ccc",
    marginHorizontal: 5,
  },
  resultMacroSuffix: {
    fontSize: 11,
    fontWeight: "400",
    color: "#bbb",
  },
  // Detail view
  detailContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#666",
  },
  productHeader: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
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
    color: "#1a1a1a",
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
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  servingLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#666",
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4f4f4",
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
    color: "#888",
    marginLeft: 3,
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
    color: "#888",
    marginLeft: 1,
  },
  macroPillLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#888",
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
    backgroundColor: "#e5e5e5",
  },
  backActionText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#666",
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
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
});
