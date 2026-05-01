import { Tokens } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, loading }: Props) {
  const handle = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const isInactive = disabled || loading;
  return (
    <TouchableOpacity
      onPress={handle}
      activeOpacity={0.85}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.btn, isInactive && styles.btnDisabled]}
    >
      <View style={styles.spacer} />
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.label, isInactive && styles.labelDisabled]}>{label}</Text>
      )}
      <Ionicons
        name="arrow-forward"
        size={16}
        color={isInactive ? Tokens.textTertiary : '#fff'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Tokens.textPrimary,
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 20,
    width: '100%',
  },
  btnDisabled: {
    backgroundColor: Tokens.surface,
  },
  spacer: { width: 16 },
  label: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
    color: '#fff',
  },
  labelDisabled: {
    color: Tokens.textTertiary,
  },
});
