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
import { StyleSheet, Text, View } from "react-native";
import { CalculationBreakdown } from "./CalculationBreakdown";

const icons = {
  fire: faFireFlameCurved as IconProp,
  drumstickBite: faDrumstickBite as IconProp,
  droplet: faDroplet as IconProp,
  wheatAwn: faWheatAwn as IconProp,
  seedling: faSeedling as IconProp,
  cubesStacked: faCubesStacked as IconProp,
  tint: faTint as IconProp,
  bolt: faBolt as IconProp,
};

const OTHER_NUTRIENTS = [
  { key: "fiber" as const, label: "Fiber", unit: "g", color: "#B08C5A", icon: icons.seedling },
  { key: "sugar" as const, label: "Sugar", unit: "g", color: "#D4687E", icon: icons.cubesStacked },
  { key: "sodium" as const, label: "Sodium", unit: "mg", color: "#6898BE", icon: icons.tint },
  { key: "potassium" as const, label: "Potassium", unit: "mg", color: "#72A868", icon: icons.bolt },
];

interface ReviewSummaryProps {
  goals: UserGoals;
  heightDisplay: string;
  weightDisplay: string;
  useImperial: boolean;
}

export function ReviewSummary({
  goals,
  heightDisplay,
  weightDisplay,
  useImperial,
}: ReviewSummaryProps) {
  const activityInfo = getActivityLevelDescription(goals.activityLevel);
  const goalInfo = getGoalTypeDescription(goals.goalType);

  const enabledOtherNutrients = OTHER_NUTRIENTS.filter(
    (n) => goals.manualTargets?.[n.key] !== undefined,
  );

  return (
    <View>
      {/* Main calorie target */}
      <View style={styles.mainTargetCard}>
        <View style={styles.mainTargetHeader}>
          <FontAwesomeIcon icon={icons.fire} size={28} color={Tokens.macroKcal} />
          <Text style={styles.mainTargetValue}>{goals.targetKcal}</Text>
        </View>
        <Text style={styles.mainTargetLabel}>Calories</Text>
      </View>

      {/* Macro tiles */}
      <View style={styles.macrosCard}>
        <View style={styles.macrosGrid}>
          <View style={[styles.macroItem, { backgroundColor: "#E3F2FD" }]}>
            <FontAwesomeIcon icon={icons.drumstickBite} size={20} color={Tokens.macroProtein} />
            <Text style={[styles.macroValue, { color: Tokens.macroProtein }]}>
              {goals.targetProtein}g
            </Text>
            <Text style={[styles.macroLabel, { color: "#7AB3E8" }]}>Protein</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: "#FFF8E7" }]}>
            <FontAwesomeIcon icon={icons.droplet} size={20} color={Tokens.macroFat} />
            <Text style={[styles.macroValue, { color: Tokens.macroFat }]}>
              {goals.targetFat}g
            </Text>
            <Text style={[styles.macroLabel, { color: "#F7BE5E" }]}>Fat</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: "#F3E5F5" }]}>
            <FontAwesomeIcon icon={icons.wheatAwn} size={20} color={Tokens.macroCarbs} />
            <Text style={[styles.macroValue, { color: Tokens.macroCarbs }]}>
              {goals.targetCarbs}g
            </Text>
            <Text style={[styles.macroLabel, { color: "#B68FB9" }]}>Carbs</Text>
          </View>
        </View>
      </View>

      {/* Other nutrients (only when manual targets present) */}
      {enabledOtherNutrients.length > 0 && (
        <View style={styles.otherNutrientsCard}>
          <Text style={styles.sectionTitle}>Other Nutrients</Text>
          <View style={styles.otherNutrientsGrid}>
            {enabledOtherNutrients.map((nutrient) => {
              const value = goals.manualTargets?.[nutrient.key];
              return (
                <View key={nutrient.key} style={styles.otherNutrientItem}>
                  <FontAwesomeIcon icon={nutrient.icon} size={16} color={nutrient.color} />
                  <Text style={styles.otherNutrientLabel}>{nutrient.label}</Text>
                  <Text style={styles.otherNutrientValue}>
                    {value}
                    <Text style={styles.otherNutrientUnit}> {nutrient.unit}</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Calculation breakdown */}
      <CalculationBreakdown goals={goals} useImperial={useImperial} />

      {/* Profile summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Your Profile</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Sex</Text>
            <Text style={styles.summaryValue}>
              {goals.sex === "male" ? "Male" : goals.sex === "female" ? "Female" : "Other"}
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

      {/* Weight target (if set) */}
      {goals.targetWeightKg != null && goals.timelineWeeks != null && (
        <View style={styles.weightTargetCard}>
          <Text style={styles.sectionTitle}>Weight Target</Text>
          <View style={styles.weightTargetRow}>
            <View style={styles.weightTargetItem}>
              <Text style={styles.weightTargetLabel}>Current</Text>
              <Text style={styles.weightTargetValue}>{weightDisplay}</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={Tokens.textTertiary} />
            <View style={styles.weightTargetItem}>
              <Text style={styles.weightTargetLabel}>Target</Text>
              <Text style={styles.weightTargetValue}>
                {useImperial
                  ? `${Math.round(kgToLbs(goals.targetWeightKg))} lbs`
                  : `${Math.round(goals.targetWeightKg)} kg`}
              </Text>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  mainTargetCard: {
    backgroundColor: "#FFE5D9",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 36,
    marginBottom: 16,
    alignItems: "center",
    ...Tokens.shadowLight,
  },
  mainTargetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 12,
  },
  mainTargetValue: {
    fontSize: 48,
    fontWeight: "700",
    color: Tokens.macroKcal,
    letterSpacing: -1,
  },
  mainTargetLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF8A65",
    marginTop: 6,
  },
  macrosCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "IBMPlexSans_700Bold",
    fontSize: 15,
    color: "#6B6B6B",
    marginBottom: 12,
    letterSpacing: -0.1,
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
    marginBottom: 24,
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
    marginBottom: 24,
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
    marginBottom: 24,
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
});
