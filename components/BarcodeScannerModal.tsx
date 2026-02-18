import { AnimatedDigits } from "@/components/AnimatedDigits";
import {
  BarcodeLookupError,
  BarcodeNonFoodError,
  BarcodeNotFoundError,
  lookupBarcode,
  scaleMacrosToServing,
} from "@/services/barcodeService";
import { BarcodeProduct, Macros } from "@/types";
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");
const VIEWFINDER_WIDTH = SCREEN_WIDTH * 0.78;
const VIEWFINDER_HEIGHT = SCREEN_WIDTH * 0.44;
const VIEWFINDER_RADIUS = 20;

const DISMISS_THRESHOLD = 150;
const TEAL = "#1A6872";

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

type ScannerState =
  | { type: "scanning" }
  | { type: "loading"; barcode: string }
  | { type: "found"; product: BarcodeProduct }
  | { type: "not_found"; barcode: string }
  | { type: "non_food" }
  | { type: "error"; message: string };

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onAddProduct: (product: BarcodeProduct, servingGrams: number) => void;
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
  const [servingGrams, setServingGrams] = useState("");
  const [manualText, setManualText] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scanLockRef = useRef(false);
  const translateY = useSharedValue(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setState({ type: "scanning" });
      setServingGrams("");
      setManualText("");
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
      const defaultServing = state.product.servingSizeG ?? 100;
      setServingGrams(defaultServing.toString());
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
      } else if (err instanceof BarcodeNonFoodError) {
        setState({ type: "non_food" });
      } else if (err instanceof BarcodeLookupError) {
        setState({ type: "error", message: err.message });
      } else {
        setState({ type: "error", message: "Something went wrong" });
      }
    }
  }, []);

  const handleAdd = useCallback(() => {
    if (state.type !== "found") return;
    const grams = parseFloat(servingGrams) || 100;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddProduct(state.product, grams);
  }, [state, servingGrams, onAddProduct]);

  const handleManualSubmit = useCallback(() => {
    const text = manualText.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    onAddManualEntry(text);
  }, [manualText, onAddManualEntry]);

  const handleScanAgain = useCallback(() => {
    scanLockRef.current = false;
    setState({ type: "scanning" });
    setServingGrams("");
    setManualText("");
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

  const handleServingStep = useCallback(
    (delta: number) => {
      const current = parseFloat(servingGrams) || 100;
      const next = Math.max(1, current + delta);
      setServingGrams(next.toString());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [servingGrams]
  );

  // Compute scaled macros for preview
  const previewMacros: Macros | null =
    state.type === "found"
      ? scaleMacrosToServing(
          state.product.nutrimentsPer100g,
          parseFloat(servingGrams) || 100
        )
      : null;

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
          <Animated.View style={[styles.container, { marginTop: insets.top }, animatedStyle]}>

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
                NoteCal needs camera access to scan barcodes on food products
              </Text>
              <TouchableOpacity
                style={styles.permissionButton}
                onPress={requestPermission}
                activeOpacity={0.8}
              >
                <Text style={styles.permissionButtonText}>Allow Camera</Text>
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
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
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
              <Ionicons name="chevron-down" size={26} color="#fff" />
            </TouchableOpacity>

            {/* Drag indicator */}
            <View style={styles.dragIndicatorContainer} pointerEvents="none">
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
                  <ActivityIndicator size="small" color={TEAL} />
                  <Text style={styles.loadingText}>Looking up product...</Text>
                </View>
              </Animated.View>
            )}

            {/* Found state - product card */}
            {state.type === "found" && previewMacros && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={[
                  styles.bottomCard,
                  { paddingBottom: keyboardHeight || insets.bottom + 16 },
                ]}
              >
                {/* Product info */}
                <View style={styles.productHeader}>
                  {state.product.brand && (
                    <Text style={styles.productBrand}>
                      {state.product.brand}
                    </Text>
                  )}
                  <Text style={styles.productName} numberOfLines={2}>
                    {state.product.name}
                  </Text>
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
                    ]
                  ).map((macro, i) => (
                    <Animated.View
                      key={macro.key}
                      entering={FadeInDown.delay(i * 80).duration(300)}
                      style={[
                        styles.macroPill,
                        {
                          backgroundColor: `${MACRO_COLORS[macro.key].primary}18`,
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

                {/* Action buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.scanAgainButton}
                    onPress={handleScanAgain}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="scan-outline" size={18} color="#666" />
                    <Text style={styles.scanAgainText}>Scan Again</Text>
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
                  <Ionicons
                    name="alert-circle-outline"
                    size={24}
                    color="#F5A623"
                  />
                  <Text style={styles.notFoundTitle}>Product not found</Text>
                </View>
                <Text style={styles.notFoundDescription}>
                  This barcode isn't in our database. Type the product name
                  below and we'll calculate the macros for you.
                </Text>
                <View style={styles.manualInputRow}>
                  <TextInput
                    style={styles.manualInput}
                    placeholder="e.g. Kirkland Protein Bar"
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

            {/* Non-food state */}
            {state.type === "non_food" && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={[
                  styles.bottomCard,
                  { paddingBottom: insets.bottom + 16 },
                ]}
              >
                <View style={styles.notFoundHeader}>
                  <Ionicons name="ban-outline" size={24} color="#F87171" />
                  <Text style={styles.notFoundTitle}>Not a food item</Text>
                </View>
                <Text style={styles.notFoundDescription}>
                  This product doesn't appear to be a food or drink. Only food
                  items can be tracked.
                </Text>
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
                  <Ionicons name="warning-outline" size={24} color="#F87171" />
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
    borderRadius: 14,
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
  // Found state
  productHeader: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  productName: {
    fontSize: 19,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  productBrand: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  servingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
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
    fontFamily: "System",
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
    fontFamily: "System",
    fontWeight: "600",
    color: "#333",
    minWidth: 44,
    textAlign: "right",
    padding: 0,
  },
  servingUnit: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "400",
    color: "#888",
    marginLeft: 3,
  },
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
    fontFamily: "System",
    fontWeight: "500",
    color: "#888",
    marginLeft: 1,
  },
  macroPillLabel: {
    fontSize: 9,
    fontFamily: "System",
    fontWeight: "600",
    color: "#888",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  scanAgainButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#e5e5e5",
  },
  scanAgainText: {
    fontSize: 15,
    fontFamily: "System",
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
    fontFamily: "System",
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
    borderWidth: 1.5,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  manualSubmitButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
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
});
