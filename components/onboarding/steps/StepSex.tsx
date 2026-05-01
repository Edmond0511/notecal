import { Sex } from '@/types';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { OptionCard } from '../OptionCard';

interface Props {
  value: Sex | null;
  onChange: (v: Sex) => void;
}

export function StepSex({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <OptionCard
        title="Female"
        selected={value === 'female'}
        onPress={() => onChange('female')}
      />
      <OptionCard
        title="Male"
        selected={value === 'male'}
        onPress={() => onChange('male')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
});
