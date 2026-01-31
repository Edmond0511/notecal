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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

interface NutritionGoalsModalProps {
  visible: boolean;
  onClose: () => void;
}

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
  const [editingField, setEditingField] = useState<'kcal' | 'protein' | 'fat' | 'carbs' | null>(null);
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");

  // Refs for each input field
  const kcalInputRef = React.useRef<TextInput>(null);
  const proteinInputRef = React.useRef<TextInput>(null);
  const fatInputRef = React.useRef<TextInput>(null);
  const carbsInputRef = React.useRef<TextInput>(null);

  // Initialize form from existing goals
  useEffect(() => {
    if (visible) {
      // Always reset animation values when modal becomes visible
      translateY.value = 0;
      isScrolledToTop.value = true;

      if (goals) {
        // Use manual targets if they exist, otherwise use calculated targets
        setManualKcal((goals.manualTargets?.kcal ?? goals.targetKcal).toString());
        setManualProtein((goals.manualTargets?.protein ?? goals.targetProtein).toString());
        setManualFat((goals.manualTargets?.fat ?? goals.targetFat).toString());
        setManualCarbs((goals.manualTargets?.carbs ?? goals.targetCarbs).toString());
      } else {
        // Default values when no goals exist
        setManualKcal("2000");
        setManualProtein("150");
        setManualFat("65");
        setManualCarbs("200");
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
      Extrapolation.CLAMP
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

    // Create or update goals with manual targets
    const updatedGoals = goals
      ? {
          ...goals,
          manualTargets: {
            kcal: kcalValue,
            protein: proteinValue,
            fat: fatValue,
            carbs: carbsValue,
          },
        }
      : {
          // Create minimal goals structure when none exist
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
          manualTargets: {
            kcal: kcalValue,
            protein: proteinValue,
            fat: fatValue,
            carbs: carbsValue,
          },
        };

    setGoals(updatedGoals);
    onClose();
  };

  // Get effective targets
  const getEffectiveTargets = () => {
    return {
      kcal: parseInt(manualKcal, 10) || 2000,
      protein: parseInt(manualProtein, 10) || 150,
      fat: parseInt(manualFat, 10) || 65,
      carbs: parseInt(manualCarbs, 10) || 200,
    };
  };

  // Start editing a specific field
  const startEditing = (field: 'kcal' | 'protein' | 'fat' | 'carbs') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingField(field);

    // Focus the appropriate input
    setTimeout(() => {
      if (field === 'kcal') kcalInputRef.current?.focus();
      else if (field === 'protein') proteinInputRef.current?.focus();
      else if (field === 'fat') fatInputRef.current?.focus();
      else if (field === 'carbs') carbsInputRef.current?.focus();
    }, 100);
  };

  const stopEditing = () => {
    setEditingField(null);
  };

  const effectiveTargets = getEffectiveTargets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        {/* Backdrop */}
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
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
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

                  <View style={styles.goalsCard}>
                    {/* Calories Row */}
                    <TouchableOpacity
                      style={styles.targetRow}
                      onPress={() => startEditing('kcal')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.targetLabel}>Calories</Text>
                      {editingField === 'kcal' ? (
                        <View style={styles.targetInputContainer}>
                          <TextInput
                            ref={kcalInputRef}
                            style={styles.targetInput}
                            value={manualKcal}
                            onChangeText={(text) =>
                              setManualKcal(text.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            onBlur={stopEditing}
                            selectTextOnFocus
                          />
                          <Text style={styles.targetInputUnit}>kcal</Text>
                        </View>
                      ) : (
                        <View style={styles.targetValueContainer}>
                          <Text style={styles.targetValue}>
                            {effectiveTargets.kcal.toLocaleString()}
                          </Text>
                          <Text style={styles.targetUnit}>kcal</Text>
                          <Ionicons
                            name="pencil"
                            size={12}
                            color="#999"
                            style={styles.targetEditIcon}
                          />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Protein Row */}
                    <TouchableOpacity
                      style={styles.targetRow}
                      onPress={() => startEditing('protein')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.targetLabel}>Protein</Text>
                      {editingField === 'protein' ? (
                        <View style={styles.targetInputContainer}>
                          <TextInput
                            ref={proteinInputRef}
                            style={styles.targetInput}
                            value={manualProtein}
                            onChangeText={(text) =>
                              setManualProtein(text.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            onBlur={stopEditing}
                            selectTextOnFocus
                          />
                          <Text style={styles.targetInputUnit}>g</Text>
                        </View>
                      ) : (
                        <View style={styles.targetValueContainer}>
                          <Text style={styles.targetValue}>
                            {effectiveTargets.protein}
                          </Text>
                          <Text style={styles.targetUnit}>g</Text>
                          <Ionicons
                            name="pencil"
                            size={12}
                            color="#999"
                            style={styles.targetEditIcon}
                          />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Fat Row */}
                    <TouchableOpacity
                      style={styles.targetRow}
                      onPress={() => startEditing('fat')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.targetLabel}>Fat</Text>
                      {editingField === 'fat' ? (
                        <View style={styles.targetInputContainer}>
                          <TextInput
                            ref={fatInputRef}
                            style={styles.targetInput}
                            value={manualFat}
                            onChangeText={(text) =>
                              setManualFat(text.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            onBlur={stopEditing}
                            selectTextOnFocus
                          />
                          <Text style={styles.targetInputUnit}>g</Text>
                        </View>
                      ) : (
                        <View style={styles.targetValueContainer}>
                          <Text style={styles.targetValue}>
                            {effectiveTargets.fat}
                          </Text>
                          <Text style={styles.targetUnit}>g</Text>
                          <Ionicons
                            name="pencil"
                            size={12}
                            color="#999"
                            style={styles.targetEditIcon}
                          />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Carbs Row */}
                    <TouchableOpacity
                      style={[styles.targetRow, styles.targetRowLast]}
                      onPress={() => startEditing('carbs')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.targetLabel}>Carbs</Text>
                      {editingField === 'carbs' ? (
                        <View style={styles.targetInputContainer}>
                          <TextInput
                            ref={carbsInputRef}
                            style={styles.targetInput}
                            value={manualCarbs}
                            onChangeText={(text) =>
                              setManualCarbs(text.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            onBlur={stopEditing}
                            selectTextOnFocus
                          />
                          <Text style={styles.targetInputUnit}>g</Text>
                        </View>
                      ) : (
                        <View style={styles.targetValueContainer}>
                          <Text style={styles.targetValue}>
                            {effectiveTargets.carbs}
                          </Text>
                          <Text style={styles.targetUnit}>g</Text>
                          <Ionicons
                            name="pencil"
                            size={12}
                            color="#999"
                            style={styles.targetEditIcon}
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </Animated.ScrollView>
            </KeyboardAvoidingView>

            {/* Bottom Actions */}
            <View
              style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}
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
    fontFamily: "System",
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
  goalsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 0,
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
  },
  targetRowLast: {
    borderBottomWidth: 0,
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
