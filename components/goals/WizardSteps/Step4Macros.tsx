import { CarbPreference, ProteinPreference } from "@/types";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Cast icons to IconProp to fix type mismatch between FA packages

interface Step4MacrosProps {
  proteinPreference: ProteinPreference;
  carbPreference: CarbPreference;
  onProteinChange: (pref: ProteinPreference) => void;
  onCarbChange: (pref: CarbPreference) => void;
}

const proteinOptions: {
  value: ProteinPreference;
  label: string;
  description: string;
}[] = [
  {
    value: "low",
    label: "Lower",
    description: "Lower protein (1.2g/kg body weight)",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Balanced protein intake (1.6-2.0g/kg)",
  },
  {
    value: "high",
    label: "Higher",
    description: "Extra protein for muscle (2.0-2.2g/kg)",
  },
];

const carbOptions: {
  value: CarbPreference;
  label: string;
  description: string;
}[] = [
  {
    value: "low",
    label: "Low Carb",
    description: "Low carb, higher fat approach",
  },
  { value: "standard", label: "Standard", description: "Balanced macro split" },
  {
    value: "high",
    label: "High Carb",
    description: "High carb for fuel, lower fat",
  },
];

export function Step4Macros({
  proteinPreference,
  carbPreference,
  onProteinChange,
  onCarbChange,
}: Step4MacrosProps) {
  const handleProteinSelect = (pref: ProteinPreference) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onProteinChange(pref);
  };

  const handleCarbSelect = (pref: CarbPreference) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCarbChange(pref);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Macro Preferences</Text>
      <Text style={styles.subtitle}>
        Optional adjustments to customize your macronutrient split
      </Text>

      {/* Protein preference card */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Protein Level</Text>
        </View>
        <View style={styles.optionsRow}>
          {proteinOptions.map((option) => {
            const isSelected = proteinPreference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  isSelected && styles.optionButtonSelected,
                ]}
                onPress={() => handleProteinSelect(option.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.optionDescription}>
          {
            proteinOptions.find((o) => o.value === proteinPreference)
              ?.description
          }
        </Text>
      </View>

      {/* Carb preference card */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Carb Level</Text>
        </View>
        <View style={styles.optionsRow}>
          {carbOptions.map((option) => {
            const isSelected = carbPreference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  isSelected && styles.optionButtonSelected,
                ]}
                onPress={() => handleCarbSelect(option.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.optionDescription}>
          {carbOptions.find((o) => o.value === carbPreference)?.description}
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
    fontWeight: "600",
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  optionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionButtonSelected: {
    backgroundColor: "#E0F2F1",
    borderColor: "#1A6872",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  optionLabelSelected: {
    color: "#1A6872",
  },
  optionDescription: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
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
