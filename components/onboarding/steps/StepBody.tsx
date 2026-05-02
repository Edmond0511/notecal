import { cmToFeetInches, feetInchesToCm, kgToLbs, lbsToKg } from '@/utils/goalsCalculator';
import React, { useEffect, useState } from 'react';
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

const cmToStr = (cm: number | null) => (cm == null ? '' : String(Math.round(cm)));
const cmToFeetStr = (cm: number | null) =>
  cm == null ? '' : String(cmToFeetInches(cm).feet);
const cmToInchesStr = (cm: number | null) =>
  cm == null ? '' : String(cmToFeetInches(cm).inches);
const kgToStr = (kg: number | null, unit: 'metric' | 'imperial') => {
  if (kg == null) return '';
  return unit === 'metric' ? String(Math.round(kg)) : String(Math.round(kgToLbs(kg)));
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
  // Local draft strings so typed values don't round-trip through unit conversion
  // (e.g., typing "13" in inches would normalize to "1 ft 1 in" without this).
  const [cmStr, setCmStr] = useState(() => cmToStr(heightCm));
  const [feetStr, setFeetStr] = useState(() => cmToFeetStr(heightCm));
  const [inchesStr, setInchesStr] = useState(() => cmToInchesStr(heightCm));
  const [weightStr, setWeightStr] = useState(() => kgToStr(weightKg, weightUnit));

  // When the unit toggles, resync drafts from canonical state in the new unit.
  useEffect(() => {
    setCmStr(cmToStr(heightCm));
    setFeetStr(cmToFeetStr(heightCm));
    setInchesStr(cmToInchesStr(heightCm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightUnit]);

  useEffect(() => {
    setWeightStr(kgToStr(weightKg, weightUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightUnit]);

  return (
    <View style={styles.container}>
      {heightUnit === 'metric' ? (
        <UnitField
          kind="single"
          label="Height"
          value={cmStr}
          onChangeValue={(s) => {
            setCmStr(s);
            onChangeHeightCm(parseNum(s));
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
            setFeetStr(s);
            const f = parseNum(s);
            const i = parseNum(inchesStr);
            if (f == null && i == null) {
              onChangeHeightCm(null);
            } else {
              onChangeHeightCm(feetInchesToCm(f ?? 0, i ?? 0));
            }
          }}
          secondary={inchesStr}
          secondaryUnit="in"
          secondaryOnChange={(s) => {
            setInchesStr(s);
            const f = parseNum(feetStr);
            const i = parseNum(s);
            if (f == null && i == null) {
              onChangeHeightCm(null);
            } else {
              onChangeHeightCm(feetInchesToCm(f ?? 0, i ?? 0));
            }
          }}
          unit="ft"
          unitOptions={['cm', 'ft']}
          onChangeUnit={(u) => onChangeHeightUnit(u === 'cm' ? 'metric' : 'imperial')}
        />
      )}
      <UnitField
        kind="single"
        label="Weight"
        value={weightStr}
        onChangeValue={(s) => {
          setWeightStr(s);
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
