import { Tokens } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface SegmentToggleProps {
  options: [string, string];
  value: string;
  onChange: (v: string) => void;
}

function SegmentToggle({ options, value, onChange }: SegmentToggleProps) {
  return (
    <View style={styles.toggle}>
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => {
              if (!selected) {
                Haptics.selectionAsync();
                onChange(opt);
              }
            }}
            style={[styles.toggleSegment, selected && styles.toggleSegmentSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.toggleLabel, selected && styles.toggleLabelSelected]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface SingleProps {
  label: string;
  kind: 'single';
  value: string;
  onChangeValue: (v: string) => void;
  unit: string;
  unitOptions: [string, string];
  onChangeUnit: (u: string) => void;
}

interface SplitProps {
  label: string;
  kind: 'split';
  primary: string;
  primaryOnChange: (v: string) => void;
  primaryUnit: string;
  secondary: string;
  secondaryOnChange: (v: string) => void;
  secondaryUnit: string;
  unit: string;
  unitOptions: [string, string];
  onChangeUnit: (u: string) => void;
}

export type UnitFieldProps = SingleProps | SplitProps;

export function UnitField(props: UnitFieldProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.row}>
        {props.kind === 'single' ? (
          <View style={styles.inputGroup}>
            <TextInput
              value={props.value}
              onChangeText={props.onChangeValue}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="0"
              placeholderTextColor={Tokens.textTertiary}
            />
            <Text style={styles.unit}>{props.unit}</Text>
          </View>
        ) : (
          <View style={styles.inputGroup}>
            <TextInput
              value={props.primary}
              onChangeText={props.primaryOnChange}
              keyboardType="number-pad"
              style={[styles.input, styles.inputSplit]}
              placeholder="0"
              placeholderTextColor={Tokens.textTertiary}
            />
            <Text style={styles.unit}>{props.primaryUnit}</Text>
            <TextInput
              value={props.secondary}
              onChangeText={props.secondaryOnChange}
              keyboardType="number-pad"
              style={[styles.input, styles.inputSplit]}
              placeholder="0"
              placeholderTextColor={Tokens.textTertiary}
            />
            <Text style={styles.unit}>{props.secondaryUnit}</Text>
          </View>
        )}
        <SegmentToggle options={props.unitOptions} value={props.unit} onChange={props.onChangeUnit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Tokens.background,
    paddingVertical: 14,
    paddingHorizontal: 0,
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
  },
  inputGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: Tokens.textPrimary,
    padding: 0,
    minWidth: 36,
    textAlign: 'left',
    includeFontPadding: false,
  },
  inputSplit: {
    width: 48,
  },
  unit: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: '500',
    includeFontPadding: false,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Tokens.surface,
    borderRadius: 999,
    padding: 2,
    height: 28,
  },
  toggleSegment: {
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleSegmentSelected: {
    backgroundColor: Tokens.surfaceRaised,
    ...Tokens.shadowLight,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Tokens.textSecondary,
  },
  toggleLabelSelected: {
    color: Tokens.textPrimary,
  },
});
