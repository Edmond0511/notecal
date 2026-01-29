import { CarbPreference, ProteinPreference } from '@/types';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Step4MacrosProps {
  proteinPreference: ProteinPreference;
  carbPreference: CarbPreference;
  onProteinChange: (pref: ProteinPreference) => void;
  onCarbChange: (pref: CarbPreference) => void;
}

const proteinOptions: { value: ProteinPreference; label: string; description: string }[] = [
  { value: 'low', label: 'Lower', description: 'Minimal focus on protein' },
  { value: 'standard', label: 'Standard', description: 'Balanced protein intake' },
  { value: 'high', label: 'Higher', description: 'Extra protein for muscle' },
];

const carbOptions: { value: CarbPreference; label: string; description: string }[] = [
  { value: 'low', label: 'Low Carb', description: 'Keto-friendly approach' },
  { value: 'standard', label: 'Standard', description: 'Balanced carb intake' },
  { value: 'high', label: 'High Carb', description: 'For active lifestyles' },
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

      {/* Protein preference */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Protein Level</Text>
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
          {proteinOptions.find((o) => o.value === proteinPreference)?.description}
        </Text>
      </View>

      {/* Carb preference */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Carb Level</Text>
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

      {/* Info note */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          These preferences adjust your macro percentages. You can always change them later in Settings.
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
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  sectionContainer: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  optionLabelSelected: {
    color: '#2E7D32',
  },
  optionDescription: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#FFF8E1',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#F57F17',
    textAlign: 'center',
    lineHeight: 18,
  },
});
