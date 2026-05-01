import { Tokens } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ProgressDots } from './ProgressDots';

interface Props {
  step: number;
  total: number;
  onBack: () => void;
  showBack: boolean;
}

export function StepHeader({ step, total, onBack, showBack }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {showBack && (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.chevronBtn}
          >
            <Ionicons name="chevron-back" size={24} color={Tokens.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
      <ProgressDots total={total} current={step} />
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  side: { width: 44, alignItems: 'flex-start' },
  chevronBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
});
