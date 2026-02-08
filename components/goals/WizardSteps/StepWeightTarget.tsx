import { calculateGoalAdjustment, kgToLbs, lbsToKg } from "@/utils/goalsCalculator";
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

  // Current weight in kg
  const currentWeightKg = useImperial
    ? lbsToKg(parseFloat(formData.weightLbs) || 0)
    : parseFloat(formData.weightKg) || 0;

  // Current weight display
  const currentWeightDisplay = useImperial
    ? `${formData.weightLbs}`
    : `${formData.weightKg}`;

  const weightUnit = useImperial ? "lbs" : "kg";

  // Target weight in kg
  const targetWeightKg = useImperial
    ? lbsToKg(parseFloat(formData.targetWeightLbs) || 0)
    : parseFloat(formData.targetWeightKg) || 0;

  const timelineMonths = parseInt(formData.timelineMonths, 10) || 0;
  const timelineWeeks = Math.round(timelineMonths * WEEKS_PER_MONTH);

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

    const weeklyChangeKg =
      (targetWeightKg - currentWeightKg) / timelineWeeks;
    const weeklyChangeLbs = kgToLbs(Math.abs(weeklyChangeKg));
    const dailyAdjustment = calculateGoalAdjustment(
      currentWeightKg,
      targetWeightKg,
      timelineWeeks
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

    // Weekly rate display
    const weeklyDisplay = useImperial
      ? `~${weeklyChangeLbs.toFixed(1)} lb/wk`
      : `~${Math.abs(weeklyChangeKg).toFixed(1)} kg/wk`;

    return {
      weeklyChangeKg: Math.abs(weeklyChangeKg),
      weeklyChangeLbs,
      weeklyDisplay,
      dailyAdjustment,
      targetDate: dateStr,
      wrongDirection,
      aggressiveLoss,
      aggressiveGain,
    };
  }, [targetWeightKg, timelineWeeks, currentWeightKg, formData.goalType]);

  const goalColor = isLosing ? "#FB8C00" : "#1E88E5";

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
            <Ionicons name="arrow-forward" size={14} color="#ccc" />
          </View>

          {/* Target weight (editable) */}
          <View style={styles.weightColumn}>
            <Text style={styles.fieldLabel}>Target</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
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
                placeholder={isLosing ? (useImperial ? "140" : "60") : (useImperial ? "180" : "80")}
                placeholderTextColor="#bbb"
                maxLength={5}
              />
              <Text style={styles.inputUnit}>{weightUnit}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Timeline card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Timeline</Text>

        <View style={styles.fieldContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={formData.timelineMonths}
              onChangeText={(text) =>
                updateFormData({ timelineMonths: text.replace(/[^0-9]/g, "") })
              }
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor="#bbb"
              maxLength={2}
            />
            <Text style={styles.inputUnit}>months</Text>
          </View>
          {calcInfo && !calcInfo.wrongDirection && (
            <Text style={styles.helperText}>
              Target date: {calcInfo.targetDate}
            </Text>
          )}
        </View>
      </View>

      {/* Calculated summary — matches Step5Review's weightTargetCard pattern */}
      {calcInfo && !calcInfo.wrongDirection && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your Plan</Text>

          <View style={styles.planRow}>
            <View style={styles.planItem}>
              <Text style={styles.planLabel}>Weekly rate</Text>
              <Text style={styles.planValue}>{calcInfo.weeklyDisplay}</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color="#ccc" />
            <View style={styles.planItem}>
              <Text style={styles.planLabel}>Daily adjustment</Text>
              <Text style={[styles.planValue, { color: goalColor }]}>
                {calcInfo.dailyAdjustment > 0 ? "+" : ""}
                {calcInfo.dailyAdjustment} cal
              </Text>
            </View>
          </View>

          <View style={styles.planMeta}>
            <Text style={styles.planMetaText}>
              {timelineMonths} {timelineMonths === 1 ? "month" : "months"}  ·  {calcInfo.weeklyDisplay} {isLosing ? "loss" : "gain"}
            </Text>
          </View>
        </View>
      )}

      {/* Wrong direction warning */}
      {calcInfo?.wrongDirection && (
        <View style={styles.warningBox}>
          <Ionicons name="alert-circle" size={18} color="#C62828" />
          <Text style={styles.warningText}>
            {isLosing
              ? "Target weight should be less than your current weight for a weight loss goal."
              : "Target weight should be more than your current weight for a weight gain goal."}
          </Text>
        </View>
      )}

      {/* Aggressive rate caution */}
      {calcInfo &&
        !calcInfo.wrongDirection &&
        (calcInfo.aggressiveLoss || calcInfo.aggressiveGain) && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color="#1A6872" />
            <Text style={styles.infoText}>
              {calcInfo.aggressiveLoss
                ? "This rate exceeds ~0.9 kg/week (~2 lb/week). Consider a longer timeline for sustainable results."
                : "This rate exceeds ~0.45 kg/week (~1 lb/week). Consider a longer timeline to minimize fat gain."}
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
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  weightRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
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
    color: "#666",
    marginBottom: 8,
  },
  readOnlyInput: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "#eee",
    borderRadius: 16,
    paddingHorizontal: 16,
    gap: 4,
  },
  readOnlyValue: {
    fontSize: 18,
    fontWeight: "500",
    color: "#999",
  },
  readOnlyUnit: {
    fontSize: 14,
    color: "#999",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: "500",
    color: "#333",
  },
  inputUnit: {
    fontSize: 14,
    color: "#666",
    minWidth: 30,
  },
  helperText: {
    fontSize: 12,
    color: "#888",
    marginTop: 8,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 12,
  },
  planItem: {
    alignItems: "center",
  },
  planLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  planValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  planMeta: {
    alignItems: "center",
    backgroundColor: "#E0F2F1",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  planMetaText: {
    fontSize: 13,
    color: "#1A6872",
    fontWeight: "500",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 14,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#C62828",
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2F1",
    padding: 14,
    borderRadius: 16,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#1A6872",
    lineHeight: 18,
  },
});
