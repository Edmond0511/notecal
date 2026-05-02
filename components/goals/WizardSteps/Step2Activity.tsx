import { Tokens } from '@/constants/theme';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { ActivityLevel } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Step2ActivityProps {
  selectedActivity: ActivityLevel | null;
  onSelect: (level: ActivityLevel) => void;
}

const OPTIONS: {
  value: ActivityLevel;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'sedentary', title: 'Sedentary', subtitle: 'Desk job, mostly sitting', iconName: 'body-outline' },
  { value: 'light', title: 'Lightly active', subtitle: '1–3 light workouts a week', iconName: 'walk-outline' },
  { value: 'moderate', title: 'Moderately active', subtitle: '3–5 workouts a week', iconName: 'bicycle-outline' },
  { value: 'active', title: 'Very active', subtitle: '6+ workouts or physical job', iconName: 'fitness-outline' },
  { value: 'extra_active', title: 'Extra active', subtitle: 'Athletic training daily', iconName: 'barbell-outline' },
];

export function Step2Activity({ selectedActivity, onSelect }: Step2ActivityProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>How active are you?</Text>
      <Text style={styles.subtitle}>Helps us estimate your daily calorie burn</Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            title={opt.title}
            subtitle={opt.subtitle}
            iconName={opt.iconName}
            selected={selectedActivity === opt.value}
            onPress={() => onSelect(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontFamily: 'IBMPlexSans_700Bold',
    fontSize: 28,
    letterSpacing: -0.8,
    lineHeight: 32,
    color: Tokens.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'IBMPlexSans_400Regular',
    fontSize: 15,
    color: Tokens.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  options: {
    gap: 12,
  },
});
