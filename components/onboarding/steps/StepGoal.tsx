import { GoalType } from '@/types';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { OptionCard } from '../OptionCard';

interface Props {
  value: GoalType | null;
  onChange: (v: GoalType) => void;
}

const OPTIONS: { value: GoalType; title: string; subtitle: string }[] = [
  { value: 'lose', title: 'Lose weight', subtitle: 'About 0.5 kg / week' },
  { value: 'maintain', title: 'Maintain', subtitle: 'Stay where I am' },
  { value: 'gain', title: 'Gain weight', subtitle: 'About 0.25 kg / week' },
];

export function StepGoal({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          title={opt.title}
          subtitle={opt.subtitle}
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
