import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { DatabaseSearchModal } from "@/components/DatabaseSearchModal";
import { MealNutritionFactsModal } from "@/components/MealNutritionFactsModal";
import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import { BarcodeProduct, CustomMeal, CustomMealItem, DatabaseSearchResult, ExtendedNutrients, Macros } from "@/types";
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MenuView } from "@react-native-menu/menu";
import {
  Alert,
  Dimensions,
  Keyboard,
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
  Swipeable,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeInDown,
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

const MACRO_COLORS = {
  calories: Tokens.macroKcal,
  protein: Tokens.macroProtein,
  fat: Tokens.macroFat,
  carbs: Tokens.macroCarbs,
};

const MACRO_ICON_COLORS = {
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

interface MealBuilderModalProps {
  visible: boolean;
  onClose: () => void;
  editingMeal?: CustomMeal | null;
  nested?: boolean;
}

function computeMacrosForResult(
  result: DatabaseSearchResult,
  servingGrams: number,
): Macros {
  if (result.source === "FS" && result.fsServings?.length) {
    // Use the first fsServing as the reference (DatabaseSearchModal reorders
    // so the selected serving is first)
    const ref = result.fsServings[0];
    const refGrams = ref.metricAmount ?? 100;
    return scaleMacros(ref.macros, servingGrams / refGrams);
  }

  if (result.macrosPer100g) {
    return scaleMacros(result.macrosPer100g, servingGrams / 100);
  }

  return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
}

function scaleMacros(m: Macros, scale: number): Macros {
  const out: Macros = {
    kcal: Math.round(m.kcal * scale),
    protein: Math.round(m.protein * scale * 10) / 10,
    fat: Math.round(m.fat * scale * 10) / 10,
    carbs: Math.round(m.carbs * scale * 10) / 10,
  };
  if (m.fiber != null) out.fiber = Math.round(m.fiber * scale * 10) / 10;
  if (m.sugar != null) out.sugar = Math.round(m.sugar * scale * 10) / 10;
  if (m.sodium != null) out.sodium = Math.round(m.sodium * scale);
  if (m.potassium != null) out.potassium = Math.round(m.potassium * scale);
  if (m.water != null) out.water = Math.round(m.water * scale);
  return out;
}

function computeExtendedNutrientsForResult(
  result: DatabaseSearchResult,
  servingGrams: number,
): ExtendedNutrients | undefined {
  if (result.source === "FS" && result.fsServings?.length) {
    const ref = result.fsServings[0];
    const ext = ref.extendedNutrients;
    if (!ext) return undefined;
    const refGrams = ref.metricAmount ?? 100;
    const scale = servingGrams / refGrams;
    const scaled: Record<string, number> = {};
    for (const [key, val] of Object.entries(ext)) {
      if (val != null) scaled[key] = Math.round(val * scale * 100) / 100;
    }
    return Object.keys(scaled).length > 0 ? (scaled as ExtendedNutrients) : undefined;
  }

  if (result.extendedNutrientsPer100g) {
    const ext = result.extendedNutrientsPer100g as Record<string, number>;
    const scale = servingGrams / 100;
    const scaled: Record<string, number> = {};
    for (const [key, val] of Object.entries(ext)) {
      if (val != null) scaled[key] = Math.round(val * scale * 100) / 100;
    }
    return Object.keys(scaled).length > 0 ? (scaled as ExtendedNutrients) : undefined;
  }

  return undefined;
}

export function MealBuilderModal({
  visible,
  onClose,
  editingMeal,
  nested,
}: MealBuilderModalProps) {
  const insets = useSafeAreaInsets();
  const addCustomMeal = useAppStore((s) => s.addCustomMeal);
  const updateCustomMeal = useAppStore((s) => s.updateCustomMeal);
  const deleteCustomMeal = useAppStore((s) => s.deleteCustomMeal);

  const [name, setName] = useState("");
  const [items, setItems] = useState<CustomMealItem[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showNutritionFacts, setShowNutritionFacts] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const editingItemIdRef = useRef<string | null>(null);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (editingMeal) {
        setName(editingMeal.name);
        setItems([...editingMeal.items]);
      } else {
        setName("");
        setItems([]);
      }
      translateY.value = 0;
    }
  }, [visible]);

  const totalMacros = useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.macros.kcal,
        protein: acc.protein + item.macros.protein,
        fat: acc.fat + item.macros.fat,
        carbs: acc.carbs + item.macros.carbs,
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0 } as Macros,
    );
  }, [items]);

  const canSave = name.trim().length > 0 && items.length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (editingMeal) {
      updateCustomMeal(editingMeal.id, name.trim(), items);
    } else {
      addCustomMeal(name.trim(), items);
    }
    onClose();
  }, [canSave, editingMeal, name, items, addCustomMeal, updateCustomMeal, onClose]);

  const handleDeleteMeal = useCallback(() => {
    if (!editingMeal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Delete Meal",
      `Delete "${editingMeal.name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteCustomMeal(editingMeal.id);
            onClose();
          },
        },
      ],
    );
  }, [editingMeal, deleteCustomMeal, onClose]);

  const handleAddItems = useCallback(
    (
      addedItems: { result: DatabaseSearchResult; servingGrams: number; macroOverrides?: Partial<Macros> }[],
    ) => {
      const newItems: CustomMealItem[] = addedItems.map(
        ({ result, servingGrams, macroOverrides: overrides }, index) => {
          const macros = { ...computeMacrosForResult(result, servingGrams), ...overrides };
          const extendedNutrients = computeExtendedNutrientsForResult(result, servingGrams);
          const defaultServing =
            result.source === "FS"
              ? (result.fsServings?.find((s) => s.metricUnit === "g") ??
                result.fsServings?.[0])
              : undefined;

          return {
            id: `meal-item-${Date.now()}-${index}`,
            label: result.name,
            brand: result.brand,
            source: result.source,
            sourceId:
              result.foodId ?? String(result.fdcId ?? result.offId ?? ""),
            servingGrams,
            macros,
            macrosPer100g: result.macrosPer100g,
            extendedNutrients,
            extendedNutrientsPer100g: result.extendedNutrientsPer100g,
            fsServings: result.fsServings,
            fsSelectedServingId: defaultServing?.servingId,
          };
        },
      );
      setItems((prev) => [...prev, ...newItems]);
      setShowSearch(false);
    },
    [],
  );

  const handleUpdateItem = useCallback(
    ({ result, servingGrams, macroOverrides: overrides }: { result: DatabaseSearchResult; servingGrams: number; macroOverrides?: Partial<Macros> }) => {
      const currentEditingId = editingItemIdRef.current;
      if (!currentEditingId) return;
      const macros = { ...computeMacrosForResult(result, servingGrams), ...overrides };
      const extendedNutrients = computeExtendedNutrientsForResult(result, servingGrams);
      const defaultServing =
        result.source === "FS"
          ? (result.fsServings?.find((s) => s.metricUnit === "g") ??
            result.fsServings?.[0])
          : undefined;
      setItems((prev) =>
        prev.map((item) =>
          item.id === currentEditingId
            ? {
                ...item,
                servingGrams,
                macros,
                macrosPer100g: result.macrosPer100g,
                extendedNutrients,
                extendedNutrientsPer100g: result.extendedNutrientsPer100g,
                fsServings: result.fsServings,
                fsSelectedServingId: defaultServing?.servingId,
              }
            : item,
        ),
      );
      editingItemIdRef.current = null;
      setEditingItemId(null);
      setShowSearch(false);
    },
    [],
  );

  const handleRemoveEditingItem = useCallback(() => {
    const currentEditingId = editingItemIdRef.current;
    if (!currentEditingId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setItems((prev) => prev.filter((item) => item.id !== currentEditingId));
    editingItemIdRef.current = null;
    setEditingItemId(null);
    setShowSearch(false);
  }, []);

  const handleBarcodeProduct = useCallback(
    (product: BarcodeProduct, selectedServingId?: string) => {
      const serving = selectedServingId
        ? product.servings.find((s) => s.servingId === selectedServingId)
        : product.servings[0];
      if (!serving) return;

      const macros: Macros = {
        kcal: Math.round(serving.macros.kcal),
        protein: Math.round(serving.macros.protein * 10) / 10,
        fat: Math.round(serving.macros.fat * 10) / 10,
        carbs: Math.round(serving.macros.carbs * 10) / 10,
        ...(serving.macros.fiber != null && { fiber: serving.macros.fiber }),
        ...(serving.macros.sugar != null && { sugar: serving.macros.sugar }),
        ...(serving.macros.sodium != null && { sodium: serving.macros.sodium }),
        ...(serving.macros.potassium != null && { potassium: serving.macros.potassium }),
      };

      const newItem: CustomMealItem = {
        id: `meal-item-${Date.now()}`,
        label: product.name,
        brand: product.brand,
        source: "FS",
        sourceId: product.foodId,
        servingGrams: serving.metricAmount ?? 100,
        servingLabel: serving.description,
        macros,
        extendedNutrients: serving.extendedNutrients as ExtendedNutrients | undefined,
        fsServings: product.servings,
        fsSelectedServingId: serving.servingId,
      };

      setItems((prev) => [...prev, newItem]);
      setShowBarcodeScanner(false);
    },
    [],
  );

  const handleRemoveItem = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleEditItem = useCallback((item: CustomMealItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    editingItemIdRef.current = item.id;
    setEditingItemId(item.id);
    setShowSearch(true);
  }, []);

  // Reconstruct DatabaseSearchResult from the item being edited
  const editingItemResult: DatabaseSearchResult | null = useMemo(() => {
    if (!editingItemId) return null;
    const item = items.find((i) => i.id === editingItemId);
    if (!item) return null;
    return {
      source: item.source,
      foodId: item.source === "FS" ? item.sourceId : undefined,
      fdcId: item.source === "FDC" ? Number(item.sourceId) : undefined,
      offId: item.source === "OFF" ? item.sourceId : undefined,
      name: item.label,
      brand: item.brand,
      macrosPer100g: item.macrosPer100g ?? item.macros,
      extendedNutrientsPer100g: item.extendedNutrientsPer100g,
      defaultServingG: item.servingGrams,
      defaultServingLabel: item.servingLabel,
      fsServings: item.fsServings,
      defaultServingMacros: item.macros,
    } as DatabaseSearchResult;
  }, [editingItemId, items]);

  const editingItemGrams = useMemo(() => {
    if (!editingItemId) return undefined;
    return items.find((i) => i.id === editingItemId)?.servingGrams;
  }, [editingItemId, items]);

  const handleMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (nativeEvent.event === "scan") setShowBarcodeScanner(true);
      else if (nativeEvent.event === "search") setShowSearch(true);
    },
    [],
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

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
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleClose}
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
              <View style={styles.dragIndicatorContainer}>
                <View style={styles.dragIndicator} />
              </View>

              <View style={styles.header}>
                <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                  {isLiquidGlassSupported ? (
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
                <Text style={styles.headerTitle}>
                  {editingMeal ? "Edit Meal" : "New Meal"}
                </Text>
                <TouchableOpacity
                  onPress={handleSave}
                  activeOpacity={canSave ? 0.7 : 1}
                  disabled={!canSave}
                >
                  {canSave ? (
                    isLiquidGlassSupported ? (
                      <LiquidGlassView
                        style={[styles.backButton, { backgroundColor: Tokens.accent }]}
                        interactive
                        effect="regular"
                        tintColor={Tokens.tintColor}
                      >
                        <Ionicons name="checkmark" size={20} color={Tokens.accent} />
                      </LiquidGlassView>
                    ) : (
                      <View style={[styles.backButton, { backgroundColor: Tokens.accent }]}>
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </View>
                    )
                  ) : (
                    <View style={[styles.backButton, styles.backButtonFallback]}>
                      <Ionicons name="checkmark" size={20} color={Tokens.textTertiary} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.nameInputRow}>
                  <TextInput
                    style={styles.nameInput}
                    placeholder="New Meal"
                    placeholderTextColor={Tokens.textTertiary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                  <Ionicons name="pencil" size={16} color={Tokens.textTertiary} />
                </View>

                {(() => {
                  const RING_SIZE = 88;
                  const STROKE = 7;
                  const R = (RING_SIZE - STROKE) / 2;
                  const CX = RING_SIZE / 2;
                  const CY = RING_SIZE / 2;
                  const proteinKcal = totalMacros.protein * 4;
                  const carbsKcal = totalMacros.carbs * 4;
                  const fatKcal = totalMacros.fat * 9;
                  const total = proteinKcal + carbsKcal + fatKcal;

                  const arcSegments: { pct: number; color: string }[] = total > 0
                    ? [
                        { pct: proteinKcal / total, color: MACRO_COLORS.protein },
                        { pct: carbsKcal / total, color: MACRO_COLORS.carbs },
                        { pct: fatKcal / total, color: MACRO_COLORS.fat },
                      ]
                    : [];

                  const GAP = 0.04; // radians gap between segments
                  const nonZero = arcSegments.filter((s) => s.pct > 0);
                  const totalGap = nonZero.length > 1 ? GAP * nonZero.length : 0;
                  const usable = 2 * Math.PI - totalGap;

                  let cursor = -Math.PI / 2; // start at 12 o'clock
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
                    { label: "Protein", value: totalMacros.protein, icon: MACRO_ICONS.protein, iconColor: MACRO_ICON_COLORS.protein.primary },
                    { label: "Carbs", value: totalMacros.carbs, icon: MACRO_ICONS.carbs, iconColor: MACRO_ICON_COLORS.carbs.primary },
                    { label: "Fat", value: totalMacros.fat, icon: MACRO_ICONS.fat, iconColor: MACRO_ICON_COLORS.fat.primary },
                  ];
                  return (
                    <View style={styles.nutritionSection}>
                      <View style={styles.nutritionHeader}>
                        <Text style={[styles.sectionLabel, styles.nutritionHeaderLabel]}>
                          Nutrition
                        </Text>
                        <TouchableOpacity
                          style={styles.nutritionDetailsButton}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setShowNutritionFacts(true);
                          }}
                          activeOpacity={0.6}
                          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                        >
                          <Text style={styles.nutritionDetailsText}>See All</Text>
                          <Ionicons
                            name="chevron-forward"
                            size={14}
                            color={Tokens.accent}
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.donutContainer}>
                      <View style={styles.donutRingWrapper}>
                        <Svg width={RING_SIZE} height={RING_SIZE}>
                          <Circle
                            cx={CX}
                            cy={CY}
                            r={R}
                            stroke={arcs.length > 0 ? "#FCFCFB" : Tokens.border}
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
                          <Text style={styles.donutKcalValue}>{Math.round(totalMacros.kcal)}</Text>
                          <Text style={styles.donutKcalLabel}>cal</Text>
                        </View>
                      </View>
                      <View style={styles.donutMacroList}>
                        {macroRows.map((row) => (
                          <View key={row.label} style={styles.donutMacroRow}>
                            <FontAwesomeIcon icon={row.icon} size={12} color={row.iconColor} />
                            <Text style={styles.donutMacroLabel}>{row.label}</Text>
                            <Text style={styles.donutMacroGrams}>
                              {Math.round(row.value)}<Text style={styles.donutMacroUnit}>g</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                      </View>
                    </View>
                  );
                })()}

                <Text style={styles.sectionLabel}>Ingredients</Text>

                {items.map((item, index) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.delay(index * 30).duration(200)}
                  >
                    <Swipeable
                      renderRightActions={() => (
                        <TouchableOpacity
                          style={styles.deleteAction}
                          onPress={() => handleRemoveItem(item.id)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#fff" />
                        </TouchableOpacity>
                      )}
                      overshootRight={false}
                    >
                      <TouchableOpacity
                        style={styles.itemCard}
                        onPress={() => handleEditItem(item)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.itemContent}>
                          <Text style={styles.itemLabel} numberOfLines={1}>
                            {item.label}
                          </Text>
                          <View style={styles.itemMacrosRow}>
                            <View style={styles.macroItem}>
                              <FontAwesomeIcon
                                icon={MACRO_ICONS.calories}
                                size={10}
                                color={MACRO_ICON_COLORS.calories.primary}
                              />
                              <Text style={styles.macroValue}>
                                {Math.round(item.macros.kcal)}
                              </Text>
                            </View>
                            <View style={styles.macroItem}>
                              <FontAwesomeIcon
                                icon={MACRO_ICONS.protein}
                                size={10}
                                color={MACRO_ICON_COLORS.protein.primary}
                              />
                              <Text style={styles.macroValue}>
                                {Math.round(item.macros.protein)}g
                              </Text>
                            </View>
                            <View style={styles.macroItem}>
                              <FontAwesomeIcon
                                icon={MACRO_ICONS.fat}
                                size={10}
                                color={MACRO_ICON_COLORS.fat.primary}
                              />
                              <Text style={styles.macroValue}>
                                {Math.round(item.macros.fat)}g
                              </Text>
                            </View>
                            <View style={styles.macroItem}>
                              <FontAwesomeIcon
                                icon={MACRO_ICONS.carbs}
                                size={10}
                                color={MACRO_ICON_COLORS.carbs.primary}
                              />
                              <Text style={styles.macroValue}>
                                {Math.round(item.macros.carbs)}g
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </Swipeable>
                  </Animated.View>
                ))}

                <MenuView
                  onPressAction={handleMenuAction}
                  actions={[
                    {
                      id: "scan",
                      title: "Scan barcode",
                      image: "barcode.viewfinder",
                      imageColor: "#000000",
                    },
                    {
                      id: "search",
                      title: "Search food",
                      image: "magnifyingglass",
                      imageColor: "#000000",
                    },
                  ]}
                >
                  <View style={styles.addItemButton}>
                    <Ionicons name="add" size={20} color={Tokens.textSecondary} />
                    <Text style={styles.addItemText}>Add Ingredients</Text>
                  </View>
                </MenuView>

                {editingMeal && (
                  <TouchableOpacity
                    style={styles.deleteMealButton}
                    onPress={handleDeleteMeal}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color={Tokens.error} />
                    <Text style={styles.deleteMealButtonText}>Delete Meal</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>

        <DatabaseSearchModal
          visible={showSearch}
          onClose={() => {
            setShowSearch(false);
            editingItemIdRef.current = null;
            setEditingItemId(null);
          }}
          onAddEntries={handleAddItems}
          onUpdateEntry={editingItemId ? handleUpdateItem : undefined}
          onRemoveEntry={editingItemId ? handleRemoveEditingItem : undefined}
          nested
          initialResult={editingItemResult}
          initialServingGrams={editingItemGrams}
        />

        <BarcodeScannerModal
          visible={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          onAddProduct={handleBarcodeProduct}
          onAddManualEntry={() => setShowBarcodeScanner(false)}
          nested
        />

        <MealNutritionFactsModal
          visible={showNutritionFacts}
          items={items}
          onClose={() => setShowNutritionFacts(false)}
        />
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
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerTitle: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  nameInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
  },
  nameInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
    padding: 0,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B6B6B",
    textTransform: "capitalize",
    marginBottom: 10,
    marginLeft: 0,
  },
  itemCard: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: "#E5E5E5",
    padding: 16,
    marginBottom: 6,
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 8,
  },
  itemMacrosRow: {
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
  deleteAction: {
    backgroundColor: "#F87171",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 16,
    marginLeft: 8,
    marginBottom: 6,
  },
  addItemButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: "#E5E5E5",
    backgroundColor: Tokens.surfaceRaised,
    marginTop: 4,
  },
  addItemText: {
    fontSize: 15,
    fontWeight: "500",
    color: Tokens.textSecondary,
  },
  deleteMealButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 12,
  },
  deleteMealButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Tokens.error,
  },
  nutritionSection: {
    marginBottom: 24,
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
});
