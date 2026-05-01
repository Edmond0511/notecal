import { cmToFeetInches, feetInchesToCm, kgToLbs, lbsToKg } from '@/utils/goalsCalculator';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { UnitField } from '../UnitField';

interface Props {
  heightCm: number | null;
  weightKg: number | null;
  heightUnit: 'metric' | 'imperial';
  weightUnit: 'metric' | 'imperial';
  onChangeHeightCm: (cm: number | null) => void;
  onChangeWeightKg: (kg: number | null) => void;
  onChangeHeightUnit: (u: 'metric' | 'imperial') => void;
  onChangeWeightUnit: (u: 'metric' | 'imperial') => void;
}

const parseNum = (s: string): number | null => {
  if (s === '') return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : n;
};

export function StepBody({
  heightCm,
  weightKg,
  heightUnit,
  weightUnit,
  onChangeHeightCm,
  onChangeWeightKg,
  onChangeHeightUnit,
  onChangeWeightUnit,
}: Props) {
  const heightCmStr = heightCm == null ? '' : String(Math.round(heightCm));
  const { feet, inches } = useMemo(
    () => (heightCm == null ? { feet: 0, inches: 0 } : cmToFeetInches(heightCm)),
    [heightCm],
  );
  const feetStr = heightCm == null ? '' : String(feet);
  const inchesStr = heightCm == null ? '' : String(inches);

  const weightKgStr = weightKg == null ? '' : String(Math.round(weightKg));
  const weightLbsStr = weightKg == null ? '' : String(Math.round(kgToLbs(weightKg)));

  return (
    <View style={styles.container}>
      {heightUnit === 'metric' ? (
        <UnitField
          kind="single"
          label="Height"
          value={heightCmStr}
          onChangeValue={(s) => {
            const n = parseNum(s);
            onChangeHeightCm(n);
          }}
          unit="cm"
          unitOptions={['cm', 'ft']}
          onChangeUnit={(u) => onChangeHeightUnit(u === 'cm' ? 'metric' : 'imperial')}
        />
      ) : (
        <UnitField
          kind="split"
          label="Height"
          primary={feetStr}
          primaryUnit="ft"
          primaryOnChange={(s) => {
            const f = parseNum(s) ?? 0;
            const i = parseNum(inchesStr) ?? 0;
            onChangeHeightCm(feetInchesToCm(f, i));
          }}
          secondary={inchesStr}
          secondaryUnit="in"
          secondaryOnChange={(s) => {
            const f = parseNum(feetStr) ?? 0;
            const i = parseNum(s) ?? 0;
            onChangeHeightCm(feetInchesToCm(f, i));
          }}
          unit="ft"
          unitOptions={['cm', 'ft']}
          onChangeUnit={(u) => onChangeHeightUnit(u === 'cm' ? 'metric' : 'imperial')}
        />
      )}
      <UnitField
        kind="single"
        label="Weight"
        value={weightUnit === 'metric' ? weightKgStr : weightLbsStr}
        onChangeValue={(s) => {
          const n = parseNum(s);
          if (n == null) return onChangeWeightKg(null);
          onChangeWeightKg(weightUnit === 'metric' ? n : lbsToKg(n));
        }}
        unit={weightUnit === 'metric' ? 'kg' : 'lb'}
        unitOptions={['kg', 'lb']}
        onChangeUnit={(u) => onChangeWeightUnit(u === 'kg' ? 'metric' : 'imperial')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
});
