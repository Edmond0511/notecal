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

interface OtherNutrientDisplay {
  key: 'fiber' | 'sugar' | 'sodium' | 'potassium';
  label: string;
  unit: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const OTHER_NUTRIENTS: OtherNutrientDisplay[] = [
  { key: 'fiber', label: 'Fiber', unit: 'g', color: '#8B6914', icon: 'leaf-outline' },
  { key: 'sugar', label: 'Sugar', unit: 'g', color: '#C45BAA', icon: 'cube-outline' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', color: '#5B8CC4', icon: 'water-outline' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', color: '#6B8E5B', icon: 'flash-outline' },
];

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

  // Get enabled other nutrients
  const enabledOtherNutrients = OTHER_NUTRIENTS.filter(
    (n) => goals.manualTargets?.[n.key] !== undefined
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Personalized Targets</Text>
      <Text style={styles.subtitle}>
        Here's your daily nutrition plan based on your inputs
      </Text>

      {/* Main calorie target */}
      <View style={styles.mainTargetCard}>
        <View style={styles.mainTargetHeader}>
          <Ionicons name="flame" size={28} color="#FF6B35" />
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
            <Ionicons name="fish" size={20} color="#4A90D9" />
            <Text style={styles.macroValue}>{goals.targetProtein}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: '#FFF8E7' }]}>
            <Ionicons name="water" size={20} color="#F5A623" />
            <Text style={styles.macroValue}>{goals.targetFat}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
          <View style={[styles.macroItem, { backgroundColor: '#F3E5F5' }]}>
            <Ionicons name="leaf" size={20} color="#9B6B9E" />
            <Text style={styles.macroValue}>{goals.targetCarbs}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
        </View>
      </View>

      {/* Other nutrients (if any enabled) */}
      {enabledOtherNutrients.length > 0 && (
        <View style={styles.otherNutrientsCard}>
          <Text style={styles.cardTitle}>Other Nutrients</Text>
          <View style={styles.otherNutrientsGrid}>
            {enabledOtherNutrients.map((nutrient) => {
              const value = goals.manualTargets?.[nutrient.key];
              return (
                <View key={nutrient.key} style={styles.otherNutrientItem}>
                  <View style={[styles.nutrientDot, { backgroundColor: nutrient.color }]} />
                  <Text style={styles.otherNutrientLabel}>{nutrient.label}</Text>
                  <Text style={styles.otherNutrientValue}>
                    {value}
                    <Text style={styles.otherNutrientUnit}>{nutrient.unit}</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

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
        <Ionicons name="trending-up" size={20} color="#1A6872" />
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
    backgroundColor: '#FFE5D9',
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
    color: '#FF6B35',
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
    color: '#FF6B35',
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
  otherNutrientsCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  otherNutrientsGrid: {
    gap: 8,
  },
  otherNutrientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  nutrientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  otherNutrientLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  otherNutrientValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A6872',
  },
  otherNutrientUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888',
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
    backgroundColor: '#E0F2F1',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  expectationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A6872',
  },
});
