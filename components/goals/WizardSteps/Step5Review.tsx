import { UserGoals } from "@/types";
import {
  getActivityLevelDescription,
  getGoalTypeDescription,
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
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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

interface Step5ReviewProps {
  goals: UserGoals | null;
  formData: WizardFormData;
  existingGoals?: UserGoals | null;
  onResetManualTargets?: () => void;
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

export function Step5Review({ goals, formData, existingGoals, onResetManualTargets }: Step5ReviewProps) {
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
      modifications.push({ label: "Calories", calculated: goals.targetKcal, manual: manualTargets.kcal, unit: "kcal" });
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

  const handleResetToCalculated = () => {
    onResetManualTargets?.();
  };

  // Format height display
  const heightDisplay = formData.useImperial
    ? `${formData.heightFeet}'${formData.heightInches}"`
    : `${goals.heightCm} cm`;

  // Format weight display
  const weightDisplay = formData.useImperial
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

      {/* Manual modifications notice */}
      {hasModifications && (
        <View style={styles.modificationNotice}>
          <View style={styles.modificationHeader}>
            <Ionicons name="information-circle" size={20} color="#1A6872" />
            <Text style={styles.modificationTitle}>Custom Targets Active</Text>
          </View>
          <Text style={styles.modificationDescription}>
            You have manually adjusted some values. The calculated values based on your profile are:
          </Text>
          <View style={styles.modificationList}>
            {modifications.map((mod, index) => (
              <View key={mod.label} style={styles.modificationItem}>
                <Text style={styles.modificationLabel}>{mod.label}:</Text>
                <Text style={styles.modificationValues}>
                  <Text style={styles.calculatedValue}>{mod.calculated}{mod.unit}</Text>
                  <Text style={styles.modificationArrow}> → </Text>
                  <Text style={styles.manualValue}>{mod.manual}{mod.unit}</Text>
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.resetToCalculatedButton}
            onPress={handleResetToCalculated}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={16} color="#1A6872" />
            <Text style={styles.resetToCalculatedText}>Reset to Calculated Values</Text>
          </TouchableOpacity>
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
            <Text style={styles.breakdownLabel}>BMR</Text>
            <Text style={styles.breakdownValue}>{goals.bmr}</Text>
          </View>
          <FontAwesomeIcon icon={icons.arrowRight} size={14} color="#ccc" />
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>TDEE</Text>
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

      {/* Goal expectation */}
      <View style={styles.expectationBox}>
        <FontAwesomeIcon icon={icons.arrowTrendUp} size={20} color="#1A6872" />
        <Text style={styles.expectationText}>
          Expected: {goalInfo.weeklyChange}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
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
    fontWeight: "600",
    color: "#666",
  },
  breakdownValueHighlight: {
    color: "#FF6B35",
  },
  macrosCard: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontWeight: "600",
    color: "#1A6872",
  },
  modificationNotice: {
    backgroundColor: "#E0F2F1",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  modificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  modificationTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A6872",
  },
  modificationDescription: {
    fontSize: 13,
    color: "#2A8A8A",
    lineHeight: 18,
    marginBottom: 12,
  },
  modificationList: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  modificationItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  modificationLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1A6872",
  },
  modificationValues: {
    fontSize: 13,
  },
  calculatedValue: {
    color: "#6B9E9E",
    textDecorationLine: "line-through",
  },
  modificationArrow: {
    color: "#1A6872",
  },
  manualValue: {
    color: "#1A6872",
    fontWeight: "600",
  },
  resetToCalculatedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#B2DFDB",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  resetToCalculatedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A6872",
  },
});
