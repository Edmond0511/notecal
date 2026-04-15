import { AnimatedDigits } from "@/components/AnimatedDigits";
import { EditNutrientPopup } from "@/components/NutritionReasoningPopup";
import { Tokens } from "@/constants/theme";
import {
  BarcodeLookupError,
  BarcodeNotFoundError,
  lookupBarcode,
} from "@/services/barcodeService";
import { BarcodeProduct, FatSecretServing, Macros } from "@/types";
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
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Linking,
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
import Svg, { Defs, Mask, Rect } from "react-native-svg";

// Lazy-load expo-camera to avoid crashing before native rebuild
let CameraView: any = null;
let useCameraPermissions: any = null;
let cameraAvailable = false;

try {
  const mod = require("expo-camera");
  CameraView = mod.CameraView;
  useCameraPermissions = mod.useCameraPermissions;
  cameraAvailable = true;
} catch {
  cameraAvailable = false;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const VIEWFINDER_WIDTH = SCREEN_WIDTH * 0.78;
const VIEWFINDER_HEIGHT = SCREEN_WIDTH * 0.44;
const VIEWFINDER_RADIUS = 20;

const DISMISS_THRESHOLD = 150;
const TEAL = "#1A6872";

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

const EXTENDED_NUTRIENT_LABELS: Record<string, string> = {
  saturatedFat: "Saturated Fat",
  polyunsaturatedFat: "Polyunsaturated Fat",
  monounsaturatedFat: "Monounsaturated Fat",
  transFat: "Trans Fat",
  cholesterol: "Cholesterol",
  calcium: "Calcium",
  iron: "Iron",
  magnesium: "Magnesium",
  phosphorus: "Phosphorus",
  zinc: "Zinc",
  vitaminA: "Vitamin A",
  vitaminC: "Vitamin C",
  vitaminD: "Vitamin D",
  vitaminE: "Vitamin E",
  vitaminK: "Vitamin K",
  vitaminB6: "Vitamin B6",
  vitaminB12: "Vitamin B12",
  folate: "Folate",
  niacin: "Niacin",
  caffeine: "Caffeine",
};

const EXTENDED_NUTRIENT_UNITS: Record<string, string> = {
  saturatedFat: "g",
  polyunsaturatedFat: "g",
  monounsaturatedFat: "g",
  transFat: "g",
  cholesterol: "mg",
  calcium: "mg",
  iron: "mg",
  magnesium: "mg",
  phosphorus: "mg",
  zinc: "mg",
  vitaminA: "mcg",
  vitaminC: "mg",
  vitaminD: "mcg",
  vitaminE: "mg",
  vitaminK: "mcg",
  vitaminB6: "mg",
  vitaminB12: "mcg",
  folate: "mcg",
  niacin: "mg",
  caffeine: "mg",
};

type ScannerState =
  | { type: "scanning" }
  | { type: "loading"; barcode: string }
  | { type: "found"; product: BarcodeProduct }
  | { type: "not_found"; barcode: string }
  | { type: "error"; message: string };

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onAddProduct: (product: BarcodeProduct, selectedServingId?: string) => void;
  onAddManualEntry: (text: string) => void;
}

