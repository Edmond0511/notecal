import { Tokens } from '@/constants/theme';
import { StepBody as OnboardingStepBody } from '@/components/onboarding/steps/StepBody';
import { kgToLbs } from '@/utils/goalsCalculator';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WizardFormData } from '../GoalsWizard';

interface Step3BodyProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
}

export function Step3Body({ formData, updateFormData }: Step3BodyProps) {
  const heightCm = formData.heightCm ? parseFloat(formData.heightCm) : null;
  const weightKg = formData.weightUseImperial
    ? formData.weightLbs
      ? parseFloat(formData.weightLbs) * 0.453592
      : null
    : formData.weightKg
      ? parseFloat(formData.weightKg)
      : null;

  const heightUnit = formData.heightUseImperial ? 'imperial' : 'metric';
  const weightUnit = formData.weightUseImperial ? 'imperial' : 'metric';

  const handleHeightChange = (cm: number | null) => {
    if (cm == null) {
      updateFormData({ heightCm: '', heightFeet: '', heightInches: '' });
      return;
    }
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    updateFormData({
      heightCm: Math.round(cm).toString(),
      heightFeet: feet.toString(),
      heightInches: (inches === 12 ? 0 : inches).toString(),
    });
  };

  const handleWeightChange = (kg: number | null) => {
    if (kg == null) {
      updateFormData({ weightKg: '', weightLbs: '' });
      return;
    }
    updateFormData({
      weightKg: Math.round(kg).toString(),
      weightLbs: Math.round(kgToLbs(kg)).toString(),
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your height{`\n`}and weight</Text>
      <Text style={styles.subtitle}>Use the units you prefer</Text>
      <View style={styles.body}>
        <OnboardingStepBody
          heightCm={heightCm}
          weightKg={weightKg}
          heightUnit={heightUnit}
          weightUnit={weightUnit}
          onChangeHeightCm={handleHeightChange}
          onChangeWeightKg={handleWeightChange}
          onChangeHeightUnit={(u) =>
            updateFormData({ heightUseImperial: u === 'imperial' })
          }
          onChangeWeightUnit={(u) =>
            updateFormData({ weightUseImperial: u === 'imperial' })
          }
        />
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
