import {
  BarcodeLookupError,
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
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIEWFINDER_SIZE = SCREEN_WIDTH * 0.7;

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

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setState({ type: "scanning" });
      setServingGrams("");
      setManualText("");
      scanLockRef.current = false;
    }
  }, [visible]);

  // Track keyboard height for not_found state
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardWillHide", () => {
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

  // Compute scaled macros for preview
  const previewMacros: Macros | null =
    state.type === "found"
      ? scaleMacrosToServing(
          state.product.nutrimentsPer100g,
          parseFloat(servingGrams) || 100,
        )
      : null;

  // Not yet loaded
  if (!permission) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />

        {!cameraAvailable ? (
          // Native module not built yet
          <View
            style={[styles.permissionContainer, { paddingTop: insets.top }]}
          >
            <View style={styles.permissionContent}>
              <View style={styles.permissionIconCircle}>
                <Ionicons name="build-outline" size={48} color="#1A6872" />
              </View>
              <Text style={styles.permissionTitle}>Rebuild Required</Text>
              <Text style={styles.permissionDescription}>
                The camera module requires a native rebuild. Run{"\n"}
                <Text style={{ fontWeight: "700" }}>npx expo run:ios</Text>
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
          <View
            style={[styles.permissionContainer, { paddingTop: insets.top }]}
          >
            <View style={styles.permissionContent}>
              <View style={styles.permissionIconCircle}>
                <Ionicons name="camera-outline" size={48} color="#1A6872" />
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

            {/* Dark overlay with viewfinder cutout */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddleRow}>
                <View style={styles.overlaySide} />
                <View style={styles.viewfinder}>
                  {/* Corner decorations */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom} />
            </View>

            {/* Close button */}
            <TouchableOpacity
              style={[styles.closeButton, { top: insets.top + 12 }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Scanning hint */}
            {state.type === "scanning" && (
              <Animated.View
                entering={FadeIn.duration(300)}
                style={styles.hintContainer}
              >
                <Text style={styles.hintText}>Point camera at a barcode</Text>
              </Animated.View>
            )}

            {/* Loading state */}
            {state.type === "loading" && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={styles.bottomCard}
              >
                <View style={styles.loadingContent}>
                  <ActivityIndicator size="small" color="#1A6872" />
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
                  { paddingBottom: insets.bottom + 16 },
                ]}
              >
                {/* Product info */}
                <View style={styles.productHeader}>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>
                      {state.product.name}
                    </Text>
                    {state.product.brand && (
                      <Text style={styles.productBrand}>
                        {state.product.brand}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Serving size input */}
                <View style={styles.servingRow}>
                  <Text style={styles.servingLabel}>Serving size</Text>
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
                </View>

                {/* Macros preview */}
                <View style={styles.macrosPreview}>
                  <View style={styles.macroPreviewItem}>
                    <FontAwesomeIcon
                      icon={MACRO_ICONS.calories}
                      size={12}
                      color={MACRO_COLORS.calories.primary}
                    />
                    <Text style={styles.macroPreviewValue}>
                      {Math.round(previewMacros.kcal)}
                    </Text>
                    <Text style={styles.macroPreviewLabel}>kcal</Text>
                  </View>
                  <View style={styles.macroPreviewItem}>
                    <FontAwesomeIcon
                      icon={MACRO_ICONS.protein}
                      size={12}
                      color={MACRO_COLORS.protein.primary}
                    />
                    <Text style={styles.macroPreviewValue}>
                      {Math.round(previewMacros.protein)}g
                    </Text>
                    <Text style={styles.macroPreviewLabel}>protein</Text>
                  </View>
                  <View style={styles.macroPreviewItem}>
                    <FontAwesomeIcon
                      icon={MACRO_ICONS.fat}
                      size={12}
                      color={MACRO_COLORS.fat.primary}
                    />
                    <Text style={styles.macroPreviewValue}>
                      {Math.round(previewMacros.fat)}g
                    </Text>
                    <Text style={styles.macroPreviewLabel}>fat</Text>
                  </View>
                  <View style={styles.macroPreviewItem}>
                    <FontAwesomeIcon
                      icon={MACRO_ICONS.carbs}
                      size={12}
                      color={MACRO_COLORS.carbs.primary}
                    />
                    <Text style={styles.macroPreviewValue}>
                      {Math.round(previewMacros.carbs)}g
                    </Text>
                    <Text style={styles.macroPreviewLabel}>carbs</Text>
                  </View>
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
                  { paddingBottom: keyboardHeight + insets.bottom + 16 },
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
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
    fontWeight: "700",
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
    backgroundColor: "#1A6872",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#fff",
  },
  permissionCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionCancelText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "500",
    color: "#666",
  },
  // Overlay
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  overlayMiddleRow: {
    flexDirection: "row",
    height: VIEWFINDER_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#fff",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  // Close button
  closeButton: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Hint
  hintContainer: {
    position: "absolute",
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    overflow: "hidden",
  },
  // Bottom card (shared)
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
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
    fontWeight: "500",
    color: "#666",
  },
  // Found state
  productHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 19,
    fontFamily: "System",
    fontWeight: "700",
    color: "#1a1a1a",
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  productBrand: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "500",
    color: "#888",
    marginTop: 2,
  },
  servingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  servingLabel: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "500",
    color: "#666",
  },
  servingInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f4f4f4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  servingInput: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    minWidth: 50,
    textAlign: "right",
    padding: 0,
  },
  servingUnit: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "500",
    color: "#888",
    marginLeft: 4,
  },
  macrosPreview: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f9f9f9",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  macroPreviewItem: {
    alignItems: "center",
    gap: 4,
  },
  macroPreviewValue: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "700",
    color: "#1a1a1a",
  },
  macroPreviewLabel: {
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.3,
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
    backgroundColor: "#f0f0f0",
  },
  scanAgainText: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "600",
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
    backgroundColor: "#1A6872",
  },
  addButtonText: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#fff",
  },
  // Not found state
  notFoundHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  notFoundTitle: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -0.2,
  },
  notFoundDescription: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "400",
    color: "#888",
    lineHeight: 20,
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
    backgroundColor: "#f4f4f4",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  manualSubmitButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#1A6872",
    justifyContent: "center",
    alignItems: "center",
  },
  manualSubmitDisabled: {
    backgroundColor: "#e8e8e8",
  },
  scanAgainButtonAlt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
});
