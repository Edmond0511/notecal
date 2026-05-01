import { Tokens } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function StepAge({ value, onChange }: Props) {
  const handleChange = (text: string) => {
    if (text === '') return onChange(null);
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (Number.isNaN(n)) return onChange(null);
    onChange(n);
  };

  const handleBlur = () => {
    if (value == null) return;
    if (value < 13) onChange(13);
    else if (value > 100) onChange(100);
  };

  return (
    <View style={styles.card}>
      <TextInput
        value={value == null ? '' : String(value)}
        onChangeText={handleChange}
        onBlur={handleBlur}
        keyboardType="number-pad"
        autoFocus
        maxLength={3}
        style={styles.input}
        placeholder="0"
        placeholderTextColor={Tokens.textTertiary}
        accessibilityLabel="Age in years"
      />
      <Text style={styles.unit}>years</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
    paddingVertical: 28,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 10,
  },
  input: {
    fontFamily: 'IBMPlexSans_700Bold',
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -2,
    color: Tokens.textPrimary,
    minWidth: 120,
    textAlign: 'right',
    paddingVertical: 0,
  },
  unit: {
    fontSize: 18,
    fontWeight: '500',
    color: Tokens.textSecondary,
  },
});
