import { Tokens } from '@/constants/theme';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

const MIN_AGE = 13;
const MAX_AGE = 100;

function ageToBirthDate(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

function birthDateToAge(date: Date): number {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export function StepAge({ value, onChange }: Props) {
  const [birthDate, setBirthDate] = useState<Date>(() =>
    ageToBirthDate(value ?? 25),
  );

  const { minDate, maxDate } = useMemo(() => {
    const now = new Date();
    return {
      minDate: new Date(now.getFullYear() - MAX_AGE, now.getMonth(), now.getDate()),
      maxDate: new Date(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate()),
    };
  }, []);

  const handleChange = (_: DateTimePickerEvent, date?: Date) => {
    if (!date) return;
    setBirthDate(date);
    const age = birthDateToAge(date);
    if (age < MIN_AGE || age > MAX_AGE) {
      onChange(null);
      return;
    }
    onChange(age);
  };

  return (
    <View style={styles.card}>
      <DateTimePicker
        value={birthDate}
        mode="date"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        minimumDate={minDate}
        maximumDate={maxDate}
        onChange={handleChange}
        style={styles.picker}
        accessibilityLabel="Date of birth"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Tokens.background,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 200,
  },
});
