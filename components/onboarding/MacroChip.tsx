import { Tokens } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  color: string;
  label: string;
}

export function MacroChip({ color, label }: Props) {
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Tokens.textPrimary,
    letterSpacing: -0.1,
  },
});
