import { Tokens } from "@/constants/theme";
import { UserGoals } from "@/types";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ReviewSummary } from "../ReviewSummary";
import { WizardFormData } from "../GoalsWizard";

interface Step5ReviewProps {
  goals: UserGoals | null;
  formData: WizardFormData;
  existingGoals?: UserGoals | null;
}

export function Step5Review({ goals, formData }: Step5ReviewProps) {
  if (!goals) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your daily targets</Text>
        <Text style={styles.subtitle}>Computed using Mifflin-St Jeor</Text>
        <Text style={styles.errorText}>
          Unable to calculate goals. Please go back and fill in all required fields.
        </Text>
      </View>
    );
  }

  const heightDisplay = formData.heightUseImperial
    ? `${formData.heightFeet}'${formData.heightInches}"`
    : `${goals.heightCm} cm`;

  const weightDisplay = formData.weightUseImperial
    ? `${formData.weightLbs} lbs`
    : `${goals.weightKg} kg`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your daily targets</Text>
      <Text style={styles.subtitle}>Computed using Mifflin-St Jeor</Text>
      <ReviewSummary
        goals={goals}
        heightDisplay={heightDisplay}
        weightDisplay={weightDisplay}
        useImperial={formData.weightUseImperial}
      />
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
    marginBottom: 24,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: Tokens.error,
    textAlign: "center",
    padding: 20,
  },
});
