import { AnimatedDigits } from "@/components/AnimatedDigits";
import { MealNutritionFactsModal } from "@/components/MealNutritionFactsModal";
import { EditNutrientPopup } from "@/components/NutritionReasoningPopup";
import { Tokens } from "@/constants/theme";
import {
  BarcodeLookupError,
  BarcodeNotFoundError,
  lookupBarcode,
} from "@/services/barcodeService";
import {
  BarcodeProduct,
  CustomMealItem,
  ExtendedNutrients,
  FatSecretServing,
  Macros,
} from "@/types";
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
import Svg, { Circle, Defs, Mask, Path, Rect } from "react-native-svg";

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
  onSnapPhoto?: (uri: string) => void;
  nested?: boolean;
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
  onSnapPhoto,
  nested,
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
  const [showNutritionFacts, setShowNutritionFacts] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const cameraRef = useRef<any>(null);
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
      setShowNutritionFacts(false);
      setTorchEnabled(false);
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
      setShowNutritionFacts(false);
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
    setShowNutritionFacts(false);
  }, []);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const handleSnapPhoto = useCallback(async () => {
    if (!cameraRef.current || !onSnapPhoto) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        onSnapPhoto(photo.uri);
      }
    } catch {
      // Camera may not be ready
    }
  }, [onSnapPhoto]);

  // Drag-to-dismiss: when a bottom card is open, drag dismisses just the sheet
  // and returns to the scanning state. When already in scanning state, drag
  // closes the whole modal.
  const handleDragDismiss = useCallback(() => {
    if (state.type === "scanning") {
      handleClose();
    } else {
      translateY.value = 0;
      handleScanAgain();
    }
  }, [state.type, handleClose, handleScanAgain, translateY]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(
          SCREEN_HEIGHT,
          { damping: 20, stiffness: 200 },
          (finished) => {
            if (finished) runOnJS(handleDragDismiss)();
          },
        );
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
      }
    });

  // Mirror state.type into a shared value so animated styles can route
  // translateY to the correct layer (whole modal vs. just the bottom card).
  const isScanningShared = useSharedValue(state.type === "scanning" ? 1 : 0);
  useEffect(() => {
    isScanningShared.value = state.type === "scanning" ? 1 : 0;
  }, [state.type, isScanningShared]);

  // Translates the whole modal (including camera) — only active in scanning state.
  const outerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: isScanningShared.value === 1 ? translateY.value : 0 },
    ],
  }));

  // Translates only the bottom card — only active when a bottom card is open.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: isScanningShared.value === 1 ? 0 : translateY.value },
    ],
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

  // Wrap the current preview as a single CustomMealItem so MealNutritionFactsModal
  // can render its FDA-style label (always shows the standard rows, defaulting to 0
  // for missing fields — same form as MealBuilderModal).
  const factsItems: CustomMealItem[] = useMemo(() => {
    if (state.type !== "found" || !previewMacros) return [];
    return [
      {
        id: state.product.foodId,
        label: state.product.name,
        brand: state.product.brand,
        source: "FS",
        sourceId: state.product.foodId,
        servingGrams: parseFloat(servingGrams) || 100,
        macros: previewMacros,
        extendedNutrients: (previewExtended ?? undefined) as
          | ExtendedNutrients
          | undefined,
      },
    ];
  }, [state, previewMacros, previewExtended, servingGrams]);

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
            style={[
              styles.container,
              { marginTop: insets.top + (nested ? 16 : 0) },
              outerAnimatedStyle,
            ]}
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
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      "ean13",
                      "ean8",
                      "upc_a",
                      "upc_e",
                      "code128",
                    ],
                  }}
                  onBarcodeScanned={handleBarcodeScanned}
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

                {/* Flash toggle */}
                <TouchableOpacity
                  style={[styles.flashButton, { top: 12 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTorchEnabled((prev) => !prev);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={torchEnabled ? "flash" : "flash-off"}
                    size={22}
                    color="#fff"
                  />
                </TouchableOpacity>

                {/* Drag indicator (over camera, hidden once a bottom card opens) */}
                {state.type === "scanning" && (
                  <View
                    style={styles.dragIndicatorContainer}
                    pointerEvents="none"
                  >
                    <View style={styles.dragIndicator} />
                  </View>
                )}

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

                {/* Snap photo button */}
                {state.type === "scanning" && onSnapPhoto && (
                  <View style={styles.shutterContainer}>
                    <TouchableOpacity
                      style={styles.shutterButton}
                      onPress={handleSnapPhoto}
                      activeOpacity={0.7}
                    >
                      <View style={styles.shutterInner}>
                        <Ionicons name="camera" size={28} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Loading state */}
                {state.type === "loading" && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={[styles.bottomCard, animatedStyle]}
                  >
                    <View style={styles.bottomCardDragHandleContainer}>
                      <View style={styles.bottomCardDragHandle} />
                    </View>
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
                      animatedStyle,
                    ]}
                  >
                    <View style={styles.bottomCardDragHandleContainer}>
                      <View style={styles.bottomCardDragHandle} />
                    </View>
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

                      {/* Macros - donut ring with macro list */}
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
                                  styles.sectionLabel,
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
                                      <Text style={styles.donutMacroUnit}>g</Text>
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          </View>
                        );
                      })()}

                      {/* Action button */}
                      <View style={{ height: 20 }} />
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={handleAdd}
                        activeOpacity={0.85}
                      >
                        <View style={styles.addButtonSpacer} />
                        <Text style={styles.addButtonText}>Add</Text>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color="#fff"
                        />
                      </TouchableOpacity>
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
                      animatedStyle,
                    ]}
                  >
                    <View style={styles.bottomCardDragHandleContainer}>
                      <View style={styles.bottomCardDragHandle} />
                    </View>
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
                      { paddingBottom: keyboardHeight || insets.bottom + 16 },
                      animatedStyle,
                    ]}
                  >
                    <View style={styles.bottomCardDragHandleContainer}>
                      <View style={styles.bottomCardDragHandle} />
                    </View>
                    <View style={styles.notFoundHeader}>
                      <Text style={styles.notFoundTitle}>{state.message}</Text>
                    </View>
                    <Text style={styles.notFoundDescription}>
                      Type the product name below and we'll calculate the macros
                      for you.
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
      {/* Nutrition facts (FDA-style label) — same component as MealBuilderModal */}
      <MealNutritionFactsModal
        visible={showNutritionFacts}
        items={factsItems}
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
  flashButton: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.4)",
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  bottomCardDragHandleContainer: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 12,
  },
  bottomCardDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
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
  // Macros - donut ring
  nutritionSection: {
    marginBottom: 16,
    paddingVertical: 8,
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
  // Nutrition section header (matches MealBuilderModal)
  sectionLabel: {
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
  scanAgainText: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
  },
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
    backgroundColor: "#000",
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
});
