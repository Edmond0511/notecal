import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faBolt,
  faCube,
  faCubesStacked,
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faGlassWater,
  faSeedling,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
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
  withSpring,
} from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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
  | "potassium"
  | "water";

interface OtherNutrient {
  key: "fiber" | "sugar" | "sodium" | "potassium" | "water";
  label: string;
  unit: string;
  placeholder: string;
  color: string;
  icon: IconProp;
}

// Cast icons to IconProp to fix type mismatch between FA packages
const icons = {
  fire: faFireFlameCurved as IconProp,
  drumstickBite: faDrumstickBite as IconProp,
  droplet: faDroplet as IconProp,
  wheatAwn: faWheatAwn as IconProp,
  seedling: faSeedling as IconProp,
  cube: faCube as IconProp,
  cubesStacked: faCubesStacked as IconProp,
  bolt: faBolt as IconProp,
  glassWater: faGlassWater as IconProp,
};

// Icons and colors for main macros
const MACRO_CONFIG = {
  kcal: { icon: icons.fire, color: "#FF6B35" },
  protein: { icon: icons.drumstickBite, color: "#4A90D9" },
  fat: { icon: icons.droplet, color: "#F5A623" },
  carbs: { icon: icons.wheatAwn, color: "#9B6B9E" },
};

// Universal default values for micronutrients (no personalized calculation needed)
const DEFAULT_MICRONUTRIENTS = {
  fiber: 25,       // 25g - universal recommendation
  sugar: 50,       // 50g - ~10% of 2000 kcal diet
  sodium: 2300,    // 2300mg - universal limit
  potassium: 3500, // 3500mg - universal recommendation
};

// Sex-based water intake recommendations (in liters)
const DEFAULT_WATER = {
  male: 3.7,
  female: 2.7,
};

