import { Tokens } from '@/constants/theme';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { GoalType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Step3GoalProps {
  selectedGoal: GoalType | null;
  onSelect: (goal: GoalType) => void;
}

const OPTIONS: {
  value: GoalType;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'lose', title: 'Lose Weight', subtitle: 'Calorie deficit to lose weight', iconName: 'trending-down' },
  { value: 'maintain', title: 'Maintain', subtitle: 'Keep current weight', iconName: 'remove-outline' },
  { value: 'gain', title: 'Gain Weight', subtitle: 'Calorie surplus to build muscle', iconName: 'trending-up' },
];

export function Step3Goal({ selectedGoal, onSelect }: Step3GoalProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>What&apos;s your goal?</Text>
      <Text style={styles.subtitle}>We&apos;ll set a sustainable deficit/surplus</Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            title={opt.title}
            subtitle={opt.subtitle}
            iconName={opt.iconName}
            selected={selectedGoal === opt.value}
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
