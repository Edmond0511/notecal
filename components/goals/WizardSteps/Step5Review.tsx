import { Tokens } from "@/constants/theme";
import { UserGoals } from "@/types";
import {
  getActivityLevelDescription,
  getGoalTypeDescription,
  kgToLbs,
} from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowRight,
  faBolt,
  faCubesStacked,
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faSeedling,
  faTint,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { WizardFormData } from "../GoalsWizard";

// Cast icons to IconProp to fix type mismatch between FA packages
const icons = {
  fire: faFireFlameCurved as IconProp,
  arrowRight: faArrowRight as IconProp,
  drumstickBite: faDrumstickBite as IconProp,
  droplet: faDroplet as IconProp,
  wheatAwn: faWheatAwn as IconProp,
  seedling: faSeedling as IconProp,
  cubesStacked: faCubesStacked as IconProp,
  tint: faTint as IconProp,
  bolt: faBolt as IconProp,
};

const CALORIE_EXPLANATIONS = {
  bmr: {
    title: "BMR (Basal Metabolic Rate)",
    description:
      "The calories your body burns at complete rest - just to keep vital organs like your heart, lungs, and brain functioning.",
    formula:
      "Calculated using the Mifflin-St Jeor equation based on your age, sex, height, and weight.",
  },
  tdee: {
    title: "TDEE (Total Daily Energy Expenditure)",
    description:
      "Your BMR plus calories burned through daily activity and exercise. This is your estimated total daily calorie burn.",
    formula: "TDEE = BMR × Activity Multiplier",
  },
};

interface Step5ReviewProps {
  goals: UserGoals | null;
  formData: WizardFormData;
  existingGoals?: UserGoals | null;
}

const OTHER_NUTRIENTS = [
  {
    key: "fiber" as const,
    label: "Fiber",
    unit: "g",
    color: "#B08C5A",
    icon: icons.seedling,
  },
  {
    key: "sugar" as const,
    label: "Sugar",
    unit: "g",
    color: "#D4687E",
    icon: icons.cubesStacked,
  },
  {
    key: "sodium" as const,
    label: "Sodium",
    unit: "mg",
    color: "#6898BE",
    icon: icons.tint,
  },
  {
    key: "potassium" as const,
    label: "Potassium",
    unit: "mg",
    color: "#72A868",
    icon: icons.bolt,
  },
];