const OTHER_NUTRIENTS: OtherNutrient[] = [
  {
    key: "fiber",
    label: "Fiber",
    unit: "g",
    placeholder: "25",
    color: "#B08C5A",
    icon: icons.seedling,
  },
  {
    key: "sugar",
    label: "Sugar",
    unit: "g",
    placeholder: "50",
    color: "#D4687E",
    icon: icons.cube,
  },
  {
    key: "sodium",
    label: "Sodium",
    unit: "mg",
    placeholder: "2300",
    color: "#6898BE",
    icon: icons.cubesStacked,
  },
  {
    key: "potassium",
    label: "Potassium",
    unit: "mg",
    placeholder: "3500",
    color: "#72A868",
    icon: icons.bolt,
  },
  {
    key: "water",
    label: "Water",
    unit: "L",
    placeholder: "3.7",
    color: "#5AADE0",
    icon: icons.glassWater,
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
  const [manualWater, setManualWater] = useState("");

  const [fiberEnabled, setFiberEnabled] = useState(false);
  const [sugarEnabled, setSugarEnabled] = useState(false);
  const [sodiumEnabled, setSodiumEnabled] = useState(false);
  const [potassiumEnabled, setPotassiumEnabled] = useState(false);
  const [waterEnabled, setWaterEnabled] = useState(false);


  const scrollViewRef = React.useRef<any>(null);
  const scrollY = React.useRef(0);

  // Refs for each input field
  const kcalInputRef = React.useRef<TextInput>(null);
  const proteinInputRef = React.useRef<TextInput>(null);
  const fatInputRef = React.useRef<TextInput>(null);
  const carbsInputRef = React.useRef<TextInput>(null);
  const fiberInputRef = React.useRef<TextInput>(null);
  const sugarInputRef = React.useRef<TextInput>(null);
  const sodiumInputRef = React.useRef<TextInput>(null);
  const potassiumInputRef = React.useRef<TextInput>(null);
  const waterInputRef = React.useRef<TextInput>(null);

  const inputRefs: Record<NutrientField, React.RefObject<TextInput>> = {
    kcal: kcalInputRef,
    protein: proteinInputRef,
    fat: fatInputRef,
    carbs: carbsInputRef,
    fiber: fiberInputRef,
    sugar: sugarInputRef,
    sodium: sodiumInputRef,
    potassium: potassiumInputRef,
    water: waterInputRef,
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

        // Other nutrients - use saved values or universal defaults
        const fiber = goals.manualTargets?.fiber;
        const sugar = goals.manualTargets?.sugar;
        const sodium = goals.manualTargets?.sodium;
        const potassium = goals.manualTargets?.potassium;
        const water = goals.manualTargets?.water;

        // Get sex-based water default
        const defaultWater = goals.sex === 'female' ? DEFAULT_WATER.female : DEFAULT_WATER.male;

        setManualFiber(fiber?.toString() ?? DEFAULT_MICRONUTRIENTS.fiber.toString());
        setManualSugar(sugar?.toString() ?? DEFAULT_MICRONUTRIENTS.sugar.toString());
        setManualSodium(sodium?.toString() ?? DEFAULT_MICRONUTRIENTS.sodium.toString());
        setManualPotassium(potassium?.toString() ?? DEFAULT_MICRONUTRIENTS.potassium.toString());
        setManualWater(water?.toString() ?? defaultWater.toString());

        setFiberEnabled(fiber !== undefined);
        setSugarEnabled(sugar !== undefined);
        setSodiumEnabled(sodium !== undefined);
        setPotassiumEnabled(potassium !== undefined);
        setWaterEnabled(water !== undefined);
      } else {
        setManualKcal("2000");
        setManualProtein("150");
        setManualFat("65");
        setManualCarbs("200");
        setManualFiber(DEFAULT_MICRONUTRIENTS.fiber.toString());
        setManualSugar(DEFAULT_MICRONUTRIENTS.sugar.toString());
        setManualSodium(DEFAULT_MICRONUTRIENTS.sodium.toString());
        setManualPotassium(DEFAULT_MICRONUTRIENTS.potassium.toString());
        setManualWater(DEFAULT_WATER.male.toString()); // Default to male until goals are set
        setFiberEnabled(false);
        setSugarEnabled(false);
        setSodiumEnabled(false);
        setPotassiumEnabled(false);
        setWaterEnabled(false);
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
    scrollY.current = event.nativeEvent.contentOffset.y;
  };

  const handleSaveGoals = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const kcalValue = parseInt(manualKcal, 10) || 2000;
    const proteinValue = parseInt(manualProtein, 10) || 150;
    const fatValue = parseInt(manualFat, 10) || 65;
    const carbsValue = parseInt(manualCarbs, 10) || 200;

    // Get sex-based water default
    const defaultWater = goals?.sex === 'female' ? DEFAULT_WATER.female : DEFAULT_WATER.male;

    const manualTargets = {
      kcal: kcalValue,
      protein: proteinValue,
      fat: fatValue,
      carbs: carbsValue,
      ...(fiberEnabled && { fiber: parseInt(manualFiber, 10) || DEFAULT_MICRONUTRIENTS.fiber }),
      ...(sugarEnabled && { sugar: parseInt(manualSugar, 10) || DEFAULT_MICRONUTRIENTS.sugar }),
      ...(sodiumEnabled && { sodium: parseInt(manualSodium, 10) || DEFAULT_MICRONUTRIENTS.sodium }),
      ...(potassiumEnabled && {
        potassium: parseInt(manualPotassium, 10) || DEFAULT_MICRONUTRIENTS.potassium,
      }),
      ...(waterEnabled && { water: parseFloat(manualWater) || defaultWater }),
    };

    const updatedGoals = goals
      ? { ...goals, manualTargets }
      : {
          sex: "male" as const,
          age: 30,
          heightCm: 175,
          weightKg: 70,
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
      case "water":
        return manualWater;
    }
  };

  const setValueForField = (field: NutrientField, value: string) => {
    // Allow decimals for water (liters), integers only for others
    const cleanValue = field === "water"
      ? value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")  // Allow one decimal point
      : value.replace(/[^0-9]/g, "");
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
      case "water":
        setManualWater(cleanValue);
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
    nutrient: "fiber" | "sugar" | "sodium" | "potassium" | "water",
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
      case "water":
        setWaterEnabled(!waterEnabled);
        break;
    }
  };

  // Check if any values have been modified from calculated/default values
  const hasAnyModifications = (): boolean => {
    if (!goals) return false;

    const kcalChanged = parseInt(manualKcal, 10) !== goals.targetKcal;
    const proteinChanged = parseInt(manualProtein, 10) !== goals.targetProtein;
    const fatChanged = parseInt(manualFat, 10) !== goals.targetFat;
    const carbsChanged = parseInt(manualCarbs, 10) !== goals.targetCarbs;

    // Check micronutrients (only if enabled)
    const fiberChanged = fiberEnabled && parseInt(manualFiber, 10) !== DEFAULT_MICRONUTRIENTS.fiber;
    const sugarChanged = sugarEnabled && parseInt(manualSugar, 10) !== DEFAULT_MICRONUTRIENTS.sugar;
    const sodiumChanged = sodiumEnabled && parseInt(manualSodium, 10) !== DEFAULT_MICRONUTRIENTS.sodium;
    const potassiumChanged = potassiumEnabled && parseInt(manualPotassium, 10) !== DEFAULT_MICRONUTRIENTS.potassium;

    // Check water (sex-based default)
    const defaultWater = goals.sex === 'female' ? DEFAULT_WATER.female : DEFAULT_WATER.male;
    const waterChanged = waterEnabled && parseFloat(manualWater) !== defaultWater;

    return kcalChanged || proteinChanged || fatChanged || carbsChanged ||
           fiberChanged || sugarChanged || sodiumChanged || potassiumChanged || waterChanged;
  };

  // Reset all targets to calculated/universal values
  const resetAllToCalculated = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (goals) {
      // Reset macros to calculated values
      setManualKcal(goals.targetKcal.toString());
      setManualProtein(goals.targetProtein.toString());
      setManualFat(goals.targetFat.toString());
      setManualCarbs(goals.targetCarbs.toString());

      // Reset water to sex-based default
      const defaultWater = goals.sex === 'female' ? DEFAULT_WATER.female : DEFAULT_WATER.male;
      setManualWater(defaultWater.toString());
    }

    // Reset micronutrients to universal defaults
    setManualFiber(DEFAULT_MICRONUTRIENTS.fiber.toString());
    setManualSugar(DEFAULT_MICRONUTRIENTS.sugar.toString());
    setManualSodium(DEFAULT_MICRONUTRIENTS.sodium.toString());
    setManualPotassium(DEFAULT_MICRONUTRIENTS.potassium.toString());

    setEditingField(null);
  };

  const isNutrientEnabled = (
    nutrient: "fiber" | "sugar" | "sodium" | "potassium" | "water",
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
      case "water":
        return waterEnabled;
    }
  };

  const renderTargetRow = (
    field: NutrientField,
    label: string,
    unit: string,
    isLast: boolean = false,
    icon?: IconProp,
    iconColor?: string,
  ) => {
    const value = getValueForField(field);
    // Use parseFloat for water (liters), parseInt for others
    const displayValue = field === "water" ? (parseFloat(value) || 0) : (parseInt(value, 10) || 0);

    return (
      <TouchableOpacity
        key={field}
        style={[styles.targetRow, isLast && styles.targetRowLast]}
        onPress={() => startEditing(field)}
        activeOpacity={0.7}
      >
        <View style={styles.targetLabelContainer}>
          {icon && (
            <FontAwesomeIcon
              icon={icon}
              size={16}
              color={iconColor || "#666"}
            />
          )}
          <Text style={styles.targetLabel}>{label}</Text>
        </View>
        {editingField === field ? (
          <View style={styles.targetInputContainer}>
            <TextInput
              ref={inputRefs[field]}
              style={styles.targetInput}
              value={value}
              onChangeText={(text) => setValueForField(field, text)}
              keyboardType={field === "water" ? "decimal-pad" : "number-pad"}
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
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.7}
              >
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="chevron-back" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Nutrition Targets</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <KeyboardAwareScrollView
              ref={scrollViewRef}
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
              keyboardDismissMode="interactive"
            >
                {/* Other Nutrients Section */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  layout={Layout.springify()}
                  style={styles.section}
                >
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Other Nutrients</Text>
                  </View>

                  <View style={styles.toggleCardShadow}>
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

                            </View>
                            <Switch
                              value={enabled}
                              onValueChange={() => toggleNutrient(nutrient.key)}
                              trackColor={{ true: "#34C759" }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Water tracking tooltip */}
                  {waterEnabled && (
                    <Animated.View
                      entering={FadeIn.duration(200)}
                      exiting={FadeOut.duration(200)}
                      style={styles.waterTip}
                    >
                      <Text style={styles.waterTipTitle}>Track Water Intake</Text>
                      <Text style={styles.waterTipText}>
                        Log water in your notes using any unit:
                      </Text>
                      <View style={styles.waterTipExamples}>
                        <Text style={styles.waterTipExample}>
                          - water, 500ml
                        </Text>
                        <Text style={styles.waterTipExample}>
                          - 1.5l water
                        </Text>
                      </View>
                      <View style={styles.waterTipUnitsRow}>
                        <View style={styles.waterTipUnit}>
                          <Text style={styles.waterTipUnitText}>L</Text>
                        </View>
                        <View style={styles.waterTipUnit}>
                          <Text style={styles.waterTipUnitText}>mL</Text>
                        </View>
                        <View style={styles.waterTipUnit}>
                          <Text style={styles.waterTipUnitText}>oz</Text>
                        </View>
                      </View>
                    </Animated.View>
                  )}
                </Animated.View>

                {/* Daily Targets Section */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  layout={Layout.springify()}
                  style={styles.section}
                >
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Daily Targets</Text>

                    {/* Reset to calculated values - inline with section title */}
                    {goals && hasAnyModifications() && (
                      <Animated.View
                        entering={FadeIn.duration(200)}
                        exiting={FadeOut.duration(150)}
                      >
                        <TouchableOpacity
                          style={styles.resetButton}
                          onPress={resetAllToCalculated}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="refresh" size={13} color="#1A6872" />
                          <Text style={styles.resetButtonText}>Reset</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    )}
                  </View>

                  <Animated.View
                    style={styles.goalsCardShadow}
                    layout={Layout.springify()}
                  >
                    <View style={styles.goalsCard}>
                      {renderTargetRow("kcal", "Calories", "cal", false, MACRO_CONFIG.kcal.icon, MACRO_CONFIG.kcal.color)}
                      {renderTargetRow("protein", "Protein", "g", false, MACRO_CONFIG.protein.icon, MACRO_CONFIG.protein.color)}
                      {renderTargetRow("fat", "Fat", "g", false, MACRO_CONFIG.fat.icon, MACRO_CONFIG.fat.color)}
                      {renderTargetRow(
                        "carbs",
                        "Carbs",
                        "g",
                        enabledOtherNutrients.length === 0,
                        MACRO_CONFIG.carbs.icon,
                        MACRO_CONFIG.carbs.color,
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
                            nutrient.icon,
                            nutrient.color,
                          )}
                        </Animated.View>
                      ))}
                    </View>
                  </Animated.View>
                </Animated.View>
            </KeyboardAwareScrollView>

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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f8f8",
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
  headerRightSpacer: {
    width: 36,
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    marginLeft: 4,
    marginRight: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "rgba(26, 104, 114, 0.08)",
    borderRadius: 12,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#1A6872",
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#aaa",
    marginBottom: 12,
    marginLeft: 4,
  },
  goalsCardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  goalsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 4,
    overflow: "hidden",
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
    color: "#333",
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
    color: "#333",
    textAlign: "right",
    minWidth: 60,
    padding: 0,
  },
  targetInputUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  toggleCardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  toggleCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
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
    fontWeight: "400",
    color: "#fff",
  },
  waterTip: {
    backgroundColor: "#EAF3FB",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(126, 179, 224, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  waterTipTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#5A9AC7",
    marginBottom: 6,
  },
  waterTipText: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    marginBottom: 8,
    lineHeight: 18,
  },
  waterTipExamples: {
    gap: 4,
    marginBottom: 10,
  },
  waterTipExample: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    fontStyle: "italic",
  },
  waterTipUnitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  waterTipUnit: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(126, 179, 224, 0.25)",
  },
  waterTipUnitText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#5A9AC7",
  },
});
