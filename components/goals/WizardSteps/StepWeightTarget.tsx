import { StepWeightTarget as OnboardingStepWeightTarget } from "@/components/onboarding/steps/StepWeightTarget";
import { Tokens } from "@/constants/theme";
import { GoalType } from "@/types";
import { calculateBMR, calculateTDEE, kgToLbs } from "@/utils/goalsCalculator";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
  const weightUnit: "metric" | "imperial" = useImperial ? "imperial" : "metric";

  const currentWeightKg = useImperial
    ? (parseFloat(formData.weightLbs) || 0) * 0.453592
    : parseFloat(formData.weightKg) || 0;

  const targetWeightKg = useImperial
    ? (parseFloat(formData.targetWeightLbs) || 0) * 0.453592
    : parseFloat(formData.targetWeightKg) || 0;

  const timelineMonths = parseInt(formData.timelineMonths, 10) || 0;
  const timelineWeeks =
    timelineMonths > 0 ? timelineMonths * WEEKS_PER_MONTH : null;

  // Goal must be lose|gain here (goals wizard only renders this step then)
  const goal = (formData.goalType ?? "lose") as Exclude<GoalType, "maintain">;

  const heightCm = formData.heightUseImperial
    ? ((parseFloat(formData.heightFeet) || 0) * 12 +
        (parseFloat(formData.heightInches) || 0)) *
      2.54
    : parseFloat(formData.heightCm) || 0;
  const age = parseInt(formData.age, 10) || 0;

  const tdee =
    formData.sex != null &&
    formData.activityLevel != null &&
    age > 0 &&
    heightCm > 0 &&
    currentWeightKg > 0
      ? calculateTDEE(
          calculateBMR(formData.sex, currentWeightKg, heightCm, age),
          formData.activityLevel,
        )
      : undefined;

  const handleTargetChange = (kg: number | null) => {
    if (kg == null) {
      updateFormData({ targetWeightKg: "", targetWeightLbs: "" });
      return;
    }
    if (useImperial) {
      updateFormData({ targetWeightLbs: Math.round(kgToLbs(kg)).toString() });
    } else {
      updateFormData({ targetWeightKg: Math.round(kg).toString() });
    }
  };

  const handleTimelineChange = (weeks: number | null) => {
    if (weeks == null) {
      updateFormData({ timelineMonths: "" });
      return;
    }
    const months = Math.max(1, Math.round(weeks / WEEKS_PER_MONTH));
    updateFormData({ timelineMonths: months.toString() });
  };

  if (!currentWeightKg) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pick your target weight</Text>
        <Text style={styles.subtitle}>And when you want to reach it</Text>
        <Text style={styles.helperText}>Set your current weight first.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your target {`\n`}weight</Text>
      <Text style={styles.subtitle}>And when you want to reach it</Text>

      <View style={styles.body}>
        <OnboardingStepWeightTarget
          goal={goal}
          currentWeightKg={currentWeightKg}
          weightUnit={weightUnit}
          targetWeightKg={targetWeightKg || null}
          timelineWeeks={timelineWeeks}
          onChangeTargetWeightKg={handleTargetChange}
          onChangeTimelineWeeks={handleTimelineChange}
          sex={formData.sex ?? undefined}
          tdee={tdee}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontFamily: "IBMPlexSans_700Bold",
    fontSize: 28,
    letterSpacing: -0.8,
    lineHeight: 32,
    color: Tokens.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "IBMPlexSans_400Regular",
    fontSize: 15,
    color: Tokens.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  body: {
    paddingTop: 8,
  },
  helperText: {
    fontSize: 14,
    color: Tokens.textSecondary,
  },
});
