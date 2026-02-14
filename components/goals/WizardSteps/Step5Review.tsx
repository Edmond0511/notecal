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
  faArrowTrendUp,
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
import React, { useState, useRef } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { WizardFormData } from "../GoalsWizard";

// Cast icons to IconProp to fix type mismatch between FA packages
const icons = {
  fire: faFireFlameCurved as IconProp,
  arrowRight: faArrowRight as IconProp,
  arrowTrendUp: faArrowTrendUp as IconProp,
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
    formula: "Calculated using the Mifflin-St Jeor equation based on your age, sex, height, and weight.",
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
    color: "#8B6914",
    icon: icons.seedling,
  },
  {
    key: "sugar" as const,
    label: "Sugar",
    unit: "g",
    color: "#C45BAA",
    icon: icons.cubesStacked,
  },
  {
    key: "sodium" as const,
    label: "Sodium",
    unit: "mg",
    color: "#5B8CC4",
    icon: icons.tint,
  },
  {
    key: "potassium" as const,
    label: "Potassium",
    unit: "mg",
    color: "#6B8E5B",
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
          <View style={styles.explanationHeader}>
            <Ionicons name="information-circle" size={22} color="#1A6872" />
            <Text style={styles.explanationTitle}>{explanation.title}</Text>
          </View>
          <Text style={styles.explanationDescription}>{explanation.description}</Text>
          <View style={styles.explanationFormulaBox}>
            <Text style={styles.explanationFormula}>{explanation.formula}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function Step5Review({ goals, formData, existingGoals }: Step5ReviewProps) {
  const [activeExplanation, setActiveExplanation] = useState<"bmr" | "tdee" | null>(null);
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

  // Check for manual modifications
  const manualTargets = existingGoals?.manualTargets;
  const modifications: Array<{ label: string; calculated: number; manual: number; unit: string }> = [];

  if (manualTargets) {
    if (manualTargets.kcal !== undefined && manualTargets.kcal !== goals.targetKcal) {
      modifications.push({ label: "Calories", calculated: goals.targetKcal, manual: manualTargets.kcal, unit: "cal" });
    }
    if (manualTargets.protein !== undefined && manualTargets.protein !== goals.targetProtein) {
      modifications.push({ label: "Protein", calculated: goals.targetProtein, manual: manualTargets.protein, unit: "g" });
    }
    if (manualTargets.fat !== undefined && manualTargets.fat !== goals.targetFat) {
      modifications.push({ label: "Fat", calculated: goals.targetFat, manual: manualTargets.fat, unit: "g" });
    }
    if (manualTargets.carbs !== undefined && manualTargets.carbs !== goals.targetCarbs) {
      modifications.push({ label: "Carbs", calculated: goals.targetCarbs, manual: manualTargets.carbs, unit: "g" });
    }
  }

  const hasModifications = modifications.length > 0;

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

      {/* Previous custom targets notice - informs user these will be replaced */}
      {hasModifications && (
        <View style={styles.modificationNotice}>
          <View style={styles.modificationHeader}>
            <View style={styles.modificationIconContainer}>
              <Ionicons name="swap-horizontal" size={16} color="#666" />
            </View>
            <Text style={styles.modificationTitle}>Custom targets will update</Text>
          </View>
          {modifications.map((mod, index) => {
            const iconConfig = {
              Calories: { icon: icons.fire, color: "#FF6B35" },
              Protein: { icon: icons.drumstickBite, color: "#4A90D9" },
              Fat: { icon: icons.droplet, color: "#F5A623" },
              Carbs: { icon: icons.wheatAwn, color: "#9B6B9E" },
            }[mod.label] || { icon: icons.fire, color: "#666" };

            return (
              <View
                key={mod.label}
                style={[
                  styles.modificationItem,
                  index < modifications.length - 1 && styles.modificationItemBorder
                ]}
              >
                <View style={styles.modificationLabelRow}>
                  <FontAwesomeIcon icon={iconConfig.icon} size={14} color={iconConfig.color} />
                  <Text style={styles.modificationLabel}>{mod.label}</Text>
                </View>
                <View style={styles.modificationValuesRow}>
                  <Text style={styles.oldValue}>{mod.manual}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#ccc" style={styles.modificationArrowIcon} />
                  <Text style={styles.newValue}>{mod.calculated}</Text>
                  <Text style={styles.modificationUnit}>{mod.unit}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Main calorie target */}
      <View style={styles.mainTargetCard}>
        <View style={styles.mainTargetHeader}>
          <FontAwesomeIcon icon={icons.fire} size={28} color="#FF6B35" />
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
              <Ionicons name="information-circle-outline" size={12} color="#aaa" style={styles.breakdownInfoIcon} />
            </TouchableOpacity>
            <Text style={styles.breakdownValue}>{goals.bmr}</Text>
          </View>
          <FontAwesomeIcon icon={icons.arrowRight} size={14} color="#ccc" />
          <View style={styles.breakdownItem}>
            <TouchableOpacity
              style={styles.breakdownLabelRow}
              onPress={() => handleExplanationPress("tdee")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.breakdownLabel}>TDEE</Text>
              <Ionicons name="information-circle-outline" size={12} color="#aaa" style={styles.breakdownInfoIcon} />
            </TouchableOpacity>
            <Text style={styles.breakdownValue}>{goals.tdee}</Text>
          </View>
          <FontAwesomeIcon icon={icons.arrowRight} size={14} color="#ccc" />
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Target</Text>
            <Text
              style={[styles.breakdownValue, styles.breakdownValueHighlight]}
            >
              {goals.targetKcal}
            </Text>
          </View>
        </View>
      </View>

      {/* Macro targets */}
      <View style={styles.macrosCard}>
        <Text style={styles.cardTitle}>Daily Macros</Text>
        <View style={styles.macrosGrid}>
          <View style={[styles.macroItem, { backgroundColor: "#E3F2FD" }]}>
            <FontAwesomeIcon
              icon={icons.drumstickBite}
              size={20}
              color="#4A90D9"
            />
            <Text style={styles.macroValue}>{goals.targetProtein}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: "#FFF8E7" }]}>
            <FontAwesomeIcon icon={icons.droplet} size={20} color="#F5A623" />
            <Text style={styles.macroValue}>{goals.targetFat}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: "#F3E5F5" }]}>
            <FontAwesomeIcon icon={icons.wheatAwn} size={20} color="#9B6B9E" />
            <Text style={styles.macroValue}>{goals.targetCarbs}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
        </View>
      </View>

      {/* Other nutrients (if any enabled) */}
      {enabledOtherNutrients.length > 0 && (
        <View style={styles.otherNutrientsCard}>
          <Text style={styles.cardTitle}>Other Nutrients</Text>
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
        <Text style={styles.cardTitle}>Your Profile</Text>
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
      {goals.targetWeightKg != null && goals.timelineWeeks != null && (
        (() => {
          const useImperial = formData.weightUseImperial;
          const currentDisplay = useImperial
            ? `${formData.weightLbs} lbs`
            : `${goals.weightKg} kg`;
          const targetDisplay = useImperial
            ? `${Math.round(kgToLbs(goals.targetWeightKg))} lbs`
            : `${goals.targetWeightKg} kg`;
          const isLosing = goals.goalType === 'lose';

          return (
            <View style={styles.weightTargetCard}>
              <Text style={styles.cardTitle}>Weight Target</Text>
              <View style={styles.weightTargetRow}>
                <View style={styles.weightTargetItem}>
                  <Text style={styles.weightTargetLabel}>Current</Text>
                  <Text style={styles.weightTargetValue}>{currentDisplay}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color="#ccc" />
                <View style={styles.weightTargetItem}>
                  <Text style={styles.weightTargetLabel}>Target</Text>
                  <Text style={[styles.weightTargetValue, { color: isLosing ? '#FB8C00' : '#1E88E5' }]}>
                    {targetDisplay}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()
      )}

      {/* Goal expectation */}
      <View style={styles.expectationBox}>
        <FontAwesomeIcon icon={icons.arrowTrendUp} size={20} color="#1A6872" />
        <Text style={styles.expectationText}>
          {goals.targetWeightKg != null && goals.timelineWeeks != null
            ? (() => {
                const diffKg = Math.abs(goals.weightKg - goals.targetWeightKg);
                const diffDisplay = formData.weightUseImperial
                  ? `${kgToLbs(diffKg)} lbs`
                  : `${Math.round(diffKg * 10) / 10} kg`;
                const months = Math.round(goals.timelineWeeks! / (52 / 12));
                return `${goals.goalType === 'lose' ? 'Lose' : 'Gain'} ${diffDisplay} in ${months} ${months === 1 ? 'month' : 'months'}`;
              })()
            : `Expected: ${goalInfo.weeklyChange}`}
        </Text>
      </View>

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
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: "#C62828",
    textAlign: "center",
    padding: 20,
  },
  mainTargetCard: {
    backgroundColor: "#FFE5D9",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  mainTargetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  mainTargetValue: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FF6B35",
  },
  mainTargetUnit: {
    fontSize: 16,
    color: "#FF8A65",
    fontWeight: "500",
  },
  calculationBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownItem: {
    alignItems: "center",
  },
  breakdownLabel: {
    fontSize: 11,
    color: "#888",
    marginBottom: 2,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  breakdownValueHighlight: {
    color: "#FF6B35",
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
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 12,
  },
  macrosGrid: {
    flexDirection: "row",
    gap: 8,
  },
  macroItem: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  macroValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginTop: 6,
  },
  macroLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  otherNutrientsCard: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  otherNutrientsGrid: {
    gap: 8,
  },
  otherNutrientItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
  },
  otherNutrientLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  otherNutrientValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A6872",
  },
  otherNutrientUnit: {
    fontSize: 12,
    fontWeight: "500",
    color: "#888",
  },
  summaryCard: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
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
    fontSize: 12,
    color: "#888",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  weightTargetCard: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  weightTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 12,
  },
  weightTargetItem: {
    alignItems: "center",
  },
  weightTargetLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  weightTargetValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  expectationBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0F2F1",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  expectationText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A6872",
  },
  modificationNotice: {
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
  modificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modificationIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  modificationTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    letterSpacing: -0.2,
  },
  modificationItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  modificationItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  modificationLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modificationLabel: {
    fontSize: 14,
    fontWeight: "400",
    color: "#666",
  },
  modificationValuesRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  oldValue: {
    fontSize: 14,
    color: "#aaa",
    textDecorationLine: "line-through",
  },
  modificationArrowIcon: {
    marginHorizontal: 6,
  },
  newValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  modificationUnit: {
    fontSize: 12,
    color: "#999",
    marginLeft: 2,
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
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  explanationPopup: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  explanationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  explanationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A6872",
    flex: 1,
  },
  explanationDescription: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    marginBottom: 12,
  },
  explanationFormulaBox: {
    backgroundColor: "#E0F2F1",
    borderRadius: 8,
    padding: 12,
  },
  explanationFormula: {
    fontSize: 13,
    color: "#1A6872",
    fontStyle: "italic",
  },
});
