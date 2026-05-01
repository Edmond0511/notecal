import { GoalType } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { OptionCard } from '../OptionCard';

interface Props {
  value: GoalType | null;
  onChange: (v: GoalType) => void;
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

export function StepGoal({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          title={opt.title}
          subtitle={opt.subtitle}
          iconName={opt.iconName}
          selected={value === opt.value}
          onPress={() => onChange(opt.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
});
