import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { DatabaseSearchModal } from "@/components/DatabaseSearchModal";
import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import { BarcodeProduct, CustomMeal, CustomMealItem, DatabaseSearchResult, Macros } from "@/types";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MenuView } from "@react-native-menu/menu";
import {
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
import Svg, { Circle } from "react-native-svg";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

const MACRO_COLORS = {
  calories: "#FF6B35",
  protein: "#4A90D9",
  fat: "#F5A623",
  carbs: "#9B6B9E",
};

interface MealBuilderModalProps {
  visible: boolean;
  onClose: () => void;
  editingMeal?: CustomMeal | null;
}

function computeMacrosForResult(
  result: DatabaseSearchResult,
  servingGrams: number,
): Macros {
  if (result.source === "FS") {
    const fsMacros =
      result.defaultServingMacros ?? result.fsServings?.[0]?.macros;
    if (fsMacros) {
      const ref =
        result.fsServings?.find((s) => s.metricUnit === "g") ??
        result.fsServings?.[0];
      const refGrams = ref?.metricAmount ?? 100;
      const scale = servingGrams / refGrams;
      return {
        kcal: Math.round(fsMacros.kcal * scale),
        protein: Math.round(fsMacros.protein * scale * 10) / 10,
        fat: Math.round(fsMacros.fat * scale * 10) / 10,
        carbs: Math.round(fsMacros.carbs * scale * 10) / 10,
      };
    }
  }

  if (result.macrosPer100g) {
    const m = result.macrosPer100g;
    const scale = servingGrams / 100;
    return {
      kcal: Math.round(m.kcal * scale),
      protein: Math.round(m.protein * scale * 10) / 10,
      fat: Math.round(m.fat * scale * 10) / 10,
      carbs: Math.round(m.carbs * scale * 10) / 10,
    };
  }

  return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
}

export function MealBuilderModal({
  visible,
  onClose,
  editingMeal,
}: MealBuilderModalProps) {
  const insets = useSafeAreaInsets();
  const addCustomMeal = useAppStore((s) => s.addCustomMeal);
  const updateCustomMeal = useAppStore((s) => s.updateCustomMeal);

  const [name, setName] = useState("");
  const [items, setItems] = useState<CustomMealItem[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
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

  const handleAddItems = useCallback(
    (
      addedItems: { result: DatabaseSearchResult; servingGrams: number }[],
    ) => {
      const newItems: CustomMealItem[] = addedItems.map(
        ({ result, servingGrams }, index) => {
          const macros = computeMacrosForResult(result, servingGrams);
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
    <>
      <Modal
        visible={visible && !showSearch && !showBarcodeScanner}
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
                { marginTop: insets.top },
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
                        tintColor={Tokens.accent}
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
                <TextInput
                  style={styles.nameInput}
                  placeholder="Meal name"
                  placeholderTextColor={Tokens.textTertiary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="done"
                />

                {(() => {
                  const RING_SIZE = 88;
                  const STROKE = 7;
                  const R = (RING_SIZE - STROKE) / 2;
                  const CIRC = 2 * Math.PI * R;
                  const proteinKcal = totalMacros.protein * 4;
                  const carbsKcal = totalMacros.carbs * 4;
                  const fatKcal = totalMacros.fat * 9;
                  const total = proteinKcal + carbsKcal + fatKcal;
                  const pPct = total > 0 ? proteinKcal / total : 0;
                  const cPct = total > 0 ? carbsKcal / total : 0;
                  const fPct = total > 0 ? fatKcal / total : 0;
                  // segments: protein, carbs, fat
                  const segments = [
                    { pct: fPct, color: MACRO_COLORS.fat, offset: 0 },
                    { pct: cPct, color: MACRO_COLORS.carbs, offset: fPct },
                    { pct: pPct, color: MACRO_COLORS.protein, offset: fPct + cPct },
                  ];
                  const macroRows = [
                    { label: "Fat", pct: fPct, value: totalMacros.fat, color: MACRO_COLORS.fat },
                    { label: "Carbs", pct: cPct, value: totalMacros.carbs, color: MACRO_COLORS.carbs },
                    { label: "Protein", pct: pPct, value: totalMacros.protein, color: MACRO_COLORS.protein },
                  ];
                  return (
                    <View style={styles.donutContainer}>
                      <View style={styles.donutRingWrapper}>
                        <Svg width={RING_SIZE} height={RING_SIZE}>
                          <Circle
                            cx={RING_SIZE / 2}
                            cy={RING_SIZE / 2}
                            r={R}
                            stroke={Tokens.border}
                            strokeWidth={STROKE}
                            fill="none"
                          />
                          {total > 0 && segments.map((seg, i) => (
                            <Circle
                              key={i}
                              cx={RING_SIZE / 2}
                              cy={RING_SIZE / 2}
                              r={R}
                              stroke={seg.color}
                              strokeWidth={STROKE}
                              fill="none"
                              strokeDasharray={`${seg.pct * CIRC} ${CIRC}`}
                              strokeDashoffset={-seg.offset * CIRC}
                              strokeLinecap="round"
                              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                            />
                          ))}
                        </Svg>
                        <View style={styles.donutCenter}>
                          <Text style={styles.donutKcalValue}>{Math.round(totalMacros.kcal)}</Text>
                          <Text style={styles.donutKcalLabel}>kcal</Text>
                        </View>
                      </View>
                      <View style={styles.donutMacroList}>
                        {macroRows.map((row) => (
                          <View key={row.label} style={styles.donutMacroRow}>
                            <Text style={[styles.donutMacroLabel, { color: row.color }]}>
                              {row.label}
                            </Text>
                            <Text style={styles.donutMacroPct}>
                              {total > 0 ? Math.round(row.pct * 100) : 0}%
                            </Text>
                            <Text style={styles.donutMacroGrams}>
                              {Math.round(row.value)}g
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()}

                <Text style={styles.sectionLabel}>Ingredients</Text>

                {items.map((item, index) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.delay(index * 30).duration(200)}
                    style={styles.itemCard}
                  >
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemLabel} numberOfLines={1}>
                        {item.label}
                        {item.brand && (
                          <Text style={styles.itemBrand}> · {item.brand}</Text>
                        )}
                      </Text>
                      <Text style={styles.itemServing}>
                        {Math.round(item.servingGrams)}g
                      </Text>
                    </View>
                    <View style={styles.itemRight}>
                      <Text style={styles.itemKcal}>
                        {Math.round(item.macros.kcal)} cal
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveItem(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.removeButton}
                      >
                        <Ionicons name="close-circle" size={20} color="#ccc" />
                      </TouchableOpacity>
                    </View>
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
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Modal>

      <DatabaseSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onAddEntries={handleAddItems}
      />

      <BarcodeScannerModal
        visible={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onAddProduct={handleBarcodeProduct}
        onAddManualEntry={() => setShowBarcodeScanner(false)}
      />
    </>
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
  nameInput: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
    padding: 0,
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Tokens.border,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 6,
    ...Tokens.shadowLight,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemLabel: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  itemBrand: {
    fontWeight: "400",
    color: Tokens.textSecondary,
  },
  itemServing: {
    fontSize: 13,
    fontWeight: "400",
    color: Tokens.textSecondary,
    marginTop: 2,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemKcal: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  removeButton: {
    padding: 2,
  },
  addItemButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Tokens.border,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addItemText: {
    fontSize: 15,
    fontWeight: "500",
    color: Tokens.textSecondary,
  },
  donutContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
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
  },
  donutMacroLabel: {
    fontSize: 14,
    fontWeight: "600",
    width: 60,
    letterSpacing: -0.2,
  },
  donutMacroPct: {
    fontSize: 13,
    fontWeight: "400",
    color: Tokens.textSecondary,
    width: 36,
  },
  donutMacroGrams: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
    textAlign: "right",
    flex: 1,
    letterSpacing: -0.2,
  },
});
