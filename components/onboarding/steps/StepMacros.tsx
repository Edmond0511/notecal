import { Tokens } from '@/constants/theme';
import { CarbPreference, ProteinPreference } from '@/types';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  proteinPreference: ProteinPreference;
  carbPreference: CarbPreference;
  onProteinChange: (v: ProteinPreference) => void;
  onCarbChange: (v: CarbPreference) => void;
}

const proteinOptions: {
  value: ProteinPreference;
  label: string;
  description: string;
}[] = [
  { value: 'low', label: 'Lower', description: 'Lower protein (1.2g/kg body weight)' },
  { value: 'standard', label: 'Standard', description: 'Balanced protein intake (1.6–2.0g/kg)' },
  { value: 'high', label: 'Higher', description: 'Extra protein for muscle (2.0–2.2g/kg)' },
];

const carbOptions: {
  value: CarbPreference;
  label: string;
  description: string;
}[] = [
  { value: 'low', label: 'Low Carb', description: 'Low carb, higher fat approach' },
  { value: 'standard', label: 'Standard', description: 'Balanced macro split' },
  { value: 'high', label: 'High Carb', description: 'High carb for fuel, lower fat' },
];

export function StepMacros({
  proteinPreference,
  carbPreference,
  onProteinChange,
  onCarbChange,
}: Props) {
  const selectProtein = (v: ProteinPreference) => {
    Haptics.selectionAsync();
    onProteinChange(v);
  };
  const selectCarb = (v: CarbPreference) => {
    Haptics.selectionAsync();
    onCarbChange(v);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Protein</Text>
        <View style={styles.optionsRow}>
          {proteinOptions.map((opt) => {
            const isSelected = proteinPreference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                onPress={() => selectProtein(opt.value)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Protein ${opt.label}`}
              >
                <Text
                  style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.description}>
          {proteinOptions.find((o) => o.value === proteinPreference)?.description}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Carbs</Text>
        <View style={styles.optionsRow}>
          {carbOptions.map((opt) => {
            const isSelected = carbPreference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                onPress={() => selectCarb(opt.value)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Carbs ${opt.label}`}
              >
                <Text
                  style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.description}>
          {carbOptions.find((o) => o.value === carbPreference)?.description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24 },
  card: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'IBMPlexSans_700Bold',
    fontSize: 15,
    color: '#6B6B6B',
    letterSpacing: -0.1,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: Tokens.surface,
    borderRadius: 12,
    alignItems: 'center',
  },
  optionButtonSelected: {
    backgroundColor: Tokens.accentTint,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Tokens.textSecondary,
  },
  optionLabelSelected: {
    color: Tokens.accent,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    color: Tokens.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
