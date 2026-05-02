import { Tokens } from '@/constants/theme';
import { StepAge as OnboardingStepAge } from '@/components/onboarding/steps/StepAge';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Step2AgeProps {
  age: string;
  onChangeAge: (age: string) => void;
}

export function Step2Age({ age, onChangeAge }: Step2AgeProps) {
  const numericAge = age ? parseInt(age, 10) : null;
  const handleChange = (v: number | null) => {
    onChangeAge(v == null ? '' : v.toString());
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your age</Text>
      <Text style={styles.subtitle}>Helps tune your daily target</Text>
      <View style={styles.body}>
        <OnboardingStepAge value={numericAge} onChange={handleChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  title: {
    fontFamily: 'IBMPlexSans_700Bold',
    fontSize: 28,
    letterSpacing: -0.8,
    lineHeight: 32,
    color: Tokens.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'IBMPlexSans_400Regular',
    fontSize: 15,
    color: Tokens.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  body: { paddingTop: 4 },
});
