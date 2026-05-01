import { ActivityLevel } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { OptionCard } from '../OptionCard';

interface Props {
  value: ActivityLevel | null;
  onChange: (v: ActivityLevel) => void;
}

const OPTIONS: {
  value: ActivityLevel;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'sedentary', title: 'Sedentary', subtitle: 'Desk job, mostly sitting', iconName: 'bed-outline' },
  { value: 'light', title: 'Lightly active', subtitle: '1–3 light workouts a week', iconName: 'walk-outline' },
  { value: 'moderate', title: 'Moderately active', subtitle: '3–5 workouts a week', iconName: 'bicycle-outline' },
  { value: 'active', title: 'Very active', subtitle: '6+ workouts or physical job', iconName: 'barbell-outline' },
  { value: 'extra_active', title: 'Extra active', subtitle: 'Athletic training daily', iconName: 'flame-outline' },
];

export function StepActivity({ value, onChange }: Props) {
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
