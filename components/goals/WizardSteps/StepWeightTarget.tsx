import { Tokens } from "@/constants/theme";
import {
  calculateGoalAdjustment,
  kgToLbs,
} from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { WizardFormData } from "../GoalsWizard";

const WEEKS_PER_MONTH = 52 / 12;

interface StepWeightTargetProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
}

export function StepWeightTarget({
  formData,
  updateFormData,
}: StepWeightTargetProps) {
  const useImperial = formData.weightUseImperial;
  const isLosing = formData.goalType === "lose";

  // Current weight in kg (full precision for internal math)
  const currentWeightKg = useImperial
    ? (parseFloat(formData.weightLbs) || 0) * 0.453592
    : parseFloat(formData.weightKg) || 0;

  // Current weight display
  const currentWeightDisplay = useImperial
    ? `${formData.weightLbs}`
    : `${formData.weightKg}`;

  const weightUnit = useImperial ? "lbs" : "kg";

  // Target weight in kg (full precision for internal math)
  const targetWeightKg = useImperial
    ? (parseFloat(formData.targetWeightLbs) || 0) * 0.453592
    : parseFloat(formData.targetWeightKg) || 0;

  const timelineMonths = parseInt(formData.timelineMonths, 10) || 0;
  const timelineWeeks = timelineMonths * WEEKS_PER_MONTH;

  // Calculate info
  const calcInfo = useMemo(() => {
    if (
      !targetWeightKg ||
      !timelineWeeks ||
      timelineWeeks <= 0 ||
      !currentWeightKg
    ) {
      return null;
    }

    const weeklyChangeKg = (targetWeightKg - currentWeightKg) / timelineWeeks;
    // Compute imperial rate directly from lbs to avoid double-rounding
    const weeklyChangeLbs = useImperial
      ? Math.abs((parseFloat(formData.targetWeightLbs) || 0) - (parseFloat(formData.weightLbs) || 0)) / timelineWeeks
      : kgToLbs(Math.abs(weeklyChangeKg));
    const dailyAdjustment = calculateGoalAdjustment(
      currentWeightKg,
      targetWeightKg,
      timelineWeeks,
    );

    const isGaining = formData.goalType === "gain";
    const absWeeklyKg = Math.abs(weeklyChangeKg);

    // Direction validation
    const wrongDirection =
      (isLosing && targetWeightKg >= currentWeightKg) ||
      (isGaining && targetWeightKg <= currentWeightKg);

    // Rate warnings
    const aggressiveLoss = isLosing && absWeeklyKg > 0.9;
    const aggressiveGain = isGaining && absWeeklyKg > 0.45;

    // Estimated target date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + timelineWeeks * 7);
    const dateStr = targetDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // Weekly rate display (split into number + unit for styling)
    const weeklyDisplayNum = useImperial
      ? weeklyChangeLbs.toFixed(1)
      : Math.abs(weeklyChangeKg).toFixed(1);
    const weeklyDisplayUnit = useImperial ? " lbs" : " kg";

    // Extreme adjustment: beyond the old clamp bounds
    const extremeAdjustment = dailyAdjustment < -1000 || dailyAdjustment > 500;

    return {
      weeklyChangeKg: Math.abs(weeklyChangeKg),
      weeklyChangeLbs,
      weeklyDisplayNum,
      weeklyDisplayUnit,
      dailyAdjustment,
      targetDate: dateStr,
      wrongDirection,
      aggressiveLoss,
      aggressiveGain,
      extremeAdjustment,
    };
  }, [targetWeightKg, timelineWeeks, currentWeightKg, formData.goalType]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weight Target</Text>
      <Text style={styles.subtitle}>
        Set your target weight and timeline to personalize your calorie plan
      </Text>

      {/* Weight card — current + target side by side */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Weight</Text>

        <View style={styles.weightRow}>
          {/* Current weight (read-only) */}
          <View style={styles.weightColumn}>
            <Text style={styles.fieldLabel}>Current</Text>
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyValue}>{currentWeightDisplay}</Text>
              <Text style={styles.readOnlyUnit}>{weightUnit}</Text>
            </View>
          </View>

          <View style={styles.arrowContainer}>
            <Ionicons name="arrow-forward" size={14} color={Tokens.textTertiary} />
          </View>

          {/* Target weight (editable) */}
          <View style={styles.weightColumn}>
            <Text style={styles.fieldLabel}>Target</Text>
            <View style={styles.targetInput}>
              <TextInput
                style={styles.targetTextInput}
                value={
                  useImperial
                    ? formData.targetWeightLbs
                    : formData.targetWeightKg
                }
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9.]/g, "");
                  if (useImperial) {
                    updateFormData({ targetWeightLbs: cleaned });
                  } else {
                    updateFormData({ targetWeightKg: cleaned });
                  }
                }}
                keyboardType="decimal-pad"
                placeholder={
                  isLosing
                    ? useImperial
                      ? "140"
                      : "60"
                    : useImperial
                      ? "180"
                      : "80"
                }
                placeholderTextColor={Tokens.textTertiary}
                maxLength={5}
              />
              <Text style={styles.targetUnit}>{weightUnit}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Timeline card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Timeline</Text>

        <View style={styles.fieldContainer}>
          <View style={styles.timelineRow}>
            <View style={styles.timelineInput}>
              <TextInput
                style={styles.timelineTextInput}
                value={formData.timelineMonths}
                onChangeText={(text) =>
                  updateFormData({
                    timelineMonths: text.replace(/[^0-9]/g, ""),
                  })
                }
                keyboardType="number-pad"
                placeholder="3"
                placeholderTextColor={Tokens.textTertiary}
                maxLength={2}
              />
              <Text style={styles.timelineUnit}>months</Text>
            </View>
          </View>
          {calcInfo && !calcInfo.wrongDirection && (
            <Text style={styles.helperText}>
              Target date: {calcInfo.targetDate}
            </Text>
          )}
        </View>
      </View>

      {/* Calculated summary */}
      {calcInfo && !calcInfo.wrongDirection && (
        <View style={styles.planCard}>
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Weekly rate</Text>
            <Text style={styles.planValue}>
              {calcInfo.weeklyDisplayNum}
              <Text style={styles.planUnit}>{calcInfo.weeklyDisplayUnit}/week</Text>
            </Text>
          </View>

          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Daily adjustment</Text>
            <Text style={styles.planValue}>
              {calcInfo.dailyAdjustment > 0 ? "+" : ""}
              {calcInfo.dailyAdjustment}
              <Text style={styles.planUnit}> cal</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Wrong direction warning */}
      {calcInfo?.wrongDirection && (
        <View style={styles.warningBox}>
          <Ionicons name="alert-circle" size={18} color={Tokens.error} />
          <Text style={styles.warningText}>
            {isLosing
              ? "Target weight should be less than your current weight for a weight loss goal."
              : "Target weight should be more than your current weight for a weight gain goal."}
          </Text>
        </View>
      )}

      {/* Extreme daily adjustment warning */}
      {calcInfo && !calcInfo.wrongDirection && calcInfo.extremeAdjustment && (
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={18} color={Tokens.error} />
          <Text style={styles.warningText}>
            This is an aggressive daily
            {calcInfo.dailyAdjustment < 0 ? " deficit" : " surplus"}. Consider
            extending your timeline for more sustainable results.
          </Text>
        </View>
      )}
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
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  planCard: {
    marginBottom: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  weightColumn: {
    flex: 1,
  },
  arrowContainer: {
    paddingBottom: 14,
  },
  fieldContainer: {},
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.textSecondary,
    marginBottom: 8,
  },
  readOnlyInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  readOnlyValue: {
    fontSize: 18,
    fontWeight: "500",
    color: Tokens.textTertiary,
  },
  readOnlyUnit: {
    fontSize: 14,
    color: Tokens.textTertiary,
  },
  targetInput: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  targetTextInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: Tokens.textPrimary,
    height: 48,
    padding: 0,
  },
  targetUnit: {
    fontSize: 14,
    color: Tokens.textTertiary,
  },
  timelineRow: {
    flexDirection: "row",
  },
  timelineInput: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 4,
    flex: 1,
  },
  timelineTextInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: Tokens.textPrimary,
    height: 48,
    padding: 0,
  },
  timelineUnit: {
    fontSize: 14,
    color: Tokens.textTertiary,
  },
  helperText: {
    fontSize: Tokens.fontSize.sm,
    color: Tokens.textSecondary,
    marginTop: 8,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  planValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
  planUnit: {
    fontSize: 13,
    fontWeight: "400",
    color: Tokens.textTertiary,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.errorTint,
    padding: 14,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Tokens.error,
    lineHeight: 18,
  },
});