// Stub hook when expo-camera is not available
function useStubPermissions(): [{ granted: false } | null, () => void] {
  return [null, () => {}];
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onAddProduct,
  onAddManualEntry,
}: BarcodeScannerModalProps) {
  const insets = useSafeAreaInsets();
  const usePerms = cameraAvailable ? useCameraPermissions : useStubPermissions;
  const [permission, requestPermission] = usePerms();
  const [state, setState] = useState<ScannerState>({ type: "scanning" });
  const [selectedServingId, setSelectedServingId] = useState<string | null>(null);
  const [servingGrams, setServingGrams] = useState("");
  const [manualText, setManualText] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [macroOverrides, setMacroOverrides] = useState<
    Partial<Record<"kcal" | "protein" | "fat" | "carbs", number>>
  >({});
  const [editMacroPopup, setEditMacroPopup] = useState<{
    nutrientKey: "kcal" | "protein" | "fat" | "carbs";
    currentValue: number;
  } | null>(null);
  const [extendedOpen, setExtendedOpen] = useState(false);
  const scanLockRef = useRef(false);
  const translateY = useSharedValue(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setState({ type: "scanning" });
      setSelectedServingId(null);
      setServingGrams("");
      setManualText("");
      setMacroOverrides({});
      setEditMacroPopup(null);
      setExtendedOpen(false);
      scanLockRef.current = false;
      translateY.value = 0;
    }
  }, [visible]);

  // Track keyboard height for bottom card positioning
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

  // Set default serving size when product is found
  useEffect(() => {
    if (state.type === "found") {
      const defaultServing =
        state.product.servings.find((s) => s.metricUnit === "g") ??
        state.product.servings[0];
      if (defaultServing) {
        setSelectedServingId(defaultServing.servingId);
        setServingGrams(
          defaultServing.metricAmount
            ? Math.round(defaultServing.metricAmount).toString()
            : "100",
        );
      }
      setMacroOverrides({});
      setExtendedOpen(false);
    }
  }, [state.type === "found" ? (state as any).product : null]);

  const handleBarcodeScanned = useCallback(async (result: { data: string }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;

    const barcode = result.data;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setState({ type: "loading", barcode });

    try {
      const product = await lookupBarcode(barcode);
      setState({ type: "found", product });
    } catch (err) {
      if (err instanceof BarcodeNotFoundError) {
        setState({ type: "not_found", barcode });
      } else if (err instanceof BarcodeLookupError) {
        setState({ type: "error", message: err.message });
      } else {
        setState({ type: "error", message: "Something went wrong" });
      }
    }
  }, []);

  const handleAdd = useCallback(() => {
    if (state.type !== "found") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddProduct(state.product, selectedServingId ?? undefined);
  }, [state, selectedServingId, onAddProduct]);

  const handleManualSubmit = useCallback(() => {
    const text = manualText.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    onAddManualEntry(text);
  }, [manualText, onAddManualEntry]);

  const handleServingStep = useCallback(
    (delta: number) => {
      const current = parseFloat(servingGrams) || 100;
      const next = Math.max(1, current + delta);
      setServingGrams(next.toString());
      setSelectedServingId(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [servingGrams],
  );

  const handleScanAgain = useCallback(() => {
    scanLockRef.current = false;
    setState({ type: "scanning" });
    setSelectedServingId(null);
    setServingGrams("");
    setManualText("");
    setMacroOverrides({});
    setExtendedOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  // Compute scaled macros (same logic as DatabaseSearchModal)
  const previewMacrosBase: Macros | null = useMemo(() => {
    if (state.type !== "found") return null;
    const servings = state.product.servings;
    if (!servings.length) return null;

    const ref = selectedServingId
      ? servings.find((s) => s.servingId === selectedServingId)
      : (servings.find((s) => s.metricUnit === "g") ?? servings[0]);
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
      ...(m.fiber != null && { fiber: Math.round(m.fiber * scale * 10) / 10 }),
      ...(m.sugar != null && { sugar: Math.round(m.sugar * scale * 10) / 10 }),
      ...(m.sodium != null && { sodium: Math.round(m.sodium * scale) }),
      ...(m.potassium != null && { potassium: Math.round(m.potassium * scale) }),
    };
  }, [state, servingGrams, selectedServingId]);

  const previewMacros: Macros | null = previewMacrosBase
    ? { ...previewMacrosBase, ...macroOverrides }
    : null;

  // Compute extended nutrients
  const previewExtended: Record<string, number> | null = useMemo(() => {
    if (state.type !== "found") return null;
    const servings = state.product.servings;
    if (!servings.length) return null;

    const ref = selectedServingId
      ? servings.find((s) => s.servingId === selectedServingId)
      : (servings.find((s) => s.metricUnit === "g") ?? servings[0]);
    if (!ref?.extendedNutrients || !ref.metricAmount || ref.metricAmount <= 0) {
      return ref?.extendedNutrients ?? null;
    }
    const grams = parseFloat(servingGrams) || ref.metricAmount;
    const scale = grams / ref.metricAmount;
    const scaled: Record<string, number> = {};
    for (const [key, val] of Object.entries(ref.extendedNutrients)) {
      if (val != null) scaled[key] = Math.round(val * scale * 100) / 100;
    }
    return Object.keys(scaled).length > 0 ? scaled : null;
  }, [state, servingGrams, selectedServingId]);

  // Not yet loaded
  if (!permission) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="light-content" />
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
            {!cameraAvailable ? (
              // Native module not built yet
              <View style={styles.permissionContainer}>
                <View style={styles.permissionContent}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons name="build-outline" size={48} color={TEAL} />
                  </View>
                  <Text style={styles.permissionTitle}>Rebuild Required</Text>
                  <Text style={styles.permissionDescription}>
                    The camera module requires a native rebuild. Run{"\n"}
                    <Text style={{ fontWeight: "600" }}>npx expo run:ios</Text>
                    {"\n"}then reopen the app.
                  </Text>
                  <TouchableOpacity
                    style={styles.permissionCancelButton}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.permissionCancelText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : !permission.granted ? (
              // Permission denied / not yet granted
              <View style={styles.permissionContainer}>
                <View style={styles.permissionContent}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons name="camera-outline" size={48} color={TEAL} />
                  </View>
                  <Text style={styles.permissionTitle}>Camera Access</Text>
                  <Text style={styles.permissionDescription}>
                    NoteCal needs camera access to scan barcodes on food
                    products
                  </Text>
                  <TouchableOpacity
                    style={styles.permissionButton}
                    onPress={requestPermission}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.permissionButtonText}>
                      Allow Camera
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.permissionCancelButton}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.permissionCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Camera view
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      "ean13",
                      "ean8",
                      "upc_a",
                      "upc_e",
                      "code128",
                    ],
                  }}
                  onBarcodeScanned={
                    state.type === "scanning" ? handleBarcodeScanned : undefined
                  }
                />

                {/* Dark overlay with rounded viewfinder cutout */}
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
                    <Defs>
                      <Mask id="hole">
                        <Rect
                          width={SCREEN_WIDTH}
                          height={SCREEN_HEIGHT}
                          fill="white"
                        />
                        <Rect
                          x={(SCREEN_WIDTH - VIEWFINDER_WIDTH) / 2}
                          y={SCREEN_HEIGHT * 0.23}
                          width={VIEWFINDER_WIDTH}
                          height={VIEWFINDER_HEIGHT}
                          rx={VIEWFINDER_RADIUS}
                          ry={VIEWFINDER_RADIUS}
                          fill="black"
                        />
                      </Mask>
                    </Defs>
                    <Rect
                      width={SCREEN_WIDTH}
                      height={SCREEN_HEIGHT}
                      fill="rgba(0,0,0,0.55)"
                      mask="url(#hole)"
                    />
                  </Svg>
                  {/* Corner decorations */}
                  <View
                    style={[
                      styles.viewfinderFrame,
                      { top: SCREEN_HEIGHT * 0.23 },
                    ]}
                  >
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                  </View>
                </View>

                {/* Close button */}
                <TouchableOpacity
                  style={[styles.closeButton, { top: 12 }]}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>

                {/* Drag indicator */}
                <View
                  style={styles.dragIndicatorContainer}
                  pointerEvents="none"
                >
                  <View style={styles.dragIndicator} />
                </View>

                {/* Scanning hint */}
                {state.type === "scanning" && (
                  <Animated.View
                    entering={FadeIn.duration(300)}
                    style={styles.hintContainer}
                  >
                    <View style={styles.hintPill}>
                      <Ionicons
                        name="barcode-outline"
                        size={18}
                        color="rgba(255,255,255,0.8)"
                      />
                      <Text style={styles.hintText}>
                        Point camera at a barcode
                      </Text>
                    </View>
                  </Animated.View>
                )}

                {/* Loading state */}
                {state.type === "loading" && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={styles.bottomCard}
                  >
                    <View style={styles.loadingContent}>
                      <ActivityIndicator size="small" color="#666" />
                      <Text style={styles.loadingText}>
                        Looking up product...
                      </Text>
                    </View>
                  </Animated.View>
                )}

                {/* Found state - detail view (matches DatabaseSearchModal) */}
                {state.type === "found" && previewMacros && (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={[
                      styles.bottomCard,
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
                        {state.product.brand && (
                          <Text style={styles.productBrand}>
                            {state.product.brand
                              .toLowerCase()
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Text>
                        )}
                        <Text style={styles.productName} numberOfLines={2}>
                          {state.product.name}
                        </Text>
                      </View>

                      {/* Horizontal serving pills */}
                      <Animated.View
                        entering={FadeIn.duration(200)}
                        style={styles.portionRow}
                      >
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.portionScrollContent}
                        >
                          {state.product.servings
                            .filter(
                              (s) => s.metricAmount != null && s.metricAmount > 0,
                            )
                            .map((serving) => {
                              const isSelected =
                                serving.servingId === selectedServingId;
                              return (
                                <TouchableOpacity
                                  key={serving.servingId}
                                  style={[
                                    styles.portionPill,
                                    isSelected && styles.portionPillSelected,
                                  ]}
                                  onPress={() => {
                                    Haptics.impactAsync(
                                      Haptics.ImpactFeedbackStyle.Light,
                                    );
                                    setSelectedServingId(serving.servingId);
                                    if (serving.metricAmount) {
                                      setServingGrams(
                                        Math.round(serving.metricAmount).toString(),
                                      );
                                    }
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text
                                    style={[
                                      styles.portionPillLabel,
                                      isSelected && styles.portionPillLabelSelected,
                                    ]}
                                  >
                                    {serving.description}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.portionPillGrams,
                                      isSelected && styles.portionPillGramsSelected,
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

                      {/* Gram stepper */}
                      <View style={styles.servingCard}>
                        <Text style={styles.servingLabel}>Serving</Text>
                        <View style={styles.stepperContainer}>
                          <TouchableOpacity
                            style={styles.stepperButton}
                            onPress={() => handleServingStep(-10)}
                            activeOpacity={0.6}
                          >
                            <Ionicons name="remove" size={18} color="#999" />
                          </TouchableOpacity>
                          <View style={styles.servingInputWrapper}>
                            <TextInput
                              style={styles.servingInput}
                              value={servingGrams}
                              onChangeText={(text) => {
                                setServingGrams(text);
                                setSelectedServingId(null);
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

                      {/* Macros (editable, with AnimatedDigits) */}
                      <View style={styles.macrosCard}>
                        {[
                          {
                            key: "calories" as const,
                            value: previewMacros.kcal,
                            unit: "",
                            label: "calories",
                          },
                          {
                            key: "protein" as const,
                            value: previewMacros.protein,
                            unit: "g",
                            label: "protein",
                          },
                          {
                            key: "fat" as const,
                            value: previewMacros.fat,
                            unit: "g",
                            label: "fat",
                          },
                          {
                            key: "carbs" as const,
                            value: previewMacros.carbs,
                            unit: "g",
                            label: "carbs",
                          },
                        ].map((macro, i) => (
                          <Animated.View
                            key={macro.key}
                            entering={FadeInDown.delay(i * 60).duration(250)}
                            style={styles.macroPill}
                          >
                            <TouchableOpacity
                              style={styles.macroPillTouchable}
                              activeOpacity={0.6}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light,
                                );
                                setEditMacroPopup({
                                  nutrientKey:
                                    macro.key === "calories" ? "kcal" : macro.key,
                                  currentValue: macro.value,
                                });
                              }}
                            >
                              <View style={styles.macroIconContainer}>
                                <FontAwesomeIcon
                                  icon={MACRO_ICONS[macro.key]}
                                  size={12}
                                  color={MACRO_COLORS[macro.key].primary}
                                />
                              </View>
                              <View style={styles.macroPillValueRow}>
                                <AnimatedDigits
                                  value={macro.value}
                                  style={styles.macroPillValue}
                                />
                                {macro.unit ? (
                                  <Text style={styles.macroPillValue}>
                                    {macro.unit}
                                  </Text>
                                ) : null}
                              </View>
                              <Text style={styles.macroPillLabel}>
                                {macro.label}
                              </Text>
                            </TouchableOpacity>
                          </Animated.View>
                        ))}
                      </View>

                      {/* Extended nutrients dropdown */}
                      {previewExtended &&
                        Object.keys(previewExtended).length > 0 && (
                          <View style={styles.extendedSection}>
                            <TouchableOpacity
                              style={styles.extendedToggle}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light,
                                );
                                setExtendedOpen((prev) => !prev);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.extendedToggleText}>
                                Additional Nutrition Facts
                              </Text>
                              <Ionicons
                                name={
                                  extendedOpen ? "chevron-up" : "chevron-down"
                                }
                                size={16}
                                color="#999"
                              />
                            </TouchableOpacity>
                            {extendedOpen && (
                              <Animated.View
                                entering={FadeInDown.duration(200)}
                                style={styles.extendedList}
                              >
                                {Object.entries(previewExtended).map(
                                  ([key, val]) => (
                                    <View key={key} style={styles.extendedRow}>
                                      <Text style={styles.extendedLabel}>
                                        {EXTENDED_NUTRIENT_LABELS[key] ?? key}
                                      </Text>
                                      <Text style={styles.extendedValue}>
                                        {val < 1
                                          ? val.toFixed(2)
                                          : Math.round(val * 10) / 10}
                                        {EXTENDED_NUTRIENT_UNITS[key] ?? ""}
                                      </Text>
                                    </View>
                                  ),
                                )}
                              </Animated.View>
                            )}
                          </View>
                        )}

                      {/* Action buttons */}
                      <View style={{ height: 20 }} />
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={handleAdd}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.addButtonText}>Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.scanAgainButtonAlt}
                        onPress={handleScanAgain}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="scan-outline" size={16} color="#666" />
                        <Text style={styles.scanAgainText}>Scan Again</Text>
                      </TouchableOpacity>
                      <Text
                        style={styles.attribution}
                        onPress={() =>
                          Linking.openURL("https://platform.fatsecret.com")
                        }
                      >
                        Powered by FatSecret Platform API
                      </Text>
                    </ScrollView>
                  </Animated.View>
                )}

                {/* Not found state */}
                {state.type === "not_found" && (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={[
                      styles.bottomCard,
                      { paddingBottom: keyboardHeight || insets.bottom + 16 },
                    ]}
                  >
                    <View style={styles.notFoundHeader}>
                      <Text style={styles.notFoundTitle}>
                        Product not found
                      </Text>
                    </View>
                    <Text style={styles.notFoundDescription}>
                      This barcode isn't in our database. Type the product name
                      below and we'll calculate the macros for you.
                    </Text>
                    <View style={styles.manualInputRow}>
                      <TextInput
                        style={styles.manualInput}
                        placeholder="Search"
                        placeholderTextColor="#999"
                        value={manualText}
                        onChangeText={setManualText}
                        autoFocus
                        returnKeyType="go"
                        onSubmitEditing={handleManualSubmit}
                      />
                      <TouchableOpacity
                        style={[
                          styles.manualSubmitButton,
                          !manualText.trim() && styles.manualSubmitDisabled,
                        ]}
                        onPress={handleManualSubmit}
                        disabled={!manualText.trim()}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="arrow-forward"
                          size={20}
                          color={manualText.trim() ? "#fff" : "#ccc"}
                        />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.scanAgainButtonAlt}
                      onPress={handleScanAgain}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="scan-outline" size={16} color="#666" />
                      <Text style={styles.scanAgainText}>Scan Again</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* Error state */}
                {state.type === "error" && (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={[
                      styles.bottomCard,
                      { paddingBottom: insets.bottom + 16 },
                    ]}
                  >
                    <View style={styles.notFoundHeader}>
                      <Ionicons
                        name="warning-outline"
                        size={24}
                        color="#F87171"
                      />
                      <Text style={styles.notFoundTitle}>{state.message}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.scanAgainButtonAlt}
                      onPress={handleScanAgain}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="scan-outline" size={16} color="#666" />
                      <Text style={styles.scanAgainText}>Try Again</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </>
            )}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
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
    backgroundColor: "#000",
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
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContent: {
    alignItems: "center",
    paddingHorizontal: 40,
  },
  permissionIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#E0F2F1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  permissionDescription: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: TEAL,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "400",
    color: "#fff",
  },
  permissionCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionCancelText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
  },
  // Viewfinder frame (positioned over the SVG cutout)
  viewfinderFrame: {
    position: "absolute",
    left: (SCREEN_WIDTH - VIEWFINDER_WIDTH) / 2,
    width: VIEWFINDER_WIDTH,
    height: VIEWFINDER_HEIGHT,
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#fff",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: VIEWFINDER_RADIUS,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: VIEWFINDER_RADIUS,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: VIEWFINDER_RADIUS,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: VIEWFINDER_RADIUS,
  },
  // Close button
  closeButton: {
    position: "absolute",
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Hint pill
  hintContainer: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.23 - 52,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  hintText: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "500",
    color: "#fff",
  },
  // Bottom card
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  // Loading
  loadingContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
  },
  // Found state — detail view (matches DatabaseSearchModal)
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
  // Portion pills
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
  // Serving stepper
  servingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
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
  // Macros
  macrosCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Tokens.border,
    gap: 8,
  },
  macroPill: {
    alignItems: "center",
    flex: 1,
  },
  macroPillTouchable: {
    alignItems: "center",
  },
  macroIconContainer: {
    marginBottom: 3,
  },
  macroPillValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 1,
  },
  macroPillValue: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -1,
  },
  macroPillLabel: {
    fontSize: 10,
    fontFamily: "System",
    fontWeight: "500",
    textTransform: "capitalize",
    letterSpacing: -0.2,
    color: Tokens.textSecondary,
  },
  // Extended nutrients
  extendedSection: {
    marginTop: 12,
  },
  extendedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  extendedToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  extendedList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  extendedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  extendedLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#555",
  },
  extendedValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  scanAgainText: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 15,
    borderRadius: 26,
    backgroundColor: TEAL,
  },
  addButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  // Not found / error states
  notFoundHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  notFoundTitle: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    letterSpacing: -0.2,
  },
  notFoundDescription: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
    lineHeight: 22,
    marginBottom: 16,
  },
  manualInputRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  manualInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  manualSubmitButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: TEAL,
    justifyContent: "center",
    alignItems: "center",
  },
  manualSubmitDisabled: {
    backgroundColor: "#9CA3AF",
  },
  scanAgainButtonAlt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  attribution: {
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "400",
    color: "#bbb",
    textAlign: "center",
    marginTop: 8,
  },
});