// Popup component for BMR/TDEE explanations
function CalorieExplanationPopup({
  type,
  visible,
  onClose,
}: {
  type: "bmr" | "tdee";
  visible: boolean;
  onClose: () => void;
}) {
  const explanation = CALORIE_EXPLANATIONS[type];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.explanationPopupOverlay}>
        <TouchableOpacity
          style={styles.explanationPopupBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.explanationPopup}
        >
          <Text style={styles.explanationTitle}>{explanation.title}</Text>
          <Text style={styles.explanationDescription}>
            {explanation.description}
          </Text>
          <Text style={styles.explanationFormula}>{explanation.formula}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function Step5Review({
  goals,
  formData,
}: Step5ReviewProps) {
  const [activeExplanation, setActiveExplanation] = useState<
    "bmr" | "tdee" | null
  >(null);
  const lastExplanationType = useRef<"bmr" | "tdee">("bmr");

  const handleExplanationPress = (type: "bmr" | "tdee") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    lastExplanationType.current = type;
    setActiveExplanation(type);
  };

  if (!goals) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Unable to calculate goals. Please go back and fill in all required
          fields.
        </Text>
      </View>
    );
  }

  const activityInfo = getActivityLevelDescription(goals.activityLevel);
  const goalInfo = getGoalTypeDescription(goals.goalType);

  // Format height display
  const heightDisplay = formData.heightUseImperial
    ? `${formData.heightFeet}'${formData.heightInches}"`
    : `${goals.heightCm} cm`;

  // Format weight display
  const weightDisplay = formData.weightUseImperial
    ? `${formData.weightLbs} lbs`
    : `${goals.weightKg} kg`;

  // Get enabled other nutrients
  const enabledOtherNutrients = OTHER_NUTRIENTS.filter(
    (n) => goals.manualTargets?.[n.key] !== undefined,
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Personalized Targets</Text>
      <Text style={styles.subtitle}>
        Here's your daily nutrition plan based on your inputs
      </Text>


      {/* Main calorie target */}
      <View style={styles.mainTargetCard}>
        <View style={styles.mainTargetHeader}>
          <FontAwesomeIcon icon={icons.fire} size={28} color={Tokens.macroKcal} />
          <Text style={styles.mainTargetValue}>{goals.targetKcal}</Text>
          <Text style={styles.mainTargetUnit}>cal/day</Text>
        </View>
        <View style={styles.calculationBreakdown}>
          <View style={styles.breakdownItem}>
            <TouchableOpacity
              style={styles.breakdownLabelRow}
              onPress={() => handleExplanationPress("bmr")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.breakdownLabel}>BMR</Text>
              <Ionicons
                name="information-circle-outline"
                size={12}
                color="#FF8A65"
                style={styles.breakdownInfoIcon}
              />
            </TouchableOpacity>
            <Text style={styles.breakdownValue}>{goals.bmr}</Text>
          </View>
          <FontAwesomeIcon icon={icons.arrowRight} size={14} color={Tokens.macroKcal} />
          <View style={styles.breakdownItem}>
            <TouchableOpacity
              style={styles.breakdownLabelRow}
              onPress={() => handleExplanationPress("tdee")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.breakdownLabel}>TDEE</Text>
              <Ionicons
                name="information-circle-outline"
                size={12}
                color="#FF8A65"
                style={styles.breakdownInfoIcon}
              />
            </TouchableOpacity>
            <Text style={styles.breakdownValue}>{goals.tdee}</Text>
          </View>
          <FontAwesomeIcon icon={icons.arrowRight} size={14} color={Tokens.macroKcal} />
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Target</Text>
            <Text style={styles.breakdownValue}>
              {goals.targetKcal}
            </Text>
          </View>
        </View>
      </View>

      {/* Macro targets */}
      <View style={styles.macrosCard}>
        <View style={styles.macrosGrid}>
          <View style={[styles.macroItem, { backgroundColor: "#E3F2FD" }]}>
            <FontAwesomeIcon
              icon={icons.drumstickBite}
              size={20}
              color={Tokens.macroProtein}
            />
            <Text style={[styles.macroValue, { color: Tokens.macroProtein }]}>{goals.targetProtein}g</Text>
            <Text style={[styles.macroLabel, { color: "#7AB3E8" }]}>Protein</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: "#FFF8E7" }]}>
            <FontAwesomeIcon icon={icons.droplet} size={20} color={Tokens.macroFat} />
            <Text style={[styles.macroValue, { color: Tokens.macroFat }]}>{goals.targetFat}g</Text>
            <Text style={[styles.macroLabel, { color: "#F7BE5E" }]}>Fat</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: "#F3E5F5" }]}>
            <FontAwesomeIcon icon={icons.wheatAwn} size={20} color={Tokens.macroCarbs} />
            <Text style={[styles.macroValue, { color: Tokens.macroCarbs }]}>{goals.targetCarbs}g</Text>
            <Text style={[styles.macroLabel, { color: "#B68FB9" }]}>Carbs</Text>
          </View>
        </View>
      </View>

      {/* Other nutrients (if any enabled) */}
      {enabledOtherNutrients.length > 0 && (
        <View style={styles.otherNutrientsCard}>
          <Text style={styles.sectionTitle}>Other Nutrients</Text>
          <View style={styles.otherNutrientsGrid}>
            {enabledOtherNutrients.map((nutrient) => {
              const value = goals.manualTargets?.[nutrient.key];
              return (
                <View key={nutrient.key} style={styles.otherNutrientItem}>
                  <FontAwesomeIcon
                    icon={nutrient.icon}
                    size={16}
                    color={nutrient.color}
                  />
                  <Text style={styles.otherNutrientLabel}>
                    {nutrient.label}
                  </Text>
                  <Text style={styles.otherNutrientValue}>
                    {value}
                    <Text style={styles.otherNutrientUnit}>
                      {" "}
                      {nutrient.unit}
                    </Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Summary of inputs */}
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Your Profile</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Sex</Text>
            <Text style={styles.summaryValue}>
              {goals.sex === "male" ? "Male" : "Female"}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Age</Text>
            <Text style={styles.summaryValue}>{goals.age} years</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Height</Text>
            <Text style={styles.summaryValue}>{heightDisplay}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Weight</Text>
            <Text style={styles.summaryValue}>{weightDisplay}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Activity</Text>
            <Text style={styles.summaryValue}>{activityInfo.title}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Goal</Text>
            <Text style={styles.summaryValue}>{goalInfo.title}</Text>
          </View>
        </View>
      </View>

      {/* Weight target info (when set) */}
      {goals.targetWeightKg != null &&
        goals.timelineWeeks != null &&
        (() => {
          const useImperial = formData.weightUseImperial;
          const currentDisplay = useImperial
            ? `${formData.weightLbs} lbs`
            : `${goals.weightKg} kg`;
          const targetDisplay = useImperial
            ? `${Math.round(kgToLbs(goals.targetWeightKg))} lbs`
            : `${goals.targetWeightKg} kg`;

          return (
            <View style={styles.weightTargetCard}>
              <Text style={styles.sectionTitle}>Weight Target</Text>
              <View style={styles.weightTargetRow}>
                <View style={styles.weightTargetItem}>
                  <Text style={styles.weightTargetLabel}>Current</Text>
                  <Text style={styles.weightTargetValue}>{currentDisplay}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={Tokens.textTertiary} />
                <View style={styles.weightTargetItem}>
                  <Text style={styles.weightTargetLabel}>Target</Text>
                  <Text style={styles.weightTargetValue}>
                    {targetDisplay}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}


      {/* BMR/TDEE explanation popup */}
      <CalorieExplanationPopup
        type={lastExplanationType.current}
        visible={activeExplanation !== null}
        onClose={() => setActiveExplanation(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontSize: Tokens.fontSize.title,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: Tokens.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: Tokens.error,
    textAlign: "center",
    padding: 20,
  },
  mainTargetCard: {
    backgroundColor: "#FFE5D9",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    ...Tokens.shadowLight,
  },
  mainTargetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
  },
  mainTargetValue: {
    fontSize: 48,
    fontWeight: "700",
    color: Tokens.macroKcal,
    letterSpacing: -1,
  },
  mainTargetUnit: {
    fontSize: 16,
    color: "#FF8A65",
    fontWeight: "500",
  },
  calculationBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  breakdownItem: {
    alignItems: "center",
    minWidth: 52,
  },
  breakdownLabel: {
    fontSize: 11,
    color: "#FF8A65",
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF8A65",
  },
  breakdownLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownInfoIcon: {
    marginLeft: 2,
  },
  macrosCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  macrosGrid: {
    flexDirection: "row",
    gap: 8,
  },
  macroItem: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    ...Tokens.shadowLight,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Tokens.textPrimary,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  macroLabel: {
    fontSize: Tokens.fontSize.sm,
    fontWeight: "500",
    color: Tokens.textSecondary,
    marginTop: 2,
  },
  otherNutrientsCard: {
    marginBottom: 16,
  },
  otherNutrientsGrid: {
    gap: 8,
  },
  otherNutrientItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.surfaceRaised,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
  },
  otherNutrientLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  otherNutrientValue: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.accent,
  },
  otherNutrientUnit: {
    fontSize: Tokens.fontSize.sm,
    fontWeight: "500",
    color: Tokens.textSecondary,
  },
  summaryCard: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  summaryItem: {
    width: "50%",
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: Tokens.fontSize.sm,
    color: Tokens.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  weightTargetCard: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  weightTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  weightTargetItem: {
    alignItems: "center",
  },
  weightTargetLabel: {
    fontSize: Tokens.fontSize.sm,
    color: Tokens.textSecondary,
    marginBottom: 4,
  },
  weightTargetValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  explanationPopupOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  explanationPopupBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  explanationPopup: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    maxWidth: 320,
    ...Tokens.shadowMedium,
  },
  explanationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  explanationDescription: {
    fontSize: 14,
    color: Tokens.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  explanationFormula: {
    fontSize: 13,
    color: Tokens.textTertiary,
    fontStyle: "italic",
  },
});
