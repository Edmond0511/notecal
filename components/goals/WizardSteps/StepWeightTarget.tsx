import { Tokens } from '@/constants/theme';
import { StepWeightTarget as OnboardingStepWeightTarget } from '@/components/onboarding/steps/StepWeightTarget';
import { GoalType } from '@/types';
import { kgToLbs } from '@/utils/goalsCalculator';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WizardFormData } from '../GoalsWizard';

const WEEKS_PER_MONTH = 52 / 12;
const AGGRESSIVE_LOSS_KG_PER_WEEK = 0.9;
const AGGRESSIVE_GAIN_KG_PER_WEEK = 0.45;

interface StepWeightTargetProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
}

export function StepWeightTarget({
  formData,
  updateFormData,
}: StepWeightTargetProps) {
  const useImperial = formData.weightUseImperial;
  const weightUnit: 'metric' | 'imperial' = useImperial ? 'imperial' : 'metric';

  const currentWeightKg = useImperial
    ? (parseFloat(formData.weightLbs) || 0) * 0.453592
    : parseFloat(formData.weightKg) || 0;

  const targetWeightKg = useImperial
    ? (parseFloat(formData.targetWeightLbs) || 0) * 0.453592
    : parseFloat(formData.targetWeightKg) || 0;

  const timelineMonths = parseInt(formData.timelineMonths, 10) || 0;
  const timelineWeeks = timelineMonths > 0 ? timelineMonths * WEEKS_PER_MONTH : null;

  // Goal must be lose|gain here (goals wizard only renders this step then)
  const goal = (formData.goalType ?? 'lose') as Exclude<GoalType, 'maintain'>;

  const handleTargetChange = (kg: number | null) => {
    if (kg == null) {
      updateFormData({ targetWeightKg: '', targetWeightLbs: '' });
      return;
    }
    if (useImperial) {
      updateFormData({ targetWeightLbs: Math.round(kgToLbs(kg)).toString() });
    } else {
      updateFormData({ targetWeightKg: Math.round(kg).toString() });
    }
  };

  const handleTimelineChange = (weeks: number | null) => {
    if (weeks == null) {
      updateFormData({ timelineMonths: '' });
      return;
    }
    const months = Math.max(1, Math.round(weeks / WEEKS_PER_MONTH));
    updateFormData({ timelineMonths: months.toString() });
  };

  if (!currentWeightKg) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pick your target weight</Text>
        <Text style={styles.subtitle}>And when you want to reach it</Text>
        <Text style={styles.helperText}>Set your current weight first.</Text>
      </View>
    );
  }

  const weeklyRateKg =
    targetWeightKg && timelineWeeks && timelineWeeks > 0
      ? Math.abs(targetWeightKg - currentWeightKg) / timelineWeeks
      : 0;
  const aggressive =
    goal === 'lose'
      ? weeklyRateKg > AGGRESSIVE_LOSS_KG_PER_WEEK
      : weeklyRateKg > AGGRESSIVE_GAIN_KG_PER_WEEK;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your{`\n`}target weight</Text>
      <Text style={styles.subtitle}>And when you want to reach it</Text>

      <View style={styles.body}>
        <OnboardingStepWeightTarget
          goal={goal}
          currentWeightKg={currentWeightKg}
          weightUnit={weightUnit}
          targetWeightKg={targetWeightKg || null}
          timelineWeeks={timelineWeeks}
          onChangeTargetWeightKg={handleTargetChange}
          onChangeTimelineWeeks={handleTimelineChange}
        />

        {aggressive && (
          <View style={styles.cautionBox}>
            <Ionicons name="warning" size={16} color={Tokens.error} />
            <Text style={styles.cautionText}>
              {goal === 'lose'
                ? 'This pace exceeds ~0.9 kg/week (~2 lb/week). Consider a longer timeline for sustainable results.'
                : 'This pace exceeds ~0.45 kg/week (~1 lb/week). Consider a longer timeline to minimize fat gain.'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
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
  body: {
    paddingTop: 8,
  },
  helperText: {
    fontSize: 14,
    color: Tokens.textSecondary,
  },
  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Tokens.errorTint,
  },
  cautionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Tokens.error,
  },
});
