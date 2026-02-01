import { useAppStore } from "@/store/app-store";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Switch,
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
  FadeOut,
  interpolate,
  Layout,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

interface NutritionGoalsModalProps {
  visible: boolean;
  onClose: () => void;
}

type NutrientField =
  | "kcal"
  | "protein"
  | "fat"
  | "carbs"
  | "fiber"
  | "sugar"
  | "sodium"
  | "potassium";

interface OtherNutrient {
  key: "fiber" | "sugar" | "sodium" | "potassium";
  label: string;
  unit: string;
  placeholder: string;
  color: string;
}

const OTHER_NUTRIENTS: OtherNutrient[] = [
  {
    key: "fiber",
    label: "Fiber",
    unit: "g",
    placeholder: "25",
    color: "#8B6914",
  },
  {
    key: "sugar",
    label: "Sugar",
    unit: "g",
    placeholder: "50",
    color: "#C45BAA",
  },
  {
    key: "sodium",
    label: "Sodium",
    unit: "mg",
    placeholder: "2300",
    color: "#5B8CC4",
  },
  {
    key: "potassium",
    label: "Potassium",
    unit: "mg",
    placeholder: "3500",
    color: "#6B8E5B",
  },
];

export function NutritionGoalsModal({
  visible,
  onClose,
}: NutritionGoalsModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);

  const goals = useAppStore((state) => state.goals);
  const setGoals = useAppStore((state) => state.setGoals);

  // Inline editing state
  const [editingField, setEditingField] = useState<NutrientField | null>(null);
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");

  // Other nutrients - values and enabled states
  const [manualFiber, setManualFiber] = useState("");
  const [manualSugar, setManualSugar] = useState("");
  const [manualSodium, setManualSodium] = useState("");
  const [manualPotassium, setManualPotassium] = useState("");

  const [fiberEnabled, setFiberEnabled] = useState(false);
  const [sugarEnabled, setSugarEnabled] = useState(false);
  const [sodiumEnabled, setSodiumEnabled] = useState(false);
  const [potassiumEnabled, setPotassiumEnabled] = useState(false);

  // Refs for each input field
  const kcalInputRef = React.useRef<TextInput>(null);
  const proteinInputRef = React.useRef<TextInput>(null);
  const fatInputRef = React.useRef<TextInput>(null);
  const carbsInputRef = React.useRef<TextInput>(null);
  const fiberInputRef = React.useRef<TextInput>(null);
  const sugarInputRef = React.useRef<TextInput>(null);
  const sodiumInputRef = React.useRef<TextInput>(null);
  const potassiumInputRef = React.useRef<TextInput>(null);

  const inputRefs: Record<NutrientField, React.RefObject<TextInput>> = {
    kcal: kcalInputRef,
    protein: proteinInputRef,
    fat: fatInputRef,
    carbs: carbsInputRef,
    fiber: fiberInputRef,
    sugar: sugarInputRef,
    sodium: sodiumInputRef,
    potassium: potassiumInputRef,
  };

  // Initialize form from existing goals
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;

      if (goals) {
        setManualKcal(
          (goals.manualTargets?.kcal ?? goals.targetKcal).toString(),
        );
        setManualProtein(
          (goals.manualTargets?.protein ?? goals.targetProtein).toString(),
        );
        setManualFat((goals.manualTargets?.fat ?? goals.targetFat).toString());
        setManualCarbs(
          (goals.manualTargets?.carbs ?? goals.targetCarbs).toString(),
        );

        // Other nutrients
        const fiber = goals.manualTargets?.fiber;
        const sugar = goals.manualTargets?.sugar;
        const sodium = goals.manualTargets?.sodium;
        const potassium = goals.manualTargets?.potassium;

        setManualFiber(fiber?.toString() ?? "25");
        setManualSugar(sugar?.toString() ?? "50");
        setManualSodium(sodium?.toString() ?? "2300");
        setManualPotassium(potassium?.toString() ?? "3500");

        setFiberEnabled(fiber !== undefined);
        setSugarEnabled(sugar !== undefined);
        setSodiumEnabled(sodium !== undefined);
        setPotassiumEnabled(potassium !== undefined);
      } else {
        setManualKcal("2000");
        setManualProtein("150");
        setManualFat("65");
        setManualCarbs("200");
        setManualFiber("25");
        setManualSugar("50");
        setManualSodium("2300");
        setManualPotassium("3500");
        setFiberEnabled(false);
        setSugarEnabled(false);
        setSodiumEnabled(false);
        setPotassiumEnabled(false);
      }
      setEditingField(null);
    }
  }, [visible, goals]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isScrolledToTop.value && event.translationY > 0) {
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
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
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

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleSaveGoals = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const kcalValue = parseInt(manualKcal, 10) || 2000;
    const proteinValue = parseInt(manualProtein, 10) || 150;
    const fatValue = parseInt(manualFat, 10) || 65;
    const carbsValue = parseInt(manualCarbs, 10) || 200;

    const manualTargets = {
      kcal: kcalValue,
      protein: proteinValue,
      fat: fatValue,
      carbs: carbsValue,
      ...(fiberEnabled && { fiber: parseInt(manualFiber, 10) || 25 }),
      ...(sugarEnabled && { sugar: parseInt(manualSugar, 10) || 50 }),
      ...(sodiumEnabled && { sodium: parseInt(manualSodium, 10) || 2300 }),
      ...(potassiumEnabled && {
        potassium: parseInt(manualPotassium, 10) || 3500,
      }),
    };

    const updatedGoals = goals
      ? { ...goals, manualTargets }
      : {
          sex: "male" as const,
          age: 30,
          heightCm: 175,
          weightKg: 70,
          bodyFatPercentage: null,
          activityLevel: "moderate" as const,
          goalType: "maintain" as const,
          proteinPreference: "standard" as const,
          carbPreference: "standard" as const,
          bmr: 1700,
          tdee: 2000,
          targetKcal: kcalValue,
          targetProtein: proteinValue,
          targetFat: fatValue,
          targetCarbs: carbsValue,
          manualTargets,
        };

    setGoals(updatedGoals);
    onClose();
  };

  const getValueForField = (field: NutrientField): string => {
    switch (field) {
      case "kcal":
        return manualKcal;
      case "protein":
        return manualProtein;
      case "fat":
        return manualFat;
      case "carbs":
        return manualCarbs;
      case "fiber":
        return manualFiber;
      case "sugar":
        return manualSugar;
      case "sodium":
        return manualSodium;
      case "potassium":
        return manualPotassium;
    }
  };

  const setValueForField = (field: NutrientField, value: string) => {
    const cleanValue = value.replace(/[^0-9]/g, "");
    switch (field) {
      case "kcal":
        setManualKcal(cleanValue);
        break;
      case "protein":
        setManualProtein(cleanValue);
        break;
      case "fat":
        setManualFat(cleanValue);
        break;
      case "carbs":
        setManualCarbs(cleanValue);
        break;
      case "fiber":
        setManualFiber(cleanValue);
        break;
      case "sugar":
        setManualSugar(cleanValue);
        break;
      case "sodium":
        setManualSodium(cleanValue);
        break;
      case "potassium":
        setManualPotassium(cleanValue);
        break;
    }
  };

  const startEditing = (field: NutrientField) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingField(field);
    setTimeout(() => inputRefs[field].current?.focus(), 100);
  };

  const stopEditing = () => setEditingField(null);

  const toggleNutrient = (
    nutrient: "fiber" | "sugar" | "sodium" | "potassium",
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (nutrient) {
      case "fiber":
        setFiberEnabled(!fiberEnabled);
        break;
      case "sugar":
        setSugarEnabled(!sugarEnabled);
        break;
      case "sodium":
        setSodiumEnabled(!sodiumEnabled);
        break;
      case "potassium":
        setPotassiumEnabled(!potassiumEnabled);
        break;
    }
  };

  const isNutrientEnabled = (
    nutrient: "fiber" | "sugar" | "sodium" | "potassium",
  ): boolean => {
    switch (nutrient) {
      case "fiber":
        return fiberEnabled;
      case "sugar":
        return sugarEnabled;
      case "sodium":
        return sodiumEnabled;
      case "potassium":
        return potassiumEnabled;
    }
  };

  const renderTargetRow = (
    field: NutrientField,
    label: string,
    unit: string,
    isLast: boolean = false,
    accentColor?: string,
  ) => {
    const value = getValueForField(field);
    const displayValue = parseInt(value, 10) || 0;

    return (
      <TouchableOpacity
        key={field}
        style={[styles.targetRow, isLast && styles.targetRowLast]}
        onPress={() => startEditing(field)}
        activeOpacity={0.7}
      >
        <View style={styles.targetLabelContainer}>
          <Text style={styles.targetLabel}>{label}</Text>
        </View>
        {editingField === field ? (
          <View style={styles.targetInputContainer}>
            <TextInput
              ref={inputRefs[field]}
              style={styles.targetInput}
              value={value}
              onChangeText={(text) => setValueForField(field, text)}
              keyboardType="number-pad"
              onBlur={stopEditing}
              selectTextOnFocus
            />
            <Text style={styles.targetInputUnit}>{unit}</Text>
          </View>
        ) : (
          <View style={styles.targetValueContainer}>
            <Text style={styles.targetValue}>
              {field === "kcal" ? displayValue.toLocaleString() : displayValue}
            </Text>
            <Text style={styles.targetUnit}>{unit}</Text>
            <Ionicons
              name="pencil"
              size={12}
              color="#999"
              style={styles.targetEditIcon}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Get enabled other nutrients for display in Daily Targets
  const enabledOtherNutrients = OTHER_NUTRIENTS.filter((n) =>
    isNutrientEnabled(n.key),
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
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
            style={[styles.container, { marginTop: insets.top }, animatedStyle]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Nutrition Goals</Text>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardView}
            >
              <Animated.ScrollView
                style={styles.content}
                contentContainerStyle={[
                  styles.contentContainer,
                  { paddingBottom: insets.bottom + 100 },
                ]}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                bounces={true}
                keyboardShouldPersistTaps="handled"
              >
                {/* Daily Targets Section */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Daily Targets</Text>

                  <Animated.View
                    style={styles.goalsCard}
                    layout={Layout.springify()}
                  >
                    {renderTargetRow("kcal", "Calories", "kcal")}
                    {renderTargetRow("protein", "Protein", "g")}
                    {renderTargetRow("fat", "Fat", "g")}
                    {renderTargetRow(
                      "carbs",
                      "Carbs",
                      "g",
                      enabledOtherNutrients.length === 0,
                    )}

                    {/* Enabled other nutrients appear here */}
                    {enabledOtherNutrients.map((nutrient, index) => (
                      <Animated.View
                        key={nutrient.key}
                        entering={FadeIn.duration(200)}
                        exiting={FadeOut.duration(150)}
                        layout={Layout.springify()}
                      >
                        {renderTargetRow(
                          nutrient.key,
                          nutrient.label,
                          nutrient.unit,
                          index === enabledOtherNutrients.length - 1,
                          nutrient.color,
                        )}
                      </Animated.View>
                    ))}
                  </Animated.View>
                </Animated.View>

                {/* Other Nutrients Section */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Other Nutrients</Text>

                  <View style={styles.toggleCard}>
                    {OTHER_NUTRIENTS.map((nutrient, index) => {
                      const enabled = isNutrientEnabled(nutrient.key);
                      return (
                        <View
                          key={nutrient.key}
                          style={[
                            styles.toggleRow,
                            index === OTHER_NUTRIENTS.length - 1 &&
                              styles.toggleRowLast,
                          ]}
                        >
                          <View style={styles.toggleLabelContainer}>
                            <Text style={styles.toggleLabel}>
                              {nutrient.label}
                            </Text>
                            <Text style={styles.toggleUnit}>
                              ({nutrient.unit})
                            </Text>
                          </View>
                          <Switch
                            value={enabled}
                            onValueChange={() => toggleNutrient(nutrient.key)}
                            trackColor={{ false: "#E9E9EA", true: "#007AFF" }}
                            thumbColor="#FFFFFF"
                            ios_backgroundColor="#E9E9EA"
                          />
                        </View>
                      );
                    })}
                  </View>
                </Animated.View>
              </Animated.ScrollView>
            </KeyboardAvoidingView>

            <View
              style={[
                styles.bottomActions,
                { paddingBottom: insets.bottom + 16 },
              ]}
            >
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveGoals}
              >
                <Text style={styles.saveButtonText}>Save Goals</Text>
              </TouchableOpacity>
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
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
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
  header: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#f8f8f8",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#aaa",
    marginBottom: 12,
    marginLeft: 4,
  },
  goalsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  targetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
    minHeight: 52,
    backgroundColor: "#ffffff",
  },
  targetRowLast: {
    borderBottomWidth: 0,
  },
  targetLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  targetLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  targetValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  targetValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A6872",
  },
  targetUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: "#888",
  },
  targetEditIcon: {
    marginLeft: 4,
    opacity: 0.5,
  },
  targetInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f8f8",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  targetInput: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A6872",
    textAlign: "right",
    minWidth: 60,
    padding: 0,
  },
  targetInputUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A6872",
  },
  toggleCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  toggleUnit: {
    fontSize: 13,
    color: "#999",
  },
  bottomActions: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "#f8f8f8",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  saveButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: "#1A6872",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
