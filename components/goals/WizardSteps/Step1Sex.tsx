import { StepSex as OnboardingStepSex } from "@/components/onboarding/steps/StepSex";
import { Tokens } from "@/constants/theme";
import { Sex } from "@/types";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Step1SexProps {
  value: Sex | null;
  onSelect: (sex: Sex) => void;
}

export function Step1Sex({ value, onSelect }: Step1SexProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose your gender</Text>
      <Text style={styles.subtitle}>Used to estimate calories</Text>
      <View style={styles.body}>
        <OnboardingStepSex value={value} onChange={onSelect} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
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
  body: { paddingTop: 4 },
});
