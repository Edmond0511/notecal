import { UserGoals } from '@/types';
import { getActivityLevelDescription, getGoalTypeDescription } from '@/utils/goalsCalculator';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WizardFormData } from '../GoalsWizard';

interface Step5ReviewProps {
  goals: UserGoals | null;
  formData: WizardFormData;
}

export function Step5Review({ goals, formData }: Step5ReviewProps) {
  if (!goals) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Unable to calculate goals. Please go back and fill in all required fields.
        </Text>
      </View>
    );
  }

  const activityInfo = getActivityLevelDescription(goals.activityLevel);
  const goalInfo = getGoalTypeDescription(goals.goalType);

  // Format height display
  const heightDisplay = formData.useImperial
    ? `${formData.heightFeet}'${formData.heightInches}"`
    : `${goals.heightCm} cm`;

  // Format weight display
  const weightDisplay = formData.useImperial
    ? `${formData.weightLbs} lbs`
    : `${goals.weightKg} kg`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Personalized Targets</Text>
      <Text style={styles.subtitle}>
        Here's your daily nutrition plan based on your inputs
      </Text>

      {/* Main calorie target */}
      <View style={styles.mainTargetCard}>
        <View style={styles.mainTargetHeader}>
          <Ionicons name="flame" size={28} color="#FF5722" />
          <Text style={styles.mainTargetValue}>{goals.targetKcal}</Text>
          <Text style={styles.mainTargetUnit}>calories/day</Text>
        </View>
        <View style={styles.calculationBreakdown}>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>BMR</Text>
            <Text style={styles.breakdownValue}>{goals.bmr}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color="#ccc" />
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>TDEE</Text>
            <Text style={styles.breakdownValue}>{goals.tdee}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color="#ccc" />
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Target</Text>
            <Text style={[styles.breakdownValue, styles.breakdownValueHighlight]}>
              {goals.targetKcal}
            </Text>
          </View>
        </View>
      </View>

      {/* Macro targets */}
      <View style={styles.macrosCard}>
        <Text style={styles.cardTitle}>Daily Macros</Text>
        <View style={styles.macrosGrid}>
          <View style={[styles.macroItem, { backgroundColor: '#E3F2FD' }]}>
            <Ionicons name="fish" size={20} color="#1976D2" />
            <Text style={styles.macroValue}>{goals.targetProtein}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="water" size={20} color="#F57C00" />
            <Text style={styles.macroValue}>{goals.targetFat}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: '#F3E5F5' }]}>
            <Ionicons name="leaf" size={20} color="#7B1FA2" />
            <Text style={styles.macroValue}>{goals.targetCarbs}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
        </View>
      </View>

      {/* Summary of inputs */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>Your Profile</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Sex</Text>
            <Text style={styles.summaryValue}>
              {goals.sex === 'male' ? 'Male' : 'Female'}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Age</Text>
            <Text style={styles.summaryValue}>{goals.age} years</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Height</Text>
            <Text style={styles.summaryValue}>{heightDisplay}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Weight</Text>
            <Text style={styles.summaryValue}>{weightDisplay}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Activity</Text>
            <Text style={styles.summaryValue}>{activityInfo.title}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Goal</Text>
            <Text style={styles.summaryValue}>{goalInfo.title}</Text>
          </View>
        </View>
      </View>

      {/* Goal expectation */}
      <View style={styles.expectationBox}>
        <Ionicons name="trending-up" size={20} color="#4CAF50" />
        <Text style={styles.expectationText}>
          Expected: {goalInfo.weeklyChange}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
    padding: 20,
  },
  mainTargetCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  mainTargetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 16,
  },
  mainTargetValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#E65100',
  },
  mainTargetUnit: {
    fontSize: 16,
    color: '#FF8A65',
    fontWeight: '500',
  },
  calculationBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  breakdownValueHighlight: {
    color: '#E65100',
  },
  macrosCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  macrosGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  macroItem: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 6,
  },
  macroLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryItem: {
    width: '50%',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  expectationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  expectationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
});
