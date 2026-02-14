import {
  resolveNutritionFromPhoto,
  NutritionNotFoodError,
  NutritionApiError,
} from "@/services/nutritionApi";
import { Entry, FoodItem, Macros } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import {
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

type ModalState = "idle" | "camera" | "analyzing" | "result" | "not_food" | "error";

interface FoodPhotoModalProps {
  visible: boolean;
  onClose: () => void;
  onAddEntry: (items: FoodItem[], totals: Macros) => void;
}

export function FoodPhotoModal({
  visible,
  onClose,
  onAddEntry,
}: FoodPhotoModalProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ModalState>("idle");
  const [items, setItems] = useState<FoodItem[]>([]);
  const [totals, setTotals] = useState<Macros | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const hasLaunchedRef = useRef(false);

  const reset = useCallback(() => {
    setState("idle");
    setItems([]);
    setTotals(null);
    setErrorMessage("");
    hasLaunchedRef.current = false;
  }, []);

  const launchCamera = useCallback(async () => {
    setState("camera");
    try {
      const ImagePicker = await import("expo-image-picker");
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Camera access is required to snap food photos.",
        );
        reset();
        onClose();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]?.base64) {
        reset();
        onClose();
        return;
      }

      const asset = result.assets[0];
      const base64 = asset.base64!;
      const mimeType = asset.mimeType || "image/jpeg";

      setState("analyzing");

      const { data: { user } } = await supabase.auth.getUser();
      const response = await resolveNutritionFromPhoto(base64, mimeType, {
        userId: user?.id,
      });

      if (response.resolved && response.resolved.length > 0) {
        setItems(response.resolved);
        setTotals(response.totals);
        setState("result");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setState("not_food");
      }
    } catch (error) {
      if (error instanceof NutritionNotFoodError) {
        setState("not_food");
      } else {
        console.error("[FoodPhotoModal] Error:", error);
        setErrorMessage(
          error instanceof NutritionApiError
            ? error.message
            : "Something went wrong. Please try again.",
        );
        setState("error");
      }
    }
  }, [onClose, reset]);

  // Launch camera when modal becomes visible
  useEffect(() => {
    if (visible && !hasLaunchedRef.current) {
      hasLaunchedRef.current = true;
      launchCamera();
    }
    if (!visible) {
      reset();
    }
  }, [visible, launchCamera, reset]);

  const handleRetake = useCallback(() => {
    hasLaunchedRef.current = false;
    reset();
    // Small delay to let state settle before relaunching
    setTimeout(() => {
      hasLaunchedRef.current = true;
      launchCamera();
    }, 100);
  }, [launchCamera, reset]);

  const handleAdd = useCallback(() => {
    if (items.length > 0 && totals) {
      onAddEntry(items, totals);
      reset();
      onClose();
    }
  }, [items, totals, onAddEntry, onClose, reset]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Snap Food</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Content */}
        {(state === "camera" || state === "analyzing") && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.centerContent}
          >
            <ActivityIndicator size="large" color="#1A6872" />
            <Text style={styles.statusText}>
              {state === "camera" ? "Opening camera…" : "Analyzing food…"}
            </Text>
            {state === "analyzing" && (
              <Text style={styles.statusSubtext}>
                Identifying items and calculating nutrition
              </Text>
            )}
          </Animated.View>
        )}

        {state === "result" && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={styles.resultContainer}
          >
            <ScrollView
              style={styles.resultScroll}
              contentContainerStyle={styles.resultScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.resultTitle}>
                Found {items.length} item{items.length !== 1 ? "s" : ""}
              </Text>

              {/* Totals summary */}
              {totals && (
                <View style={styles.totalsRow}>
                  <MacroPill
                    icon={faFireFlameCurved as IconProp}
                    value={Math.round(totals.kcal)}
                    unit="kcal"
                    color="#E8590C"
                  />
                  <MacroPill
                    icon={faDrumstickBite as IconProp}
                    value={Math.round(totals.protein)}
                    unit="g"
                    color="#2B8A3E"
                  />
                  <MacroPill
                    icon={faDroplet as IconProp}
                    value={Math.round(totals.fat)}
                    unit="g"
                    color="#E67700"
                  />
                  <MacroPill
                    icon={faWheatAwn as IconProp}
                    value={Math.round(totals.carbs)}
                    unit="g"
                    color="#5C7CFA"
                  />
                </View>
              )}

              {/* Item list */}
              {items.map((item, index) => (
                <View key={index} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemLabel} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <Text style={styles.itemKcal}>
                      {Math.round(item.macros.kcal)} kcal
                    </Text>
                  </View>
                  <View style={styles.itemMacros}>
                    <Text style={styles.itemMacroText}>
                      {item.qty}{item.unit}
                    </Text>
                    <Text style={styles.itemMacroText}>
                      P: {Math.round(item.macros.protein)}g
                    </Text>
                    <Text style={styles.itemMacroText}>
                      F: {Math.round(item.macros.fat)}g
                    </Text>
                    <Text style={styles.itemMacroText}>
                      C: {Math.round(item.macros.carbs)}g
                    </Text>
                  </View>
                  {item.confidence < 0.8 && (
                    <Text style={styles.lowConfidence}>
                      ~ estimated (confidence: {Math.round(item.confidence * 100)}%)
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Action buttons */}
            <View style={[styles.actionBar, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={handleRetake}
              >
                <Ionicons name="camera-outline" size={18} color="#1A6872" />
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAdd}
              >
                <Text style={styles.addButtonText}>Add to Log</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {state === "not_food" && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.centerContent}
          >
            <Ionicons name="alert-circle-outline" size={48} color="#999" />
            <Text style={styles.errorTitle}>No food items identified</Text>
            <Text style={styles.errorSubtext}>
              Try taking a clearer photo of your food
            </Text>
            <TouchableOpacity
              style={styles.retakeButtonLarge}
              onPress={handleRetake}
            >
              <Ionicons name="camera-outline" size={18} color="#1A6872" />
              <Text style={styles.retakeButtonText}>Retake Photo</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {state === "error" && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.centerContent}
          >
            <Ionicons name="warning-outline" size={48} color="#E8590C" />
            <Text style={styles.errorTitle}>Analysis failed</Text>
            <Text style={styles.errorSubtext}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retakeButtonLarge}
              onPress={handleRetake}
            >
              <Ionicons name="camera-outline" size={18} color="#1A6872" />
              <Text style={styles.retakeButtonText}>Try Again</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function MacroPill({
  icon,
  value,
  unit,
  color,
}: {
  icon: IconProp;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View style={[styles.macroPill, { backgroundColor: `${color}12` }]}>
      <FontAwesomeIcon icon={icon} size={12} color={color} />
      <Text style={[styles.macroPillText, { color }]}>
        {value}
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  statusText: {
    fontSize: 17,
    fontWeight: "500",
    color: "#333",
    marginTop: 16,
  },
  statusSubtext: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  resultContainer: {
    flex: 1,
  },
  resultScroll: {
    flex: 1,
  },
  resultScrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  totalsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  macroPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  macroPillText: {
    fontSize: 13,
    fontWeight: "500",
  },
  itemCard: {
    backgroundColor: "#f9f9f8",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
    flex: 1,
    marginRight: 12,
  },
  itemKcal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E8590C",
  },
  itemMacros: {
    flexDirection: "row",
    gap: 12,
  },
  itemMacroText: {
    fontSize: 13,
    color: "#666",
  },
  lowConfidence: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginTop: 4,
  },
  actionBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  retakeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#E0F2F1",
  },
  retakeButtonText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#1A6872",
  },
  addButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1A6872",
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#fff",
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  errorSubtext: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  retakeButtonLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#E0F2F1",
    marginTop: 8,
  },
});
