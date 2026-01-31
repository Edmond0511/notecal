import { useAppStore } from "@/store/app-store";
import {
  ActivityLevel,
  CarbPreference,
  GoalType,
  ManualTargets,
  ProteinPreference,
  Sex,
  UserGoals,
  UserGoalsInput,
} from "@/types";
import {
  calculateGoals,
  cmToFeetInches,
  getActivityLevelDescription,
  getGoalTypeDescription,
  kgToLbs,
} from "@/utils/goalsCalculator";
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

const activityLevels: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "extra_active",
];

const goalTypes: GoalType[] = [
  "lose_fast",
  "lose",
  "maintain",
  "gain",
  "gain_fast",
];

const proteinOptions: { value: ProteinPreference; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
];

const carbOptions: { value: CarbPreference; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
];

export function NutritionGoalsModal({
  visible,
  onClose,
}: NutritionGoalsModalProps) {
  console.log('🔵 NutritionGoalsModal render, visible:', visible);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);

  const goals = useAppStore((state) => state.goals);
  const setGoals = useAppStore((state) => state.setGoals);
  const setManualTargets = useAppStore((state) => state.setManualTargets);
  const preferredUnits = useAppStore((state) => state.preferredUnits);
  const setPreferredUnits = useAppStore((state) => state.setPreferredUnits);

  // Local form state
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [bodyFatPercentage, setBodyFatPercentage] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [goalType, setGoalType] = useState<GoalType>("maintain");
  const [proteinPreference, setProteinPreference] =
    useState<ProteinPreference>("standard");
  const [carbPreference, setCarbPreference] =
    useState<CarbPreference>("standard");
  const [useImperial, setUseImperial] = useState(false);

  // Manual targets state
  const [editingTargets, setEditingTargets] = useState(false);
  const [manualKcal, setManualKcal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");

  // Preview calculated goals
  const [previewGoals, setPreviewGoals] = useState<UserGoals | null>(null);

  // Initialize form from existing goals
  useEffect(() => {
    console.log('🟢 NutritionGoalsModal useEffect, visible:', visible);
    if (visible) {
      console.log('🟢 Modal is visible, initializing...');
      // Always reset animation values when modal becomes visible
      translateY.value = 0;
      isScrolledToTop.value = true;

      if (goals) {
        setSex(goals.sex);
        setAge(goals.age.toString());
        setHeightCm(goals.heightCm.toString());
        setWeightKg(goals.weightKg.toString());
        setBodyFatPercentage(goals.bodyFatPercentage?.toString() || "");
        setActivityLevel(goals.activityLevel);
        setGoalType(goals.goalType);
        setProteinPreference(goals.proteinPreference || "standard");
        setCarbPreference(goals.carbPreference || "standard");

        const isImperial = preferredUnits === "imperial";
        setUseImperial(isImperial);

        if (isImperial) {
          const { feet, inches } = cmToFeetInches(goals.heightCm);
          setHeightFeet(feet.toString());
          setHeightInches(inches.toString());
          setWeightLbs(Math.round(kgToLbs(goals.weightKg)).toString());
        }

        // Initialize manual targets if they exist
        if (goals.manualTargets) {
          setManualKcal(goals.manualTargets.kcal?.toString() || "");
          setManualProtein(goals.manualTargets.protein?.toString() || "");
          setManualFat(goals.manualTargets.fat?.toString() || "");
          setManualCarbs(goals.manualTargets.carbs?.toString() || "");
          setEditingTargets(true);
        } else {
          setManualKcal("");
          setManualProtein("");
          setManualFat("");
          setManualCarbs("");
          setEditingTargets(false);
        }
      } else {
        // Reset to defaults when no goals exist
        setSex("male");
        setAge("");
        setHeightCm("");
        setHeightFeet("");
        setHeightInches("");
        setWeightKg("");
        setWeightLbs("");
        setBodyFatPercentage("");
        setActivityLevel("moderate");
        setGoalType("maintain");
        setProteinPreference("standard");
        setCarbPreference("standard");
        setUseImperial(preferredUnits === "imperial");
        setManualKcal("");
        setManualProtein("");
        setManualFat("");
        setManualCarbs("");
        setEditingTargets(false);
        setPreviewGoals(null);
      }
    }
  }, [visible, goals, preferredUnits]);

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

  // Get calculated values based on form inputs
  const getCalculatedGoals = (): UserGoals | null => {
    let heightValue: number;
    let weightValue: number;

    if (useImperial) {
      const feet = parseFloat(heightFeet) || 0;
      const inches = parseFloat(heightInches) || 0;
      heightValue = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
      weightValue =
        Math.round((parseFloat(weightLbs) || 0) * 0.453592 * 10) / 10;
    } else {
      heightValue = parseFloat(heightCm) || 0;
      weightValue = parseFloat(weightKg) || 0;
    }

    if (!sex || !age || !heightValue || !weightValue) {
      return null;
    }

    const input: UserGoalsInput = {
      sex,
      age: parseInt(age, 10),
      heightCm: heightValue,
      weightKg: weightValue,
      bodyFatPercentage: bodyFatPercentage
        ? parseFloat(bodyFatPercentage)
        : null,
      activityLevel,
      goalType,
      proteinPreference,
      carbPreference,
    };

    return calculateGoals(input);
  };

  // Get effective targets (manual overrides or calculated)
  const getEffectiveTargets = () => {
    const calculated = goals || getCalculatedGoals();
    if (!calculated) {
      return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    }

    const manual = goals?.manualTargets;
    return {
      kcal: manual?.kcal ?? calculated.targetKcal,
      protein: manual?.protein ?? calculated.targetProtein,
      fat: manual?.fat ?? calculated.targetFat,
      carbs: manual?.carbs ?? calculated.targetCarbs,
    };
  };

  const handleRecalculate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const calculated = getCalculatedGoals();
    if (calculated) {
      setPreviewGoals(calculated);
    }
  };

  const handleSaveGoals = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let heightValue: number;
    let weightValue: number;

    if (useImperial) {
      const feet = parseFloat(heightFeet) || 0;
      const inches = parseFloat(heightInches) || 0;
      heightValue = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
      weightValue =
        Math.round((parseFloat(weightLbs) || 0) * 0.453592 * 10) / 10;
    } else {
      heightValue = parseFloat(heightCm) || 0;
      weightValue = parseFloat(weightKg) || 0;
    }

    const input: UserGoalsInput = {
      sex,
      age: parseInt(age, 10),
      heightCm: heightValue,
      weightKg: weightValue,
      bodyFatPercentage: bodyFatPercentage
        ? parseFloat(bodyFatPercentage)
        : null,
      activityLevel,
      goalType,
      proteinPreference,
      carbPreference,
    };

    const calculatedGoals = calculateGoals(input);

    // Add manual targets if editing
    if (editingTargets) {
      const manualTargets: ManualTargets = {};
      if (manualKcal) manualTargets.kcal = parseInt(manualKcal, 10);
      if (manualProtein) manualTargets.protein = parseInt(manualProtein, 10);
      if (manualFat) manualTargets.fat = parseInt(manualFat, 10);
      if (manualCarbs) manualTargets.carbs = parseInt(manualCarbs, 10);

      if (Object.keys(manualTargets).length > 0) {
        calculatedGoals.manualTargets = manualTargets;
      } else {
        calculatedGoals.manualTargets = null;
      }
    } else {
      calculatedGoals.manualTargets = null;
    }

    setGoals(calculatedGoals);
    setPreferredUnits(useImperial ? "imperial" : "metric");
    setPreviewGoals(null);
    onClose();
  };

  const handleClearManualTargets = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingTargets(false);
    setManualKcal("");
    setManualProtein("");
    setManualFat("");
    setManualCarbs("");
  };

  const effectiveTargets = getEffectiveTargets();
  const hasManualOverrides = goals?.manualTargets != null;

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
                {/* Current Goals Summary */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Current Targets</Text>

                  <View style={styles.goalsCard}>
                    {hasManualOverrides && !editingTargets && (
                      <View style={styles.overrideBadge}>
                        <Ionicons
                          name="create-outline"
                          size={12}
                          color="#F57F17"
                        />
                        <Text style={styles.overrideBadgeText}>
                          Manual Override
                        </Text>
                      </View>
                    )}

                    <View style={styles.goalsGrid}>
                      <View style={styles.goalItem}>
                        <Text style={styles.goalValue}>
                          {effectiveTargets.kcal}
                        </Text>
                        <Text style={styles.goalLabel}>Calories</Text>
                      </View>
                      <View style={styles.goalItem}>
                        <Text style={styles.goalValue}>
                          {effectiveTargets.protein}g
                        </Text>
                        <Text style={styles.goalLabel}>Protein</Text>
                      </View>
                      <View style={styles.goalItem}>
                        <Text style={styles.goalValue}>
                          {effectiveTargets.fat}g
                        </Text>
                        <Text style={styles.goalLabel}>Fat</Text>
                      </View>
                      <View style={styles.goalItem}>
                        <Text style={styles.goalValue}>
                          {effectiveTargets.carbs}g
                        </Text>
                        <Text style={styles.goalLabel}>Carbs</Text>
                      </View>
                    </View>

                    <View style={styles.editTargetsRow}>
                      <TouchableOpacity
                        style={[
                          styles.editTargetsButton,
                          editingTargets && styles.editTargetsButtonActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setEditingTargets(!editingTargets);
                        }}
                      >
                        <Ionicons
                          name={editingTargets ? "close" : "create-outline"}
                          size={16}
                          color={editingTargets ? "#666" : "#1A6872"}
                        />
                        <Text
                          style={[
                            styles.editTargetsText,
                            editingTargets && styles.editTargetsTextActive,
                          ]}
                        >
                          {editingTargets ? "Cancel Edit" : "Edit Targets"}
                        </Text>
                      </TouchableOpacity>

                      {hasManualOverrides && !editingTargets && (
                        <TouchableOpacity
                          style={styles.clearOverridesButton}
                          onPress={handleClearManualTargets}
                        >
                          <Text style={styles.clearOverridesText}>
                            Use Calculated
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {editingTargets && (
                      <View style={styles.manualInputsContainer}>
                        <Text style={styles.manualInputsHint}>
                          Leave blank to use calculated values
                        </Text>
                        <View style={styles.manualInputsGrid}>
                          <View style={styles.manualInputItem}>
                            <Text style={styles.manualInputLabel}>
                              Calories
                            </Text>
                            <TextInput
                              style={styles.manualInput}
                              value={manualKcal}
                              onChangeText={(text) =>
                                setManualKcal(text.replace(/[^0-9]/g, ""))
                              }
                              keyboardType="number-pad"
                              placeholder={goals?.targetKcal?.toString() || ""}
                              placeholderTextColor="#bbb"
                            />
                          </View>
                          <View style={styles.manualInputItem}>
                            <Text style={styles.manualInputLabel}>
                              Protein (g)
                            </Text>
                            <TextInput
                              style={styles.manualInput}
                              value={manualProtein}
                              onChangeText={(text) =>
                                setManualProtein(text.replace(/[^0-9]/g, ""))
                              }
                              keyboardType="number-pad"
                              placeholder={
                                goals?.targetProtein?.toString() || ""
                              }
                              placeholderTextColor="#bbb"
                            />
                          </View>
                          <View style={styles.manualInputItem}>
                            <Text style={styles.manualInputLabel}>Fat (g)</Text>
                            <TextInput
                              style={styles.manualInput}
                              value={manualFat}
                              onChangeText={(text) =>
                                setManualFat(text.replace(/[^0-9]/g, ""))
                              }
                              keyboardType="number-pad"
                              placeholder={goals?.targetFat?.toString() || ""}
                              placeholderTextColor="#bbb"
                            />
                          </View>
                          <View style={styles.manualInputItem}>
                            <Text style={styles.manualInputLabel}>
                              Carbs (g)
                            </Text>
                            <TextInput
                              style={styles.manualInput}
                              value={manualCarbs}
                              onChangeText={(text) =>
                                setManualCarbs(text.replace(/[^0-9]/g, ""))
                              }
                              keyboardType="number-pad"
                              placeholder={goals?.targetCarbs?.toString() || ""}
                              placeholderTextColor="#bbb"
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                </Animated.View>

                {/* Personal Info Section */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Personal Info</Text>

                  <View style={styles.card}>
                    {/* Unit toggle */}
                    <View style={styles.unitToggleContainer}>
                      <TouchableOpacity
                        style={[
                          styles.unitOption,
                          !useImperial && styles.unitOptionActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setUseImperial(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.unitOptionText,
                            !useImperial && styles.unitOptionTextActive,
                          ]}
                        >
                          Metric
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.unitOption,
                          useImperial && styles.unitOptionActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setUseImperial(true);
                        }}
                      >
                        <Text
                          style={[
                            styles.unitOptionText,
                            useImperial && styles.unitOptionTextActive,
                          ]}
                        >
                          Imperial
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Sex */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Sex</Text>
                      <View style={styles.sexContainer}>
                        <TouchableOpacity
                          style={[
                            styles.sexOption,
                            sex === "male" && styles.sexOptionActive,
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light
                            );
                            setSex("male");
                          }}
                        >
                          <Ionicons
                            name="male"
                            size={20}
                            color={sex === "male" ? "#fff" : "#666"}
                          />
                          <Text
                            style={[
                              styles.sexOptionText,
                              sex === "male" && styles.sexOptionTextActive,
                            ]}
                          >
                            Male
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.sexOption,
                            sex === "female" && styles.sexOptionActive,
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light
                            );
                            setSex("female");
                          }}
                        >
                          <Ionicons
                            name="female"
                            size={20}
                            color={sex === "female" ? "#fff" : "#666"}
                          />
                          <Text
                            style={[
                              styles.sexOptionText,
                              sex === "female" && styles.sexOptionTextActive,
                            ]}
                          >
                            Female
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Age */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Age</Text>
                      <View style={styles.inputRow}>
                        <TextInput
                          style={styles.input}
                          value={age}
                          onChangeText={(text) =>
                            setAge(text.replace(/[^0-9]/g, ""))
                          }
                          keyboardType="number-pad"
                          placeholder="25"
                          placeholderTextColor="#aaa"
                          maxLength={3}
                        />
                        <Text style={styles.inputUnit}>years</Text>
                      </View>
                    </View>

                    {/* Height */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Height</Text>
                      {useImperial ? (
                        <View style={styles.inputRow}>
                          <TextInput
                            style={[styles.input, styles.inputSmall]}
                            value={heightFeet}
                            onChangeText={(text) =>
                              setHeightFeet(text.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            placeholder="5"
                            placeholderTextColor="#aaa"
                            maxLength={1}
                          />
                          <Text style={styles.inputUnit}>ft</Text>
                          <TextInput
                            style={[styles.input, styles.inputSmall]}
                            value={heightInches}
                            onChangeText={(text) =>
                              setHeightInches(text.replace(/[^0-9]/g, ""))
                            }
                            keyboardType="number-pad"
                            placeholder="10"
                            placeholderTextColor="#aaa"
                            maxLength={2}
                          />
                          <Text style={styles.inputUnit}>in</Text>
                        </View>
                      ) : (
                        <View style={styles.inputRow}>
                          <TextInput
                            style={styles.input}
                            value={heightCm}
                            onChangeText={(text) =>
                              setHeightCm(text.replace(/[^0-9.]/g, ""))
                            }
                            keyboardType="decimal-pad"
                            placeholder="175"
                            placeholderTextColor="#aaa"
                            maxLength={5}
                          />
                          <Text style={styles.inputUnit}>cm</Text>
                        </View>
                      )}
                    </View>

                    {/* Weight */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Weight</Text>
                      {useImperial ? (
                        <View style={styles.inputRow}>
                          <TextInput
                            style={styles.input}
                            value={weightLbs}
                            onChangeText={(text) =>
                              setWeightLbs(text.replace(/[^0-9.]/g, ""))
                            }
                            keyboardType="decimal-pad"
                            placeholder="160"
                            placeholderTextColor="#aaa"
                            maxLength={5}
                          />
                          <Text style={styles.inputUnit}>lbs</Text>
                        </View>
                      ) : (
                        <View style={styles.inputRow}>
                          <TextInput
                            style={styles.input}
                            value={weightKg}
                            onChangeText={(text) =>
                              setWeightKg(text.replace(/[^0-9.]/g, ""))
                            }
                            keyboardType="decimal-pad"
                            placeholder="70"
                            placeholderTextColor="#aaa"
                            maxLength={5}
                          />
                          <Text style={styles.inputUnit}>kg</Text>
                        </View>
                      )}
                    </View>

                    {/* Body Fat */}
                    <View style={styles.fieldContainer}>
                      <View style={styles.labelRow}>
                        <Text style={styles.fieldLabel}>Body Fat %</Text>
                        <Text style={styles.optionalLabel}>Optional</Text>
                      </View>
                      <View style={styles.inputRow}>
                        <TextInput
                          style={styles.input}
                          value={bodyFatPercentage}
                          onChangeText={(text) =>
                            setBodyFatPercentage(text.replace(/[^0-9.]/g, ""))
                          }
                          keyboardType="decimal-pad"
                          placeholder="20"
                          placeholderTextColor="#aaa"
                          maxLength={4}
                        />
                        <Text style={styles.inputUnit}>%</Text>
                      </View>
                    </View>
                  </View>
                </Animated.View>

                {/* Activity & Goals Section */}
                <Animated.View
                  entering={FadeInDown.delay(300).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Activity & Goals</Text>

                  <View style={styles.card}>
                    {/* Activity Level */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Activity Level</Text>
                      <View style={styles.selectContainer}>
                        {activityLevels.map((level) => {
                          const { title } = getActivityLevelDescription(level);
                          const isSelected = activityLevel === level;
                          return (
                            <TouchableOpacity
                              key={level}
                              style={[
                                styles.selectOption,
                                isSelected && styles.selectOptionActive,
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light
                                );
                                setActivityLevel(level);
                              }}
                            >
                              <Text
                                style={[
                                  styles.selectOptionText,
                                  isSelected && styles.selectOptionTextActive,
                                ]}
                              >
                                {title}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Goal Type */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Goal</Text>
                      <View style={styles.selectContainer}>
                        {goalTypes.map((goal) => {
                          const { title } = getGoalTypeDescription(goal);
                          const isSelected = goalType === goal;
                          return (
                            <TouchableOpacity
                              key={goal}
                              style={[
                                styles.selectOption,
                                isSelected && styles.selectOptionActive,
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light
                                );
                                setGoalType(goal);
                              }}
                            >
                              <Text
                                style={[
                                  styles.selectOptionText,
                                  isSelected && styles.selectOptionTextActive,
                                ]}
                              >
                                {title}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Protein Preference */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Protein Preference</Text>
                      <View style={styles.prefRow}>
                        {proteinOptions.map((option) => {
                          const isSelected =
                            proteinPreference === option.value;
                          return (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.prefOption,
                                isSelected && styles.prefOptionActive,
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light
                                );
                                setProteinPreference(option.value);
                              }}
                            >
                              <Text
                                style={[
                                  styles.prefOptionText,
                                  isSelected && styles.prefOptionTextActive,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Carb Preference */}
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>Carb Preference</Text>
                      <View style={styles.prefRow}>
                        {carbOptions.map((option) => {
                          const isSelected = carbPreference === option.value;
                          return (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.prefOption,
                                isSelected && styles.prefOptionActive,
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light
                                );
                                setCarbPreference(option.value);
                              }}
                            >
                              <Text
                                style={[
                                  styles.prefOptionText,
                                  isSelected && styles.prefOptionTextActive,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </Animated.View>

                {/* Preview Section */}
                {previewGoals && (
                  <Animated.View
                    entering={FadeInDown.delay(100).duration(300)}
                    style={styles.section}
                  >
                    <Text style={styles.sectionTitle}>Calculated Preview</Text>
                    <View style={styles.previewCard}>
                      <View style={styles.previewGrid}>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewValue}>
                            {previewGoals.targetKcal}
                          </Text>
                          <Text style={styles.previewLabel}>Calories</Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewValue}>
                            {previewGoals.targetProtein}g
                          </Text>
                          <Text style={styles.previewLabel}>Protein</Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewValue}>
                            {previewGoals.targetFat}g
                          </Text>
                          <Text style={styles.previewLabel}>Fat</Text>
                        </View>
                        <View style={styles.previewItem}>
                          <Text style={styles.previewValue}>
                            {previewGoals.targetCarbs}g
                          </Text>
                          <Text style={styles.previewLabel}>Carbs</Text>
                        </View>
                      </View>
                      <View style={styles.previewDetails}>
                        <Text style={styles.previewDetailText}>
                          BMR: {previewGoals.bmr} | TDEE: {previewGoals.tdee}
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                )}
              </Animated.ScrollView>
            </KeyboardAvoidingView>

            {/* Bottom Actions */}
            <View
              style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}
            >
              <TouchableOpacity
                style={styles.recalculateButton}
                onPress={handleRecalculate}
              >
                <Ionicons name="calculator-outline" size={18} color="#1A6872" />
                <Text style={styles.recalculateText}>Preview</Text>
              </TouchableOpacity>

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
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  goalsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  overrideBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    gap: 4,
  },
  overrideBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F57F17",
  },
  goalsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalItem: {
    alignItems: "center",
    flex: 1,
  },
  goalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A6872",
    marginBottom: 2,
  },
  goalLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "500",
  },
  editTargetsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  editTargetsButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#E0F2F1",
    gap: 6,
  },
  editTargetsButtonActive: {
    backgroundColor: "#f5f5f5",
  },
  editTargetsText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A6872",
  },
  editTargetsTextActive: {
    color: "#666",
  },
  clearOverridesButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearOverridesText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
    textDecorationLine: "underline",
  },
  manualInputsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  manualInputsHint: {
    fontSize: 12,
    color: "#888",
    marginBottom: 12,
    fontStyle: "italic",
  },
  manualInputsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  manualInputItem: {
    width: "47%",
  },
  manualInputLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    fontWeight: "500",
  },
  manualInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  unitToggleContainer: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  unitOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  unitOptionActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unitOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#888",
  },
  unitOptionTextActive: {
    color: "#333",
  },
  fieldContainer: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  optionalLabel: {
    fontSize: 11,
    color: "#888",
    marginBottom: 8,
  },
  sexContainer: {
    flexDirection: "row",
    gap: 10,
  },
  sexOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    gap: 6,
  },
  sexOptionActive: {
    backgroundColor: "#1A6872",
  },
  sexOptionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  sexOptionTextActive: {
    color: "#fff",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    maxWidth: 100,
    height: 44,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  inputSmall: {
    maxWidth: 70,
  },
  inputUnit: {
    fontSize: 13,
    color: "#666",
    minWidth: 30,
  },
  selectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectOptionActive: {
    backgroundColor: "#E0F2F1",
    borderColor: "#1A6872",
  },
  selectOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  selectOptionTextActive: {
    color: "#1A6872",
    fontWeight: "600",
  },
  prefRow: {
    flexDirection: "row",
    gap: 8,
  },
  prefOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderColor: "transparent",
  },
  prefOptionActive: {
    backgroundColor: "#E0F2F1",
    borderColor: "#1A6872",
  },
  prefOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  prefOptionTextActive: {
    color: "#1A6872",
    fontWeight: "600",
  },
  previewCard: {
    backgroundColor: "#E0F2F1",
    borderRadius: 16,
    padding: 16,
  },
  previewGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  previewItem: {
    alignItems: "center",
    flex: 1,
  },
  previewValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A6872",
    marginBottom: 2,
  },
  previewLabel: {
    fontSize: 11,
    color: "#1A6872",
    fontWeight: "500",
    opacity: 0.7,
  },
  previewDetails: {
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#B2DFDB",
  },
  previewDetailText: {
    fontSize: 12,
    color: "#1A6872",
    fontWeight: "500",
  },
  bottomActions: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "#f8f8f8",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 12,
  },
  recalculateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: "#E0F2F1",
    gap: 6,
  },
  recalculateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A6872",
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
